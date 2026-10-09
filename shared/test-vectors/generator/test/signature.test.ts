import { concat, keccak256, numberToHex, toHex } from "viem";
import { describe, expect, it } from "vitest";
import { SECP256K1_N, signingDigest, signMessageHash, splitSignature, verifyMessageSignature } from "../src/signature.js";

// Anvil's public development accounts #0 and #1 (independently known key -> address pairs).
const ALICE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ALICE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const BOB_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const hash = keccak256(toHex("a message hash"));

describe("signingDigest", () => {
  it("is keccak256 of the EIP-191 prefix followed by the 32-byte hash", () => {
    const prefix = toHex("\x19Ethereum Signed Message:\n32");
    expect(signingDigest(hash)).toBe(keccak256(concat([prefix, hash])));
  });
});

describe("signatures", () => {
  it("round-trips and recovers the known Anvil address", async () => {
    const signature = await signMessageHash(ALICE_KEY, hash);
    expect(await verifyMessageSignature(ALICE, hash, signature)).toEqual({ valid: true, signer: ALICE });
  });

  it("is deterministic (RFC 6979 nonces)", async () => {
    expect(await signMessageHash(ALICE_KEY, hash)).toBe(await signMessageHash(ALICE_KEY, hash));
  });

  it("produces 65-byte low-s signatures with v of 27 or 28", async () => {
    const { s, v } = splitSignature(await signMessageHash(ALICE_KEY, hash));
    expect(BigInt(s) <= SECP256K1_N / 2n).toBe(true);
    expect([27, 28]).toContain(v);
  });

  it("rejects the malleated high-s twin of a valid signature", async () => {
    const { r, s, v } = splitSignature(await signMessageHash(ALICE_KEY, hash));
    const twin = concat([r, numberToHex(SECP256K1_N - BigInt(s), { size: 32 }), numberToHex(v === 27 ? 28 : 27, { size: 1 })]);
    expect(await verifyMessageSignature(ALICE, hash, twin)).toEqual({ valid: false, reason: "high-s" });
  });

  it("rejects a signature from someone else", async () => {
    const signature = await signMessageHash(BOB_KEY, hash);
    expect(await verifyMessageSignature(ALICE, hash, signature)).toEqual({ valid: false, reason: "wrong-signer" });
  });

  it("rejects a signature over a different hash", async () => {
    const signature = await signMessageHash(ALICE_KEY, hash);
    const other = keccak256(toHex("another hash"));
    expect(await verifyMessageSignature(ALICE, other, signature)).toEqual({ valid: false, reason: "wrong-signer" });
  });

  it("rejects malformed signatures", async () => {
    const signature = await signMessageHash(ALICE_KEY, hash);
    expect(await verifyMessageSignature(ALICE, hash, signature.slice(0, -2) as `0x${string}`)).toEqual({
      valid: false,
      reason: "bad-length",
    });
    expect(await verifyMessageSignature(ALICE, hash, concat([signature.slice(0, -2) as `0x${string}`, "0x1d"]))).toEqual({
      valid: false,
      reason: "bad-v",
    });
  });
});
