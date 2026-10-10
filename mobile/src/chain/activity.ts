import { useQuery } from '@tanstack/react-query';
import { parseAbi, zeroAddress, type Address, type Hex } from 'viem';

import { authedRequest } from '@/api/authed';
import { useSystemInfo, type SystemInfo } from '@/api/system';
import { anchorAbi } from './anchor';
import { classBadgeAbi, readBadgeTypes } from './classBadge';
import { getPublicClient } from './publicClient';
import { readRegistration } from './registry';

/**
 * Everything a wallet did on-chain in ChainChat, rebuilt from contract events read directly from the chain
 * (SDD §2.1) — the server is not asked what happened. The one exception is plain ETH transfers (gas drip, admin
 * funding): they emit no event, so the server names the transactions and each one is then read from the chain.
 */
const events = parseAbi([
  'event UserRegistered(address indexed user, string username, bytes32 encryptionKey)',
  'event KeyUpdated(address indexed user, bytes32 encryptionKey)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event FaucetClaimed(address indexed account, uint256 amount)',
]);
const [userRegistered, keyUpdated, tokenTransfer, faucetClaimed] = events;
const badgeTransfer = classBadgeAbi.find((item) => item.type === 'event' && item.name === 'Transfer')!;
const rootAnchored = anchorAbi.find((item) => item.type === 'event' && item.name === 'RootAnchored')!;

export type ActivityKind =
  | 'registered'
  | 'key-updated'
  | 'token-sent'
  | 'token-received'
  | 'token-faucet'
  | 'token-minted'
  | 'badge-minted'
  | 'badge-received'
  | 'badge-sent'
  | 'eth-received'
  | 'eth-sent';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  txHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  /** Block time in milliseconds; null if the block could not be read. */
  timestamp: number | null;
  /** Token or ETH amount in wei. */
  amount?: bigint;
  /** The asset the amount is in: ETH, CHAT, tUSD, … */
  symbol?: string;
  counterparty?: Address;
  /** The counterparty's username from the Registry contract, if registered. */
  counterpartyName?: string | null;
  badge?: { tokenId: bigint; name: string };
  username?: string;
}

export interface AnchorActivity {
  batchId: bigint;
  root: Hex;
  fromMessageId: bigint;
  toMessageId: bigint;
  txHash: Hex;
  blockNumber: bigint;
  timestamp: number | null;
}

/** What an ERC-20 Transfer event means for `me`. Mints come from the zero address: the faucet, or an admin or the exchange. */
export function classifyTokenTransfer(transfer: { from: Address; to: Address; txHash: Hex }, me: Address, faucetTxs: ReadonlySet<string>): { kind: ActivityKind; counterparty?: Address } {
  const mine = me.toLowerCase();
  if (transfer.from.toLowerCase() === mine) return { kind: 'token-sent', counterparty: transfer.to };
  if (transfer.from === zeroAddress) return { kind: faucetTxs.has(transfer.txHash.toLowerCase()) ? 'token-faucet' : 'token-minted' };
  return { kind: 'token-received', counterparty: transfer.from };
}

/** What a badge Transfer event means for `me`. */
export function classifyBadgeTransfer(transfer: { from: Address; to: Address }, me: Address): { kind: ActivityKind; counterparty?: Address } {
  if (transfer.from.toLowerCase() === me.toLowerCase()) return { kind: 'badge-sent', counterparty: transfer.to };
  return transfer.from === zeroAddress ? { kind: 'badge-minted' } : { kind: 'badge-received', counterparty: transfer.from };
}

interface EthHint {
  txHash: Hex;
  kind: string;
}

const MAX_ITEMS = 100;

