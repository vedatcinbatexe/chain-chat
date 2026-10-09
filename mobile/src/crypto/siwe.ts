// Ported from shared/test-vectors/generator/src/siwe.ts (SPEC.md §7).
// Verified against shared/test-vectors/vectors/siwe.json by src/crypto/__tests__/vectors.test.ts.
import { getAddress, type Address } from "viem";

/**
 * Sign-In with Ethereum (EIP-4361) message, in the strict subset ChainChat uses (SPEC.md §7):
 * statement and expiration time are required; Not Before, Request ID and Resources are not used.
 */
export interface SiweFields {
  /** RFC 3986 authority the user signs in to, e.g. "chainchat.local". */
  domain: string;
  /** EIP-55 checksummed address. */
  address: Address;
  statement: string;
  /** RFC 3986 URI, e.g. "chainchat://app". */
  uri: string;
  chainId: number;
  /** Server-issued, single-use, at least 8 alphanumeric characters. */
  nonce: string;
  /** RFC 3339 timestamps, e.g. "2026-01-01T00:00:00.000Z". */
  issuedAt: string;
  expirationTime: string;
}

const NONCE_PATTERN = /^[a-zA-Z0-9]{8,}$/;

/** Builds the exact text the wallet signs with personal_sign (EIP-191). Lines are joined with "\n". */
export function formatSiweMessage(fields: SiweFields): string {
  if (getAddress(fields.address) !== fields.address) throw new Error("address must be EIP-55 checksummed");
  if (!NONCE_PATTERN.test(fields.nonce)) throw new Error("nonce must be at least 8 alphanumeric characters");
  if (fields.statement.includes("\n")) throw new Error("statement must be a single line");

  return [
    `${fields.domain} wants you to sign in with your Ethereum account:`,
    fields.address,
    "",
    fields.statement,
    "",
    `URI: ${fields.uri}`,
    "Version: 1",
    `Chain ID: ${fields.chainId}`,
    `Nonce: ${fields.nonce}`,
    `Issued At: ${fields.issuedAt}`,
    `Expiration Time: ${fields.expirationTime}`,
  ].join("\n");
}
