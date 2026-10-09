import { create } from 'zustand';
import type { Address, Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

import { useSessionStore } from '@/auth/sessionStore';
import { encryptionKeyPairFromSecret, generateEncryptionKeyPair, type EncryptionKeyPair } from '@/crypto';
import { deleteSecrets, loadSecrets, saveSecrets, type StoredSecrets } from './storage';

export type WalletStatus = 'loading' | 'empty' | 'ready';

interface WalletState {
  status: WalletStatus;
  /** Public values only — safe to render. Secrets stay in the module-level `session` below. */
  address: Address | null;
  encryptionPublicKey: Hex | null;

  /** Loads an existing wallet from secure storage on app start. */
  load: () => Promise<void>;
  /** Creates a brand-new wallet and encryption key pair. */
  create: () => Promise<void>;
  /** Imports an existing wallet key (e.g. a seeded test wallet) and creates a new encryption key pair. */
  importPrivateKey: (privateKey: string) => Promise<void>;
  /** Deletes the keys from this device. Without a backup, the identity is gone. */
  remove: () => Promise<void>;
}

/** Unlocked keys for the running session. Deliberately not in Zustand state, so they never reach UI or dev tools. */
let session: { account: PrivateKeyAccount; encryption: EncryptionKeyPair } | null = null;

/** The signer for transactions, SIWE and message signatures. Throws if no wallet is loaded. */
export function getAccount(): PrivateKeyAccount {
  if (!session) throw new Error('No wallet is loaded');
  return session.account;
}

/** The X25519 key pair used to decrypt incoming messages. Throws if no wallet is loaded. */
export function getEncryptionKeyPair(): EncryptionKeyPair {
  if (!session) throw new Error('No wallet is loaded');
  return session.encryption;
}

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export const useWalletStore = create<WalletState>()((set) => {
  const unlock = (secrets: StoredSecrets) => {
    session = {
      account: privateKeyToAccount(secrets.walletPrivateKey),
      encryption: encryptionKeyPairFromSecret(secrets.encryptionSecretKey),
    };
    set({ status: 'ready', address: session.account.address, encryptionPublicKey: session.encryption.publicKey });
  };

  const persistAndUnlock = async (walletPrivateKey: Hex) => {
    // A fresh encryption key pair is always created on this device. If an imported wallet was already
    // registered with another key, it is rotated on-chain with Registry.updateKey during onboarding (Phase 9).
    const secrets: StoredSecrets = { walletPrivateKey, encryptionSecretKey: generateEncryptionKeyPair().secretKey };
    await saveSecrets(secrets);
    unlock(secrets);
  };

  return {
    status: 'loading',
    address: null,
    encryptionPublicKey: null,

    load: async () => {
      try {
        const secrets = await loadSecrets();
        if (secrets) unlock(secrets);
        else set({ status: 'empty' });
      } catch (error) {
        console.warn('Could not read the wallet from secure storage', error);
        set({ status: 'empty' });
      }
    },

    create: () => persistAndUnlock(generatePrivateKey()),

    importPrivateKey: async (privateKey) => {
      const key = privateKey.trim();
      const normalized = (key.startsWith('0x') ? key : `0x${key}`) as Hex;
      if (!PRIVATE_KEY_PATTERN.test(normalized)) {
        throw new Error('A private key is 64 hexadecimal characters, optionally starting with 0x.');
      }
      privateKeyToAccount(normalized); // throws if the key is outside the secp256k1 range
      await persistAndUnlock(normalized);
    },

    remove: async () => {
      await deleteSecrets();
      session = null;
      useSessionStore.getState().setSession(null);
      set({ status: 'empty', address: null, encryptionPublicKey: null });
    },
  };
});
