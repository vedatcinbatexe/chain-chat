import { createWalletClient, erc20Abi, http, isAddress, parseUnits, zeroAddress, type Address, type Hex } from 'viem';

import { authedRequest } from '@/api/authed';
import type { AssetInfo, SystemInfo } from '@/api/system';
import { env } from '@/config/env';
import { getAccount } from '@/wallet/walletStore';
import { getPublicClient } from './publicClient';
import { registryAbi } from './registry';

/**
 * Assets a wallet can hold and send: the chain's native ETH and the ERC-20 tokens the backend lists in
 * /api/v1/system/info (CHAT, tUSD, tBTC, …). Balances are read from the chain and transfers are signed on this
 * phone and sent straight to the chain — the server never holds the key (SDD §4.5).
 */
export type Asset = AssetInfo;

/** ETH kept back when sending "everything", so the wallet can still pay gas afterwards. */
export const GAS_RESERVE_WEI = parseUnits('0.002', 18);

/** Balance of every asset, in wei, by symbol. */
export async function readAssetBalances(system: SystemInfo, owner: Address): Promise<Record<string, bigint>> {
  const client = getPublicClient(system);
  const assets = system.assets ?? [];
  const values = await Promise.all(
    assets.map((asset) => (asset.address ? client.readContract({ address: asset.address, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }) : client.getBalance({ address: owner }))),
  );
  return Object.fromEntries(assets.map((asset, index) => [asset.symbol, values[index]]));
}

/** "12,5" or "12.5" → wei; null if it is not a positive amount with at most 18 decimals. */
export function parseAmountInput(input: string): bigint | null {
  const text = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,18})?$/.test(text)) return null;
  const wei = parseUnits(text, 18);
  return wei > 0n ? wei : null;
}

/** A wallet address, or the address a username is registered to in the Registry contract. Null if neither. */
export async function resolveRecipient(system: SystemInfo, input: string): Promise<{ address: Address; username: string | null } | null> {
  const value = input.trim();
  if (isAddress(value)) return { address: value, username: null };

  const username = value.replace(/^@/, '').toLowerCase();
  const registry = system.contracts.Registry;
  if (!registry || !/^[a-z0-9_]{3,20}$/.test(username)) return null;
  const [owner] = await getPublicClient(system).readContract({ address: registry, abi: registryAbi, functionName: 'resolveByName', args: [username] });
  return owner === zeroAddress ? null : { address: owner, username };
}

/**
 * Signs and submits a transfer of `amount` (wei) from this wallet to `to`; resolves with the transaction hash as
 * soon as it is submitted. In-chat payments use this and let both phones watch the receipt.
 */
export async function submitAssetTransfer(system: SystemInfo, asset: Asset, to: Address, amount: bigint): Promise<Hex> {
  const publicClient = getPublicClient(system);
  const account = getAccount();
  const wallet = createWalletClient({ account, chain: publicClient.chain, transport: http(env.rpcUrl) });

  if (!asset.address) return wallet.sendTransaction({ to, value: amount, chain: publicClient.chain ?? null });
  // Simulate first: reverts (e.g. not enough balance) come back as readable errors before any gas is spent.
  const { request } = await publicClient.simulateContract({ account, address: asset.address, abi: erc20Abi, functionName: 'transfer', args: [to, amount] });
  return wallet.writeContract(request);
}

/**
 * Sends `amount` (wei) of an asset from this wallet to `to` and waits until it is mined. Afterwards the server is
 * told the transaction hash; it reads the transfer from the chain itself, records it and notifies the recipient.
 * That report is a courtesy: the transfer is final whether or not it succeeds.
 */
export async function sendAsset(system: SystemInfo, asset: Asset, to: Address, amount: bigint): Promise<Hex> {
  const publicClient = getPublicClient(system);
  const hash = await submitAssetTransfer(system, asset, to, amount);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('The transaction was reverted.');

  await authedRequest('/api/v1/transfers/report', { method: 'POST', body: JSON.stringify({ txHash: hash }) }).catch((error) =>
    console.warn('The transfer was sent, but reporting it to the server failed', error),
  );
  return hash;
}
