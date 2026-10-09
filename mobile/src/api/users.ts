import { useQuery } from '@tanstack/react-query';
import type { Address, Hex } from 'viem';

import { authedRequest } from './authed';

/** Matches GET /api/v1/users/search. */
export interface UserSummary {
  address: Address;
  username: string;
}

/** Matches GET /api/v1/users/{address}. */
export interface UserProfile extends UserSummary {
  encryptionPublicKey: Hex;
  registeredAtBlock: number;
  registrationTxHash: Hex;
}

/** Same rule as the backend's UserSearch: a username prefix (a-z, 0-9, _) or a full 0x address. */
const SEARCHABLE = /^(@?[a-z0-9_]{1,20}|0x[0-9a-fA-F]{40})$/;

export const normalizeSearch = (text: string) => text.trim().replace(/^@/, '').toLowerCase();

export function useUserSearch(query: string) {
  const q = normalizeSearch(query);
  return useQuery({
    queryKey: ['user-search', q],
    enabled: SEARCHABLE.test(q),
    queryFn: () => authedRequest<UserSummary[]>(`/api/v1/users/search?q=${encodeURIComponent(q)}`),
    staleTime: 10_000,
  });
}

export function useUserProfile(address: string | undefined) {
  return useQuery({
    queryKey: ['user-profile', address?.toLowerCase()],
    enabled: !!address,
    queryFn: () => authedRequest<UserProfile>(`/api/v1/users/${address}`),
  });
}
