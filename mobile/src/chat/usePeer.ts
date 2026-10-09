import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';

import { useSystemInfo } from '@/api/system';
import { readRegistration } from '@/chain/registry';
import type { Peer } from './send';

/**
 * The peer's username and encryption key, read from the Registry contract — never from the backend, so a
 * compromised server cannot swap the key and read the messages (SDD §8.2, man-in-the-middle).
 */
export function usePeer(address: string | undefined) {
  const system = useSystemInfo();
  const registration = useQuery({
    queryKey: ['registration', system.data?.chainId, address],
    enabled: !!system.data && !!address,
    queryFn: () => readRegistration(system.data!, address as Address),
  });

  const data = registration.data;
  const peer: (Peer & { username: string }) | null =
    data?.registered && data.encryptionKey && data.username
      ? { address: address as Address, encryptionKey: data.encryptionKey, username: data.username }
      : null;

  return { peer, isLoading: system.isPending || registration.isPending, isError: system.isError || registration.isError, notRegistered: data?.registered === false, refetch: registration.refetch };
}

/** "14:05" today, "12 Oct" before that. */
export function formatMessageTime(milliseconds: number): string {
  const date = new Date(milliseconds);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
