import { recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { formatSiweMessage, type SiweFields } from "../src/siwe.js";

const ALICE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const fields: SiweFields = {
  domain: "chainchat.local",
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  statement: "Sign in to ChainChat with your wallet.",
  uri: "chainchat://app",
  chainId: 31337,
  nonce: "k3Jd8aQ2pLx9Zr7T",
  issuedAt: "2026-01-01T00:00:00.000Z",
  expirationTime: "2026-01-01T00:05:00.000Z",
};

describe("formatSiweMessage", () => {
  it("produces the EIP-4361 layout, line by line", () => {
    expect(formatSiweMessage(fields).split("\n")).toEqual([
      "chainchat.local wants you to sign in with your Ethereum account:",
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      "",
      "Sign in to ChainChat with your wallet.",
      "",
      "URI: chainchat://app",
      "Version: 1",
      "Chain ID: 31337",
      "Nonce: k3Jd8aQ2pLx9Zr7T",
      "Issued At: 2026-01-01T00:00:00.000Z",
      "Expiration Time: 2026-01-01T00:05:00.000Z",
    ]);
  });

  it("is signed with personal_sign and recovers the signer", async () => {
    const message = formatSiweMessage(fields);
    const signature = await privateKeyToAccount(ALICE_KEY).signMessage({ message });
    expect(await recoverMessageAddress({ message, signature })).toBe(fields.address);
  });

  it("rejects a non-checksummed address", () => {
    expect(() => formatSiweMessage({ ...fields, address: fields.address.toLowerCase() as `0x${string}` })).toThrow();
  });

  it("rejects a short or non-alphanumeric nonce", () => {
    expect(() => formatSiweMessage({ ...fields, nonce: "short" })).toThrow();
    expect(() => formatSiweMessage({ ...fields, nonce: "has-dashes-123" })).toThrow();
  });

  it("rejects a multi-line statement", () => {
    expect(() => formatSiweMessage({ ...fields, statement: "line one\nline two" })).toThrow();
  });
});
