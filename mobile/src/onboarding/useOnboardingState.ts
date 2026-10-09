import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';

import { useSystemInfo } from '@/api/system';
import { readRegistration } from '@/chain/registry';
import { useWalletStore } from '@/wallet/walletStore';

export type OnboardingState =
  | { kind: 'no-wallet' }
  | { kind: 'checking' }
  | { kind: 'error'; message: string; retry: () => void }
  /** Wallet exists but has no username on-chain yet. */
  | { kind: 'needs-registration' }
  /** Registered, but with another device's encryption key (e.g. an imported wallet) — must rotate it. */
  | { kind: 'needs-key-update'; username: string }
  | { kind: 'complete'; username: string };

export const registrationQueryKey = (chainId: number | undefined, address: Address | null) => ['registration', chainId, address];

/**
 * Where the user is in onboarding. The registration is read from the Registry contract — the chain is the
 * source of truth for identity, so a compromised backend cannot fake it (SDD §2.2).
 */
export function useOnboardingState(): OnboardingState {
  const status = useWalletStore((state) => state.status);
  const address = useWalletStore((state) => state.address);
  const encryptionPublicKey = useWalletStore((state) => state.encryptionPublicKey);
  const system = useSystemInfo();

  const registration = useQuery({
    queryKey: registrationQueryKey(system.data?.chainId, address),
    enabled: status === 'ready' && !!system.data && !!address,
    queryFn: () => readRegistration(system.data!, address!),
  });

  if (status !== 'ready') return status === 'loading' ? { kind: 'checking' } : { kind: 'no-wallet' };

  if (system.isError) {
    return { kind: 'error', message: 'Cannot reach the ChainChat server.', retry: () => system.refetch() };
  }
  if (registration.isError) {
    return { kind: 'error', message: registration.error.message, retry: () => registration.refetch() };
  }
  if (!registration.data) return { kind: 'checking' };

  const { registered, username, encryptionKey } = registration.data;
  if (!registered || !username) return { kind: 'needs-registration' };
  if (encryptionKey?.toLowerCase() !== encryptionPublicKey?.toLowerCase()) return { kind: 'needs-key-update', username };
  return { kind: 'complete', username };
}
