// Ported from shared/test-vectors/generator/src/messageHash.ts (Phase 3 reference implementation).
// Verified against shared/test-vectors/vectors by src/crypto/__tests__/vectors.test.ts.
import { encodeAbiParameters, getAddress, keccak256, size, type Address, type Hex } from "viem";

/** 32 zero bytes — the `prevHash` of a sender's first message in a conversation. */
export const ZERO_HASH: Hex = `0x${"00".repeat(32)}`;

export const UINT64_MAX = 2n ** 64n - 1n;

/** The header a sender builds, hashes and signs for every message (SPEC.md §3). */
export interface MessageHeader {
  /** bytes32 — see directConversationId() for 1:1 chats, random 32 bytes for groups. */
  conversationId: Hex;
  /** The sender's wallet address. */
  sender: Address;
  /** uint64 — the sender's message counter in this conversation, starting at 1. */
  seq: bigint;
  /** bytes32 — messageHash of the sender's previous message in this conversation, ZERO_HASH for seq 1. */
  prevHash: Hex;
  /** The encrypted payload exactly as sent over the wire (opaque bytes). */
  ciphertext: Hex;
  /** uint64 — milliseconds since the Unix epoch, set by the sender's device. */
  clientTimestamp: bigint;
}

const MESSAGE_ABI = [
  { name: "conversationId", type: "bytes32" },
  { name: "sender", type: "address" },
  { name: "seq", type: "uint64" },
  { name: "prevHash", type: "bytes32" },
  { name: "ciphertextHash", type: "bytes32" },
  { name: "clientTimestamp", type: "uint64" },
] as const;

/** keccak256 of the raw ciphertext bytes. */
export function ciphertextHash(ciphertext: Hex): Hex {
  return keccak256(ciphertext);
}

/**
 * abi.encode of the six header fields: every field is padded to 32 bytes, so the result is always 192 bytes.
 * Exposed separately so other implementations can compare the exact bytes before hashing.
 */
export function encodeMessage(header: MessageHeader): Hex {
  validateHeader(header);
  return encodeAbiParameters(MESSAGE_ABI, [
    header.conversationId,
    getAddress(header.sender),
    header.seq,
    header.prevHash,
    ciphertextHash(header.ciphertext),
    header.clientTimestamp,
  ]);
}

/** messageHash = keccak256(abi.encode(conversationId, sender, seq, prevHash, keccak256(ciphertext), clientTimestamp)) */
export function messageHash(header: MessageHeader): Hex {
  return keccak256(encodeMessage(header));
}

function validateHeader(header: MessageHeader): void {
  if (size(header.conversationId) !== 32) throw new Error("conversationId must be 32 bytes");
  if (size(header.prevHash) !== 32) throw new Error("prevHash must be 32 bytes");
  if (size(header.ciphertext) === 0) throw new Error("ciphertext must not be empty");
  if (header.seq < 1n || header.seq > UINT64_MAX) throw new Error("seq must be in [1, 2^64 - 1]");
  if (header.clientTimestamp < 0n || header.clientTimestamp > UINT64_MAX) {
    throw new Error("clientTimestamp must be a uint64");
  }
  if (header.seq === 1n && header.prevHash !== ZERO_HASH) {
    throw new Error("The first message (seq 1) must have prevHash = ZERO_HASH");
  }
  if (header.seq > 1n && header.prevHash === ZERO_HASH) {
    throw new Error("Only the first message (seq 1) may have prevHash = ZERO_HASH");
  }
}
