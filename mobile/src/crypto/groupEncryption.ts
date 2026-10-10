import nacl from 'tweetnacl';
import { bytesToHex, hexToBytes, hexToString, size, stringToHex, type Address, type Hex } from 'viem';

/**
 * Group message encryption (SDD §6.5), hybrid scheme:
 *   1. the text is encrypted once with a fresh random 32-byte message key (XSalsa20-Poly1305 secretbox);
 *   2. the message key is wrapped for every member with X25519 + XSalsa20-Poly1305 (box), using each member's
 *      encryption key from the Registry contract — including the sender, so they can read their own message.
 * Each wrapper is 72 bytes (24 nonce + 32 key + 16 tag), so a 20-member group adds about 1.4 KB per message.
 *
 * Wire format (the bytes that go into messageHash and to the server): UTF-8 JSON
 *   {"v":1,"n":"0x<24-byte nonce>","c":"0x<secretbox>","k":{"<member address, lowercase>":"0x<nonce ‖ box>", …}}
 */

export interface GroupRecipient {
  address: Address;
  /** The member's X25519 key as read from the Registry contract. */
  encryptionKey: Hex;
}

interface GroupEnvelope {
  v: 1;
  n: Hex;
  c: Hex;
  k: Record<string, Hex>;
}

export function encryptForGroup(plaintext: string, recipients: GroupRecipient[], senderSecretKey: Hex): Hex {
  if (recipients.length === 0) throw new Error('A group message needs at least one recipient');

  const messageKey = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const content = nacl.secretbox(new TextEncoder().encode(plaintext), nonce, messageKey);

  const keys: Record<string, Hex> = {};
  for (const recipient of recipients) {
    const wrapNonce = nacl.randomBytes(nacl.box.nonceLength);
    const wrapped = nacl.box(messageKey, wrapNonce, toKey(recipient.encryptionKey), toKey(senderSecretKey));
    const entry = new Uint8Array(wrapNonce.length + wrapped.length);
    entry.set(wrapNonce);
    entry.set(wrapped, wrapNonce.length);
    keys[recipient.address.toLowerCase()] = bytesToHex(entry);
  }

  const envelope: GroupEnvelope = { v: 1, n: bytesToHex(nonce), c: bytesToHex(content), k: keys };
  return stringToHex(JSON.stringify(envelope));
}

/**
 * Decrypts a group message for `me`. Returns null if `me` was not a recipient (e.g. joined later), or if the
 * message was tampered with or not encrypted by the holder of `senderPublicKey`.
 */
export function decryptGroupMessage(ciphertext: Hex, me: Address, senderPublicKey: Hex, mySecretKey: Hex): string | null {
  let envelope: GroupEnvelope;
  try {
    envelope = JSON.parse(hexToString(ciphertext)) as GroupEnvelope;
  } catch {
    return null;
  }
  if (envelope?.v !== 1 || typeof envelope.k !== 'object') return null;

  const entry = envelope.k[me.toLowerCase()];
  if (!entry || size(entry) < nacl.box.nonceLength + nacl.box.overheadLength) return null;

  try {
    const bytes = hexToBytes(entry);
    const messageKey = nacl.box.open(bytes.subarray(nacl.box.nonceLength), bytes.subarray(0, nacl.box.nonceLength), toKey(senderPublicKey), toKey(mySecretKey));
    if (!messageKey) return null;

    const plaintext = nacl.secretbox.open(hexToBytes(envelope.c), hexToBytes(envelope.n), messageKey);
    return plaintext ? new TextDecoder().decode(plaintext) : null;
  } catch {
    return null;
  }
}

/**
 * Whether the message carries a wrapped key for `me`. False for messages sent before `me` joined the group
 * (or after leaving): those were never encrypted to this key and cannot be read, by design.
 */
export function isGroupMessageFor(ciphertext: Hex, me: Address): boolean {
  try {
    const envelope = JSON.parse(hexToString(ciphertext)) as GroupEnvelope;
    return envelope?.v === 1 && typeof envelope.k === 'object' && me.toLowerCase() in envelope.k;
  } catch {
    return true; // not a readable envelope: let the chat show it as a message that failed to decrypt
  }
}

function toKey(key: Hex): Uint8Array {
  if (size(key) !== 32) throw new Error('Encryption keys must be 32 bytes');
  return hexToBytes(key);
}
