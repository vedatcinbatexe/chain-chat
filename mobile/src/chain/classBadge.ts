import { useQueries, useQuery } from '@tanstack/react-query';
import { createWalletClient, http, parseAbi, type Address, type Hex } from 'viem';

import { useSystemInfo, type SystemInfo } from '@/api/system';
import { env } from '@/config/env';
import { getAccount } from '@/wallet/walletStore';
import { getPublicClient } from './publicClient';

/**
 * The parts of the ClassBadge contract the app uses (contracts/src/ClassBadge.sol): ERC-721 badges, each with a
 * badge type such as "Student". A test compares this with shared/deployments/abi/ClassBadge.json so they cannot
 * drift apart.
 */
export const classBadgeAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function totalMinted() view returns (uint256)',
  'function badgeTypeCount() view returns (uint256)',
  'function badgeTypeName(uint256 typeId) view returns (string)',
  'function typeOf(uint256 tokenId) view returns (uint256)',
  'function balanceOfType(address owner, uint256 typeId) view returns (uint256)',
  'function holdsAll(address owner, uint256[] typeIds) view returns (bool)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]);

type System = Pick<SystemInfo, 'chainId' | 'network' | 'contracts'>;

/** A kind of badge, e.g. { id: 1, name: "Student" }. */
export interface BadgeType {
  id: number;
  name: string;
}

/** One badge (NFT) a wallet holds. */
export interface OwnedBadge {
  tokenId: bigint;
  type: BadgeType;
}

/** All badge types defined in the contract, read from the chain. */
export async function readBadgeTypes(system: System, contract: Address): Promise<BadgeType[]> {
  const client = getPublicClient(system);
  const count = Number(await client.readContract({ address: contract, abi: classBadgeAbi, functionName: 'badgeTypeCount' }));
  const ids = Array.from({ length: count }, (_, index) => index + 1);
  const names = await Promise.all(ids.map((id) => client.readContract({ address: contract, abi: classBadgeAbi, functionName: 'badgeTypeName', args: [BigInt(id)] })));
  return ids.map((id, index) => ({ id, name: names[index] }));
}

/** The badges `owner` holds. Badges are numbered 1..totalMinted, so every owner is checked. */
export async function readOwnedBadges(system: System, contract: Address, owner: Address): Promise<OwnedBadge[]> {
  const client = getPublicClient(system);
  const [total, types] = await Promise.all([client.readContract({ address: contract, abi: classBadgeAbi, functionName: 'totalMinted' }), readBadgeTypes(system, contract)]);
  const ids = Array.from({ length: Number(total) }, (_, index) => BigInt(index + 1));
  const owners = await Promise.all(ids.map((tokenId) => client.readContract({ address: contract, abi: classBadgeAbi, functionName: 'ownerOf', args: [tokenId] })));
  const mine = ids.filter((_, index) => owners[index].toLowerCase() === owner.toLowerCase());
  const typeIds = await Promise.all(mine.map((tokenId) => client.readContract({ address: contract, abi: classBadgeAbi, functionName: 'typeOf', args: [tokenId] })));
  return mine.map((tokenId, index) => ({
    tokenId,
    type: types.find((t) => t.id === Number(typeIds[index])) ?? { id: Number(typeIds[index]), name: `Badge #${typeIds[index]}` },
  }));
}

/** Every badge type that exists (for choosing a group's requirements). Empty when badges are not deployed. */
export function useBadgeTypes() {
  const system = useSystemInfo();
  const contract = system.data?.contracts.ClassBadge;
  return useQuery({
    queryKey: ['badge-types', system.data?.chainId, contract?.toLowerCase()],
    enabled: !!system.data,
    queryFn: () => (contract ? readBadgeTypes(system.data!, contract) : Promise.resolve([] as BadgeType[])),
    staleTime: 30_000,
  });
}

/** The badges `owner` holds right now. */
export function useOwnedBadges(owner: Address | null | undefined) {
  const system = useSystemInfo();
  const contract = system.data?.contracts.ClassBadge;
  return useQuery({
    queryKey: ['badge', 'owned', system.data?.chainId, contract?.toLowerCase(), owner?.toLowerCase()],
    enabled: !!system.data && !!owner,
    queryFn: () => (contract ? readOwnedBadges(system.data!, contract, owner!) : Promise.resolve([] as OwnedBadge[])),
    staleTime: 10_000,
  });
}

/**
 * Transfers one of this wallet's badges to `to` and waits until it is mined. A wallet that no longer holds every
 * badge a group requires loses access to that group (SDD §6.5).
 */
export async function transferBadge(system: System, to: Address, tokenId: bigint): Promise<Hex> {
  const contract = system.contracts.ClassBadge;
  if (!contract) throw new Error(`ClassBadge is not deployed on ${system.network}.`);

  const publicClient = getPublicClient(system);
  const account = getAccount();
  // Simulate first: reverts come back as readable contract errors before any gas is spent.
  const { request } = await publicClient.simulateContract({ account, address: contract, abi: classBadgeAbi, functionName: 'transferFrom', args: [account.address, to, tokenId] });
  const hash = await createWalletClient({ account, chain: publicClient.chain, transport: http(env.rpcUrl) }).writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Which of `addresses` hold every badge type in `typeIds` right now, each read from the chain — never from the
 * backend, so a server that adds someone without the badges to a gated group gains nothing: apps do not encrypt
 * to them (SDD §6.5). `holders` contains lowercase addresses.
 */
export function useBadgeHolders(contract: Address | null | undefined, typeIds: number[], addresses: string[]) {
  const system = useSystemInfo();
  const gated = !!contract && typeIds.length > 0;
  const unique = gated ? [...new Set(addresses.map((a) => a.toLowerCase()))] : [];
  const types = typeIds.join(',');

  const results = useQueries({
    queries: unique.map((address) => ({
      queryKey: ['badge', 'holds', system.data?.chainId, contract?.toLowerCase(), types, address],
      enabled: !!system.data && gated,
      queryFn: () =>
        getPublicClient(system.data!).readContract({ address: contract!, abi: classBadgeAbi, functionName: 'holdsAll', args: [address as Address, typeIds.map(BigInt)] }),
      // Badges can be transferred at any time: re-check often while the group is open.
      staleTime: 10_000,
      refetchInterval: 15_000,
    })),
  });

  const holders = new Set(unique.filter((_, index) => results[index].data === true));
  return {
    holders,
    /** True once every member was checked (always true for groups without badge requirements). */
    ready: !gated || (!!system.data && results.every((r) => !r.isPending)),
  };
}
