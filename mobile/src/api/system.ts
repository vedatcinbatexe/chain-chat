import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';

import { apiRequest } from './client';

/** An asset wallets can hold and send. `address` is the ERC-20 contract, or null for the chain's native ETH. */
export interface AssetInfo {
  symbol: string;
  name: string;
  address: Address | null;
  decimals: number;
  /** The block the token was deployed in (0 for ETH): where reading its events starts. */
  deployBlock?: number;
}

/** Matches GET /api/v1/system/info (backend SystemEndpoints). */
export interface SystemInfo {
  network: string;
  chainId: number;
  /** Deployed contract addresses by name: Registry, ChatToken, ClassBadge, Anchor. Empty before deployment. */
  contracts: Partial<Record<'Registry' | 'ChatToken' | 'ClassBadge' | 'Anchor' | 'TestUSD' | 'TestBTC', Address>>;
  /** The block each contract was deployed in (or shortly before): where reading its events starts. */
  deployBlocks?: Partial<Record<'Registry' | 'ChatToken' | 'ClassBadge' | 'Anchor' | 'TestUSD' | 'TestBTC', number>>;
  /** ETH and the deployed ERC-20 tokens (CHAT, tUSD, tBTC, …). */
  assets?: AssetInfo[];
}

export const getSystemInfo = () => apiRequest<SystemInfo>('/api/v1/system/info');

/** Network and contract addresses, fetched once from the backend and cached for the session. */
export function useSystemInfo() {
  return useQuery({ queryKey: ['system-info'], queryFn: getSystemInfo, staleTime: Infinity });
}
