import nacl from 'tweetnacl';
import { bytesToHex, hexToBytes, size, type Hex } from 'viem';

/**
 * End-to-end encryption (SDD §6.3): X25519 key agreement + XSalsa20-Poly1305 (NaCl `box`).
 *
 * Ciphertext wire format: nonce (24 bytes) ‖ box (plaintext length + 16-byte Poly1305 tag).
 * This byte string is what the sender hashes into `messageHash` (SPEC.md §3) and what the server stores.
 */

export interface EncryptionKeyPair {
  /** 32-byte X25519 public key — registered on-chain in the Registry contract. */
  publicKey: Hex;
  /** 32-byte X25519 secret key — never leaves the device. */
  secretKey: Hex;
}

const NONCE_LENGTH = nacl.box.nonceLength; // 24
const MIN_CIPHERTEXT_LENGTH = NONCE_LENGTH + nacl.box.overheadLength; // 24 + 16

export function generateEncryptionKeyPair(): EncryptionKeyPair {
  const pair = nacl.box.keyPair();
  return { publicKey: bytesToHex(pair.publicKey), secretKey: bytesToHex(pair.secretKey) };
}

/** Restores the key pair from a stored secret key. */
export function encryptionKeyPairFromSecret(secretKey: Hex): EncryptionKeyPair {
  const pair = nacl.box.keyPair.fromSecretKey(toKey(secretKey));
  return { publicKey: bytesToHex(pair.publicKey), secretKey };
}

/** Encrypts `plaintext` so only the holder of `recipientPublicKey`'s secret key can read it. */
export function encrypt(plaintext: string, recipientPublicKey: Hex, senderSecretKey: Hex): Hex {
  const nonce = nacl.randomBytes(NONCE_LENGTH);
  const box = nacl.box(new TextEncoder().encode(plaintext), nonce, toKey(recipientPublicKey), toKey(senderSecretKey));

  const ciphertext = new Uint8Array(NONCE_LENGTH + box.length);
  ciphertext.set(nonce);
  ciphertext.set(box, NONCE_LENGTH);
  return bytesToHex(ciphertext);
}

/** Decrypts a ciphertext from `senderPublicKey`. Returns null if it was tampered with or not meant for this key. */
export function decrypt(ciphertext: Hex, senderPublicKey: Hex, recipientSecretKey: Hex): string | null {
  if (size(ciphertext) < MIN_CIPHERTEXT_LENGTH) return null;

  const bytes = hexToBytes(ciphertext);
  const opened = nacl.box.open(bytes.subarray(NONCE_LENGTH), bytes.subarray(0, NONCE_LENGTH), toKey(senderPublicKey), toKey(recipientSecretKey));
  return opened === null ? null : new TextDecoder().decode(opened);
}

function toKey(key: Hex): Uint8Array {
  if (size(key) !== 32) throw new Error('Encryption keys must be 32 bytes');
  return hexToBytes(key);
}
