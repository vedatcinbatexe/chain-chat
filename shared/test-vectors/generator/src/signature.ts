import { getAddress, hashMessage, hexToBigInt, recoverAddress, size, slice, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/** Order of the secp256k1 curve group. */
export const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/**
 * The digest that is actually signed (EIP-191, SPEC.md §5):
 *
 *   digest = keccak256("\x19Ethereum Signed Message:\n32" ‖ messageHash)
 *
 * The prefix makes a signed chat message impossible to replay as a signed transaction.
 */
export function signingDigest(messageHash: Hex): Hex {
  return hashMessage({ raw: messageHash });
}

/** Signs a messageHash with EIP-191. ECDSA nonces are deterministic (RFC 6979), so the signature is reproducible. */
export async function signMessageHash(privateKey: Hex, messageHash: Hex): Promise<Hex> {
  return privateKeyToAccount(privateKey).signMessage({ message: { raw: messageHash } });
}

export interface SignatureParts {
  r: Hex;
  s: Hex;
  v: number;
}

/** Splits a 65-byte signature r ‖ s ‖ v. */
export function splitSignature(signature: Hex): SignatureParts {
  if (size(signature) !== 65) throw new Error("signature must be 65 bytes");
  return {
    r: slice(signature, 0, 32),
    s: slice(signature, 32, 64),
    v: Number(hexToBigInt(slice(signature, 64, 65))),
  };
}

export type SignatureCheck =
  | { valid: true; signer: Address }
  | { valid: false; reason: "bad-length" | "bad-v" | "high-s" | "wrong-signer" | "unrecoverable" };

/**
 * Verifies that `signature` over `messageHash` was produced by `sender`.
 * Rejects malleable high-s signatures, as Bitcoin and Ethereum do.
 */
export async function verifyMessageSignature(sender: Address, messageHash: Hex, signature: Hex): Promise<SignatureCheck> {
  if (size(signature) !== 65) return { valid: false, reason: "bad-length" };

  const { s, v } = splitSignature(signature);
  if (v !== 27 && v !== 28) return { valid: false, reason: "bad-v" };
  if (hexToBigInt(s) > SECP256K1_N / 2n) return { valid: false, reason: "high-s" };

  let signer: Address;
  try {
    signer = await recoverAddress({ hash: signingDigest(messageHash), signature });
  } catch {
    return { valid: false, reason: "unrecoverable" };
  }

  return getAddress(signer) === getAddress(sender) ? { valid: true, signer } : { valid: false, reason: "wrong-signer" };
}
