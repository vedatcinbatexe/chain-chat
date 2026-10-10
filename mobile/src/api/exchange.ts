import { useQuery } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import type { Address } from 'viem';

import { apiRequest } from './client';

/** A wallet of the simulated exchange portal (SDD §4.5). Balances are wei as decimal strings, read from the chain. */
export interface ExchangeWallet {
  address: Address;
  label: string;
  balances: Record<string, string>;
}

/** Same rule as the portal: 2–32 characters of a-z, 0-9, - and _. */
export const EXCHANGE_ACCOUNT_PATTERN = /^[a-z0-9_-]{2,32}$/;

const ACCOUNT_KEY = 'chainchat.exchange.account';

/** The exchange account name the user linked on this phone (it is only a name, not a secret). */
export const loadExchangeAccount = () => SecureStore.getItemAsync(ACCOUNT_KEY);

export const saveExchangeAccount = (account: string | null) =>
  account ? SecureStore.setItemAsync(ACCOUNT_KEY, account) : SecureStore.deleteItemAsync(ACCOUNT_KEY);

/** The wallets of an exchange account — the places a withdrawal can go. */
export function useExchangeWallets(account: string | null) {
  return useQuery({
    queryKey: ['exchange-wallets', account],
    enabled: !!account,
    queryFn: () => apiRequest<ExchangeWallet[]>(`/api/v1/exchange/accounts/${encodeURIComponent(account!)}/wallets`),
    refetchInterval: 10_000,
  });
}
