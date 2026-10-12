import { useQuery } from '@tanstack/react-query';
import { createWalletClient, erc20Abi, http, parseAbi, parseEventLogs, zeroAddress, type Address, type Hex } from 'viem';

import { useSystemInfo, type AssetInfo, type SystemInfo } from '@/api/system';
import { env } from '@/config/env';
import { getAccount } from '@/wallet/walletStore';
import { getPublicClient } from './publicClient';

/**
 * The SwapDesk contract (contracts/src/SwapDesk.sol, SDD §6.9): peer-to-peer swaps offered in a chat and settled
 * on-chain. The maker locks what they give in the contract; whoever accepts pays the maker and receives the
 * locked asset in the same transaction. A test compares this ABI with shared/deployments/abi/SwapDesk.json.
 */
export const swapDeskAbi = parseAbi([
  'function createOrder(address sellToken, uint256 sellAmount, address buyToken, uint256 buyAmount, uint64 expiry) payable returns (uint256 id)',
  'function fillOrder(uint256 id) payable',
  'function cancelOrder(uint256 id)',
  'function getOrder(uint256 id) view returns ((address maker, address taker, address sellToken, uint256 sellAmount, address buyToken, uint256 buyAmount, uint64 expiry, uint8 status))',
  'event OrderCreated(uint256 indexed id, address indexed maker, address sellToken, uint256 sellAmount, address buyToken, uint256 buyAmount, uint64 expiry)',
  'event OrderFilled(uint256 indexed id, address indexed maker, address indexed taker)',
  'event OrderCancelled(uint256 indexed id, address indexed maker)',
  'error InvalidAmount()',
  'error SameAsset()',
  'error InvalidExpiry()',
  'error WrongValue(uint256 expected, uint256 sent)',
  'error UnknownOrder(uint256 id)',
  'error OrderNotOpen(uint256 id)',
  'error OrderExpired(uint256 id)',
  'error NotMaker()',
  'error OwnOrder()',
  'error EthTransferFailed()',
]);

export type SwapStatus = 'open' | 'expired' | 'filled' | 'cancelled';

/** An order as the contract holds it — the truth about a swap, whatever a chat message claims. */
export interface SwapOrder {
  id: bigint;
  maker: Address;
  taker: Address | null;
  /** What the maker gives. */
  sell: { asset: AssetInfo | null; token: Address; amount: bigint };
  /** What the maker wants in return. */
  buy: { asset: AssetInfo | null; token: Address; amount: bigint };
  /** Unix time in milliseconds. */
  expiresAt: number;
  status: SwapStatus;
}

function deskAddress(system: SystemInfo): Address {
  const address = system.contracts.SwapDesk;
  if (!address) throw new Error(`The swap desk is not deployed on ${system.network}.`);
  return address;
}

/** The contract uses the zero address for ETH. */
const tokenOf = (asset: AssetInfo): Address => asset.address ?? zeroAddress;
const assetOf = (system: SystemInfo, token: Address) =>
  (system.assets ?? []).find((asset) => (asset.address ?? zeroAddress).toLowerCase() === token.toLowerCase()) ?? null;

export async function readSwapOrder(system: SystemInfo, id: bigint): Promise<SwapOrder> {
  const order = await getPublicClient(system).readContract({ address: deskAddress(system), abi: swapDeskAbi, functionName: 'getOrder', args: [id] });
  const expiresAt = Number(order.expiry) * 1000;
  // 1 = Open, 2 = Filled, 3 = Cancelled (SwapDesk.Status).
  const status: SwapStatus = order.status === 2 ? 'filled' : order.status === 3 ? 'cancelled' : expiresAt < Date.now() ? 'expired' : 'open';
  return {
    id,
    maker: order.maker,
    taker: order.taker === zeroAddress ? null : order.taker,
    sell: { asset: assetOf(system, order.sellToken), token: order.sellToken, amount: order.sellAmount },
    buy: { asset: assetOf(system, order.buyToken), token: order.buyToken, amount: order.buyAmount },
    expiresAt,
    status,
  };
}

