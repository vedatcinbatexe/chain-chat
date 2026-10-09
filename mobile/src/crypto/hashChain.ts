// Ported from shared/test-vectors/generator/src/hashChain.ts (Phase 3 reference implementation).
// Verified against shared/test-vectors/vectors by src/crypto/__tests__/vectors.test.ts.
import type { Hex } from "viem";
import { ZERO_HASH } from "./messageHash";

export type ChainLinkResult =
  | { valid: true }
  | { valid: false; reason: "bad-genesis" | "seq-gap" | "broken-link" };

/**
 * Checks that `next` directly follows `previous` in one sender's chain within one conversation (SPEC.md §4).
 * `previous` is null when `next` is the sender's first message in the conversation.
 */
export function checkChainLink(
  previous: { seq: bigint; messageHash: Hex } | null,
  next: { seq: bigint; prevHash: Hex },
): ChainLinkResult {
  if (previous === null) {
    return next.seq === 1n && next.prevHash === ZERO_HASH ? { valid: true } : { valid: false, reason: "bad-genesis" };
  }
  if (next.seq !== previous.seq + 1n) return { valid: false, reason: "seq-gap" };
  if (next.prevHash.toLowerCase() !== previous.messageHash.toLowerCase()) return { valid: false, reason: "broken-link" };
  return { valid: true };
}
