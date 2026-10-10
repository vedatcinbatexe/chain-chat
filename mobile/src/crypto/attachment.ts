import nacl from 'tweetnacl';
import { bytesToHex, hexToBytes, keccak256, size, type Hex } from 'viem';

/**
 * Encryption of message attachments — voice messages (SDD §6.8).
 *   1. The file is encrypted on the phone with a fresh random 32-byte key (XSalsa20-Poly1305 secretbox).
 *   2. Only the ciphertext (nonce ‖ box) is uploaded; the server cannot read it.
 *   3. The key and the keccak256 fingerprint of the ciphertext travel inside the chat message, which is
 *      end-to-end encrypted, signed, hash-chained and anchored like any other message.
 * So only the chat's participants can open the file, and a file that was changed or swapped on the server no
 * longer matches the fingerprint in the signed message.
 */
export interface EncryptedAttachment {
  /** nonce (24 bytes) ‖ secretbox — the bytes to upload. */
  blob: Uint8Array;
  /** The file key; goes into the encrypted chat message, never to the server. */
  key: Hex;
  /** keccak256 of `blob`; goes into the signed chat message. */
  hash: Hex;
}

export function encryptAttachment(content: Uint8Array): EncryptedAttachment {
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(content, nonce, key);

  const blob = new Uint8Array(nonce.length + box.length);
  blob.set(nonce);
  blob.set(box, nonce.length);
  return { blob, key: bytesToHex(key), hash: keccak256(blob) };
}

export type AttachmentResult = { ok: true; content: Uint8Array } | { ok: false; reason: 'tampered' | 'undecryptable' };

/**
 * Checks the downloaded bytes against the fingerprint from the signed message, then decrypts them.
 * `tampered`: the server returned different bytes than the sender uploaded.
 */
export function decryptAttachment(blob: Uint8Array, key: Hex, expectedHash: Hex): AttachmentResult {
  if (keccak256(blob).toLowerCase() !== expectedHash.toLowerCase()) return { ok: false, reason: 'tampered' };
  if (size(key) !== nacl.secretbox.keyLength || blob.length < nacl.secretbox.nonceLength + nacl.secretbox.overheadLength) return { ok: false, reason: 'undecryptable' };

  const content = nacl.secretbox.open(blob.subarray(nacl.secretbox.nonceLength), blob.subarray(0, nacl.secretbox.nonceLength), hexToBytes(key));
  return content ? { ok: true, content } : { ok: false, reason: 'undecryptable' };
}
