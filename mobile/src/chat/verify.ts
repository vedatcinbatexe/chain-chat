import type { Address, Hex } from 'viem';

import type { MessageDto } from '@/api/conversations';
import { checkChainLink, decrypt, messageHash, verifyMessageSignature } from '@/crypto';

export interface VerifiedMessage {
  dto: MessageDto;
  mine: boolean;
  /** Decrypted text, or null if it could not be decrypted (tampered, or encrypted to another key). */
  text: string | null;
  /** The sender's wallet signed exactly this content (hash recomputed on this phone, not taken from the server). */
  signatureValid: boolean;
  /** This message links to the sender's previous one; false means a message was deleted, reordered or injected. */
  chainIntact: boolean;
  /** messageHash recomputed on this phone from the message's fields — what anchoring proofs are checked against. */
  recomputedHash: Hex | null;
}

/**
 * Checks every message independently of the server (SDD §6.3 step 7, §8.2): recompute the hash from the
 * fields, verify the sender's signature over it, check each sender's hash chain, then decrypt.
 * `messages` must be in server order (oldest first).
 */
export async function verifyMessages(
  messages: MessageDto[],
  me: Address,
  peerEncryptionKey: Hex,
  mySecretKey: Hex,
): Promise<VerifiedMessage[]> {
  const lastBySender = new Map<string, { seq: bigint; messageHash: Hex }>();

  return Promise.all(
    messages.map(async (dto) => {
      const sender = dto.sender.toLowerCase();
      const header = {
        conversationId: dto.conversationId,
        sender: dto.sender,
        seq: BigInt(dto.seq),
        prevHash: dto.prevHash,
        ciphertext: dto.ciphertext,
        clientTimestamp: BigInt(dto.clientTimestamp),
      };

      let recomputed: Hex | null = null;
      try {
        recomputed = messageHash(header);
      } catch {
        recomputed = null;
      }

      // Chain check runs synchronously in order, before the first await, so `lastBySender` follows server order.
      const previous = lastBySender.get(sender);
      const link = { seq: header.seq, prevHash: header.prevHash };
      // The first loaded message of a sender can only be checked if it is their genesis message (older history is not loaded).
      const chainIntact = previous ? checkChainLink(previous, link).valid : header.seq === 1n ? checkChainLink(null, link).valid : true;
      if (recomputed) lastBySender.set(sender, { seq: header.seq, messageHash: recomputed });

      const hashMatches = recomputed !== null && recomputed.toLowerCase() === dto.messageHash.toLowerCase();
      const signature = recomputed ? await verifyMessageSignature(dto.sender, recomputed, dto.signature) : { valid: false };

      return {
        dto,
        mine: sender === me.toLowerCase(),
        // NaCl box uses one shared key for both directions, so the same call decrypts sent and received messages.
        text: decrypt(dto.ciphertext, peerEncryptionKey, mySecretKey),
        signatureValid: hashMatches && signature.valid,
        chainIntact,
        recomputedHash: recomputed,
      };
    }),
  );
}