export async function readActivity(system: SystemInfo, me: Address, ethHints: EthHint[]): Promise<ActivityItem[]> {
  const client = getPublicClient(system);
  const { Registry, ChatToken, ClassBadge } = system.contracts;
  const from = (name: 'Registry' | 'ChatToken' | 'ClassBadge') => BigInt(system.deployBlocks?.[name] ?? 0);
  // Every ERC-20 asset (CHAT, tUSD, tBTC, …); an older backend without an asset list still gets CHAT.
  const tokens = (system.assets ?? (ChatToken ? [{ symbol: 'CHAT', name: 'ChainChat Token', address: ChatToken, decimals: 18, deployBlock: system.deployBlocks?.ChatToken }] : [])).filter((asset) => asset.address !== null);
  const none = Promise.resolve([] as never[]);

  const [registered, keys, faucet, badgesOut, badgesIn, tokenLogs] = await Promise.all([
    Registry ? client.getLogs({ address: Registry, event: userRegistered, args: { user: me }, fromBlock: from('Registry') }) : none,
    Registry ? client.getLogs({ address: Registry, event: keyUpdated, args: { user: me }, fromBlock: from('Registry') }) : none,
    ChatToken ? client.getLogs({ address: ChatToken, event: faucetClaimed, args: { account: me }, fromBlock: from('ChatToken') }) : none,
    ClassBadge ? client.getLogs({ address: ClassBadge, event: badgeTransfer, args: { from: me }, fromBlock: from('ClassBadge') }) : none,
    ClassBadge ? client.getLogs({ address: ClassBadge, event: badgeTransfer, args: { to: me }, fromBlock: from('ClassBadge') }) : none,
    Promise.all(
      tokens.map(async (token) => {
        const [sent, received] = await Promise.all([
          client.getLogs({ address: token.address!, event: tokenTransfer, args: { from: me }, fromBlock: BigInt(token.deployBlock ?? 0) }),
          client.getLogs({ address: token.address!, event: tokenTransfer, args: { to: me }, fromBlock: BigInt(token.deployBlock ?? 0) }),
        ]);
        return { symbol: token.symbol, logs: [...sent, ...received] };
      }),
    ),
  ]);

  const base = (log: { transactionHash: Hex; blockNumber: bigint; logIndex: number }) => ({
    id: `${log.transactionHash}-${log.logIndex}`,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    timestamp: null,
  });

  const items: ActivityItem[] = [];
  for (const log of registered) items.push({ ...base(log), kind: 'registered', username: log.args.username });
  for (const log of keys) items.push({ ...base(log), kind: 'key-updated' });

  const faucetTxs = new Set(faucet.map((log) => log.transactionHash.toLowerCase()));
  for (const { symbol, logs } of tokenLogs) {
    for (const log of logs) {
      const { from: sender, to, value } = log.args;
      if (!sender || !to) continue;
      items.push({ ...base(log), ...classifyTokenTransfer({ from: sender, to, txHash: log.transactionHash }, me, faucetTxs), amount: value, symbol });
    }
  }

  // Badges: the type of each badge is read from the contract.
  const badgeLogs = [...badgesOut, ...badgesIn];
  if (ClassBadge && badgeLogs.length > 0) {
    const types = await readBadgeTypes(system, ClassBadge);
    const tokenIds = [...new Set(badgeLogs.map((log) => log.args.tokenId!))];
    const typeIds = await Promise.all(tokenIds.map((tokenId) => client.readContract({ address: ClassBadge, abi: classBadgeAbi, functionName: 'typeOf', args: [tokenId] })));
    const nameOf = (tokenId: bigint) => types.find((type) => type.id === Number(typeIds[tokenIds.indexOf(tokenId)]))?.name ?? 'Badge';
    for (const log of badgeLogs) {
      const { from: sender, to, tokenId } = log.args;
      if (!sender || !to || tokenId === undefined) continue;
      items.push({ ...base(log), ...classifyBadgeTransfer({ from: sender, to }, me), badge: { tokenId, name: nameOf(tokenId) } });
    }
  }

  // ETH transfers named by the server: shown only if the transaction exists on-chain and really moves ETH to or
  // from this wallet.
  const ethTransfers = await Promise.all(ethHints.map((hint) => client.getTransaction({ hash: hint.txHash }).catch(() => null)));
  for (const tx of ethTransfers) {
    if (!tx || tx.blockNumber === null || !tx.to || tx.value === 0n) continue;
    const received = tx.to.toLowerCase() === me.toLowerCase();
    if (!received && tx.from.toLowerCase() !== me.toLowerCase()) continue;
    items.push({
      id: `${tx.hash}-eth`,
      kind: received ? 'eth-received' : 'eth-sent',
      txHash: tx.hash,
      blockNumber: tx.blockNumber,
      logIndex: -1,
      timestamp: null,
      amount: tx.value,
      symbol: 'ETH',
      counterparty: received ? tx.from : tx.to,
    });
  }

  // A transfer to yourself appears in both directions: keep one.
  const unique = [...new Map(items.map((item) => [item.id, item])).values()]
    .sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1))
    .slice(0, MAX_ITEMS);

  const [timestamps, names] = await Promise.all([blockTimes(system, unique.map((item) => item.blockNumber)), usernames(system, unique.flatMap((item) => (item.counterparty ? [item.counterparty] : [])))]);
  return unique.map((item) => ({
    ...item,
    timestamp: timestamps.get(item.blockNumber) ?? null,
    counterpartyName: item.counterparty ? (names.get(item.counterparty.toLowerCase()) ?? null) : undefined,
  }));
}

