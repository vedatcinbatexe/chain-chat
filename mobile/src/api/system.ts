import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';

import { apiRequest } from './client';

/** Matches GET /api/v1/system/info (backend SystemEndpoints). */
export interface SystemInfo {
  network: string;
  chainId: number;
  /** Deployed contract addresses by name: Registry, ChatToken, ClassBadge, Anchor. Empty before deployment. */
  contracts: Partial<Record<'Registry' | 'ChatToken' | 'ClassBadge' | 'Anchor', Address>>;
}

export const getSystemInfo = () => apiRequest<SystemInfo>('/api/v1/system/info');

/** Network and contract addresses, fetched once from the backend and cached for the session. */
export function useSystemInfo() {
  return useQuery({ queryKey: ['system-info'], queryFn: getSystemInfo, staleTime: Infinity });
}
