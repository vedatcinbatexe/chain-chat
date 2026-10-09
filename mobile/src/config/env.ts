import Constants from 'expo-constants';

/**
 * In development the phone loads the app from Metro on the developer's Mac, so the Mac's LAN address is
 * known from the dev server URL. The API and the local Anvil chain run on that same Mac (infra/local).
 */
const devHost = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';

/**
 * Connection settings. Override with EXPO_PUBLIC_* variables (e.g. in mobile/.env) for demo mode on
 * Base Sepolia. Network, chain id and contract addresses are not configured here — they come from the
 * backend's /api/v1/system/info, so there is a single source of truth.
 */
export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? `http://${devHost}:5080`,
  rpcUrl: process.env.EXPO_PUBLIC_RPC_URL ?? `http://${devHost}:8545`,
  /** Block explorer base URL (e.g. https://sepolia.basescan.org); none for local Anvil. */
  explorerUrl: process.env.EXPO_PUBLIC_EXPLORER_URL ?? null,
} as const;