/** The most recent anchor batches: Merkle roots of message history written to the Anchor contract (SDD §6.6). */
export async function readAnchors(system: SystemInfo, limit = 20): Promise<AnchorActivity[]> {
  const anchor = system.contracts.Anchor;
  if (!anchor) return [];
  const logs = await getPublicClient(system).getLogs({ address: anchor, event: rootAnchored, fromBlock: BigInt(system.deployBlocks?.Anchor ?? 0) });
  const recent = logs.slice(-limit).reverse();
  const timestamps = await blockTimes(system, recent.map((log) => log.blockNumber));
  return recent.map((log) => ({
    batchId: log.args.batchId!,
    root: log.args.root!,
    fromMessageId: log.args.fromMessageId!,
    toMessageId: log.args.toMessageId!,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    timestamp: timestamps.get(log.blockNumber) ?? null,
  }));
}

async function blockTimes(system: SystemInfo, blockNumbers: bigint[]): Promise<Map<bigint, number>> {
  const client = getPublicClient(system);
  const unique = [...new Set(blockNumbers)];
  const blocks = await Promise.all(unique.map((blockNumber) => client.getBlock({ blockNumber }).catch(() => null)));
  return new Map(blocks.flatMap((block, index) => (block ? [[unique[index], Number(block.timestamp) * 1000] as const] : [])));
}

async function usernames(system: SystemInfo, addresses: Address[]): Promise<Map<string, string>> {
  const unique = [...new Set(addresses.map((address) => address.toLowerCase()))];
  const registrations = await Promise.all(unique.map((address) => readRegistration(system, address as Address).catch(() => null)));
  return new Map(registrations.flatMap((registration, index) => (registration?.username ? [[unique[index], registration.username] as const] : [])));
}

export function useActivity(me: Address | null | undefined) {
  const system = useSystemInfo();
  return useQuery({
    queryKey: ['activity', system.data?.chainId, me?.toLowerCase()],
    enabled: !!system.data && !!me,
    queryFn: async () => {
      // Hints only: if the server is unreachable, the on-chain events are still shown.
      const hints = await authedRequest<EthHint[]>('/api/v1/activity/eth').catch(() => [] as EthHint[]);
      return readActivity(system.data!, me!, hints);
    },
    refetchInterval: 15_000,
  });
}

export function useAnchors() {
  const system = useSystemInfo();
  return useQuery({
    queryKey: ['activity-anchors', system.data?.chainId],
    enabled: !!system.data,
    queryFn: () => readAnchors(system.data!),
    refetchInterval: 15_000,
  });
}
