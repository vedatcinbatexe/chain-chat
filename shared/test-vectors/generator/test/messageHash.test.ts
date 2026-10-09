import { concat, keccak256, numberToHex, pad, size, toHex, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { directConversationId } from "../src/conversationId.js";
import { checkChainLink } from "../src/hashChain.js";
import { encodeMessage, messageHash, UINT64_MAX, ZERO_HASH, type MessageHeader } from "../src/messageHash.js";

const ALICE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const BOB = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const header: MessageHeader = {
  conversationId: directConversationId(ALICE, BOB),
  sender: ALICE,
  seq: 1n,
  prevHash: ZERO_HASH,
  ciphertext: toHex("hello"),
  clientTimestamp: 1767225600000n,
};

describe("directConversationId", () => {
  it("is the same no matter who starts the chat", () => {
    expect(directConversationId(ALICE, BOB)).toBe(directConversationId(BOB, ALICE));
  });

  it("ignores address letter case", () => {
    expect(directConversationId(ALICE.toLowerCase() as Hex, BOB)).toBe(directConversationId(ALICE, BOB));
  });

  it("matches a hand-built encoding: lower address first, each padded to 32 bytes", () => {
    // 0x7099… < 0xf39F…, so Bob's address comes first.
    const manual = keccak256(concat([pad(BOB.toLowerCase() as Hex), pad(ALICE.toLowerCase() as Hex)]));
    expect(directConversationId(ALICE, BOB)).toBe(manual);
  });

  it("rejects a conversation with yourself", () => {
    expect(() => directConversationId(ALICE, ALICE)).toThrow();
  });
});

describe("messageHash", () => {
  it("encodes six 32-byte words (192 bytes)", () => {
    expect(size(encodeMessage(header))).toBe(192);
  });

  it("matches a hand-built abi.encode", () => {
    const manual = concat([
      header.conversationId,
      pad(ALICE.toLowerCase() as Hex),
      numberToHex(header.seq, { size: 32 }),
      header.prevHash,
      keccak256(header.ciphertext),
      numberToHex(header.clientTimestamp, { size: 32 }),
    ]);
    expect(encodeMessage(header)).toBe(manual);
    expect(messageHash(header)).toBe(keccak256(manual));
  });

  it("changes when any single field changes", () => {
    const base = messageHash(header);
    const variants: Partial<MessageHeader>[] = [
      { conversationId: keccak256(toHex("other")) },
      { sender: BOB },
      { seq: 2n, prevHash: base },
      { ciphertext: toHex("hellp") },
      { clientTimestamp: header.clientTimestamp + 1n },
    ];
    for (const variant of variants) {
      expect(messageHash({ ...header, ...variant })).not.toBe(base);
    }
  });

  it("rejects invalid headers", () => {
    expect(() => messageHash({ ...header, seq: 0n })).toThrow();
    expect(() => messageHash({ ...header, seq: UINT64_MAX + 1n, prevHash: keccak256("0x01") })).toThrow();
    expect(() => messageHash({ ...header, ciphertext: "0x" })).toThrow();
    expect(() => messageHash({ ...header, prevHash: keccak256("0x01") })).toThrow(); // seq 1 needs zero prevHash
    expect(() => messageHash({ ...header, seq: 2n })).toThrow(); // seq > 1 needs a real prevHash
    expect(() => messageHash({ ...header, conversationId: "0x1234" })).toThrow();
  });
});

describe("checkChainLink", () => {
  const h1 = messageHash(header);

  it("accepts a correct genesis and link", () => {
    expect(checkChainLink(null, { seq: 1n, prevHash: ZERO_HASH })).toEqual({ valid: true });
    expect(checkChainLink({ seq: 1n, messageHash: h1 }, { seq: 2n, prevHash: h1 })).toEqual({ valid: true });
  });

  it("detects gaps, broken links and bad genesis", () => {
    expect(checkChainLink(null, { seq: 2n, prevHash: h1 })).toEqual({ valid: false, reason: "bad-genesis" });
    expect(checkChainLink({ seq: 1n, messageHash: h1 }, { seq: 3n, prevHash: h1 })).toEqual({ valid: false, reason: "seq-gap" });
    expect(checkChainLink({ seq: 1n, messageHash: h1 }, { seq: 2n, prevHash: ZERO_HASH })).toEqual({
      valid: false,
      reason: "broken-link",
    });
  });
});
