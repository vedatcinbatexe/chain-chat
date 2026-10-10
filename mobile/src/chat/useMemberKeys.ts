import { useQueries } from '@tanstack/react-query';
import type { Address, Hex } from 'viem';

import { useSystemInfo } from '@/api/system';
import { readRegistration } from '@/chain/registry';

export interface MemberKey {
  address: Address;
  username: string;
  encryptionKey: Hex;
}

/**
 * Usernames and encryption keys of several users, each read from the Registry contract — never from the
 * backend, so the server cannot slip in its own key for a group member (SDD §8.2).
 * `keys` is indexed by lowercase address and only contains users that are registered on-chain.
 */
export function useMemberKeys(addresses: string[]) {
  const system = useSystemInfo();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];

  const results = useQueries({
    queries: unique.map((address) => ({
      queryKey: ['registration', system.data?.chainId, address],
      enabled: !!system.data,
      queryFn: () => readRegistration(system.data!, address as Address),
      staleTime: 60_000,
    })),
  });

  const keys: Record<string, MemberKey> = {};
  results.forEach((result, index) => {
    const data = result.data;
    if (data?.registered && data.encryptionKey && data.username) {
      keys[unique[index]] = { address: unique[index] as Address, username: data.username, encryptionKey: data.encryptionKey };
    }
  });

  return {
    keys,
    /** True once every lookup has finished (successfully or not). */
    ready: !!system.data && results.every((r) => !r.isPending),
    isError: system.isError || results.some((r) => r.isError),
  };
}