/** An order's state, read from the chain and refreshed while it is still open. */
export function useSwapOrder(id: string | null) {
  const system = useSystemInfo();
  return useQuery({
    queryKey: ['swap-order', system.data?.chainId, id],
    enabled: !!system.data && !!id,
    queryFn: () => readSwapOrder(system.data!, BigInt(id!)),
    refetchInterval: (query) => (query.state.data && query.state.data.status !== 'open' ? false : 4_000),
  });
}

/** Lets the swap desk take `amount` of a token from this wallet, if it is not allowed to already. */
async function approveIfNeeded(system: SystemInfo, token: Address, amount: bigint) {
  const publicClient = getPublicClient(system);
  const account = getAccount();
  const desk = deskAddress(system);

  const allowance = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account.address, desk] });
  if (allowance >= amount) return;

  const { request } = await publicClient.simulateContract({ account, address: token, abi: erc20Abi, functionName: 'approve', args: [desk, amount] });
  const hash = await createWalletClient({ account, chain: publicClient.chain, transport: http(env.rpcUrl) }).writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
}

/**
 * Creates a swap order and locks the offered asset in the contract. Resolves with the order id once mined.
 * Two transactions for a token (approve, then create), one for ETH.
 */
export async function createSwapOrder(
  system: SystemInfo,
  sell: { asset: AssetInfo; amount: bigint },
  buy: { asset: AssetInfo; amount: bigint },
  expiresAt: number,
): Promise<{ id: bigint; txHash: Hex }> {
  const publicClient = getPublicClient(system);
  const account = getAccount();
  if (sell.asset.address) await approveIfNeeded(system, sell.asset.address, sell.amount);

  // Simulate first: reverts come back as readable contract errors before any gas is spent.
  const { request } = await publicClient.simulateContract({
    account,
    address: deskAddress(system),
    abi: swapDeskAbi,
    functionName: 'createOrder',
    args: [tokenOf(sell.asset), sell.amount, tokenOf(buy.asset), buy.amount, BigInt(Math.floor(expiresAt / 1000))],
    value: sell.asset.address ? 0n : sell.amount,
  });
  const txHash = await createWalletClient({ account, chain: publicClient.chain, transport: http(env.rpcUrl) }).writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') throw new Error('The transaction was reverted.');

  const created = parseEventLogs({ abi: swapDeskAbi, eventName: 'OrderCreated', logs: receipt.logs })[0];
  if (!created) throw new Error('The order was not created.');
  return { id: created.args.id, txHash };
}

/** Accepts an order: pays the maker and receives the locked asset in one transaction. */
export async function fillSwapOrder(system: SystemInfo, order: SwapOrder): Promise<Hex> {
  const publicClient = getPublicClient(system);
  const account = getAccount();
  const payInEth = order.buy.token === zeroAddress;
  if (!payInEth) await approveIfNeeded(system, order.buy.token, order.buy.amount);

  const { request } = await publicClient.simulateContract({
    account,
    address: deskAddress(system),
    abi: swapDeskAbi,
    functionName: 'fillOrder',
    args: [order.id],
    value: payInEth ? order.buy.amount : 0n,
  });
  const hash = await createWalletClient({ account, chain: publicClient.chain, transport: http(env.rpcUrl) }).writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('The transaction was reverted.');
  return hash;
}

/** Withdraws the maker's own open order; the locked asset comes back. */
export async function cancelSwapOrder(system: SystemInfo, id: bigint): Promise<Hex> {
  const publicClient = getPublicClient(system);
  const account = getAccount();
  const { request } = await publicClient.simulateContract({ account, address: deskAddress(system), abi: swapDeskAbi, functionName: 'cancelOrder', args: [id] });
  const hash = await createWalletClient({ account, chain: publicClient.chain, transport: http(env.rpcUrl) }).writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('The transaction was reverted.');
  return hash;
}
