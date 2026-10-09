import { createWalletClient, http, parseAbi, parseEventLogs, TransactionReceiptNotFoundError, type Address, type Hex, type TransactionReceipt } from 'viem';

import type { SystemInfo } from '@/api/system';
import { env } from '@/config/env';
import { getAccount } from '@/wallet/walletStore';
import { getPublicClient } from './publicClient';

/**
 * The parts of the ChatToken contract the app uses (contracts/src/ChatToken.sol).
 * A test compares this with shared/deployments/abi/ChatToken.json so they cannot drift apart.
 */
export const chatTokenAbi = parseAbi([
  'function transfer(address to, uint256 value) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function faucet()',
  'function lastFaucetClaim(address account) view returns (uint256)',
  'function FAUCET_AMOUNT() view returns (uint256)',
  'function FAUCET_COOLDOWN() view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'error FaucetCooldown(uint256 availableAt)',
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
]);

type System = Pick<SystemInfo, 'chainId' | 'network' | 'contracts'>;

export function chatTokenAddress(system: System): Address {
  const address = system.contracts.ChatToken;
  if (!address) throw new Error(`ChatToken is not deployed on ${system.network}.`);
  return address;
}

async function write(system: System, functionName: 'transfer' | 'faucet', args: readonly unknown[]): Promise<Hex> {
  const publicClient = getPublicClient(system);
  const account = getAccount();
  // Simulate first: reverts come back as readable contract errors before any gas is spent.
  const { request } = await publicClient.simulateContract({ account, address: chatTokenAddress(system), abi: chatTokenAbi, functionName, args: args as never });
  return createWalletClient({ account, chain: publicClient.chain, transport: http(env.rpcUrl) }).writeContract(request);
}

/** Sends `amount` (in wei) of CHAT from this wallet directly to the chain. Resolves with the tx hash once submitted. */
export const transferChat = (system: System, to: Address, amount: bigint) => write(system, 'transfer', [to, amount]);

/** Claims 100 test CHAT from the token's faucet (once per day per address) and waits until it is mined. */
export async function claimFaucet(system: System): Promise<Hex> {
  const hash = await write(system, 'faucet', []);
  await getPublicClient(system).waitForTransactionReceipt({ hash });
  return hash;
}

/** When this address can use the faucet again (null = now). */
export async function faucetAvailableAt(system: System, address: Address): Promise<Date | null> {
  const client = getPublicClient(system);
  const token = chatTokenAddress(system);
  const [last, cooldown] = await Promise.all([
    client.readContract({ address: token, abi: chatTokenAbi, functionName: 'lastFaucetClaim', args: [address] }),
    client.readContract({ address: token, abi: chatTokenAbi, functionName: 'FAUCET_COOLDOWN' }),
  ]);
  const availableAt = Number(last + cooldown) * 1000;
  return last === 0n || availableAt <= Date.now() ? null : new Date(availableAt);
}

/** The receipt of a transaction, or null if it is not mined (or does not exist). */
export async function readReceipt(system: System, hash: Hex): Promise<TransactionReceipt | null> {
  try {
    return await getPublicClient(system).getTransactionReceipt({ hash });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) return null;
    throw error;
  }
}

/** ChatToken Transfer events in a receipt (events of other contracts are ignored). */
export function chatTokenTransfers(receipt: TransactionReceipt, token: Address) {
  return parseEventLogs({ abi: chatTokenAbi, eventName: 'Transfer', logs: receipt.logs })
    .filter((log) => log.address.toLowerCase() === token.toLowerCase())
    .map((log) => ({ from: log.args.from, to: log.args.to, value: log.args.value }));
}
