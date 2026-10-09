import * as SecureStore from 'expo-secure-store';
import type { Hex } from 'viem';

/**
 * Secrets live only in the OS keystore (iOS Keychain / Android Keystore) — never in app state,
 * logs or the backend (SDD §8.1). WHEN_UNLOCKED_THIS_DEVICE_ONLY keeps them out of iCloud backups
 * and other devices.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const KEYS = {
  walletPrivateKey: 'chainchat.wallet.privateKey',
  encryptionSecretKey: 'chainchat.encryption.secretKey',
} as const;

export interface StoredSecrets {
  /** secp256k1 wallet key — signs transactions, SIWE logins and messages. */
  walletPrivateKey: Hex;
  /** X25519 key — decrypts messages. Separate from the wallet key (SDD §5.4). */
  encryptionSecretKey: Hex;
}

export async function saveSecrets(secrets: StoredSecrets): Promise<void> {
  await SecureStore.setItemAsync(KEYS.walletPrivateKey, secrets.walletPrivateKey, OPTIONS);
  await SecureStore.setItemAsync(KEYS.encryptionSecretKey, secrets.encryptionSecretKey, OPTIONS);
}

export async function loadSecrets(): Promise<StoredSecrets | null> {
  const walletPrivateKey = await SecureStore.getItemAsync(KEYS.walletPrivateKey, OPTIONS);
  const encryptionSecretKey = await SecureStore.getItemAsync(KEYS.encryptionSecretKey, OPTIONS);
  if (!walletPrivateKey || !encryptionSecretKey) return null;
  return { walletPrivateKey: walletPrivateKey as Hex, encryptionSecretKey: encryptionSecretKey as Hex };
}

export async function deleteSecrets(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.walletPrivateKey, OPTIONS);
  await SecureStore.deleteItemAsync(KEYS.encryptionSecretKey, OPTIONS);
}
