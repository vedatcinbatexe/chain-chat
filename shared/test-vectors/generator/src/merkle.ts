import { concat, encodeAbiParameters, hexToBigInt, keccak256, type Hex } from "viem";

/**
 * Leaf hash for a message (SPEC.md §6.1):
 *
 *   leaf = keccak256(keccak256(abi.encode(bytes32 messageHash)))
 *
 * Hashing twice means a leaf can never be confused with an internal node (second-preimage protection).
 * abi.encode of a single bytes32 is the 32 bytes themselves.
 */
export function leafHash(messageHash: Hex): Hex {
  return keccak256(keccak256(encodeAbiParameters([{ type: "bytes32" }], [messageHash])));
}

/**
 * Internal node (SPEC.md §6.2): the two children are sorted numerically before hashing,
 * so proofs need no left/right flags. Identical to OpenZeppelin MerkleProof's commutative hash.
 */
export function hashPair(a: Hex, b: Hex): Hex {
  return hexToBigInt(a) <= hexToBigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

/**
 * Builds every level of the tree, from the leaves (level 0) up to the root.
 * An odd node at the end of a level is promoted unchanged — never duplicated (SPEC.md §6.3).
 */
export function buildLayers(leaves: readonly Hex[]): Hex[][] {
  if (leaves.length === 0) throw new Error("A Merkle tree needs at least one leaf");

  const layers: Hex[][] = [[...leaves]];
  let level: Hex[] = layers[0]!;

  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1];
      next.push(right === undefined ? left : hashPair(left, right));
    }
    layers.push(next);
    level = next;
  }

  return layers;
}

export function merkleRoot(leaves: readonly Hex[]): Hex {
  const layers = buildLayers(leaves);
  return layers[layers.length - 1]![0]!;
}

/** Sibling hashes from the leaf up to (not including) the root. Levels where the node was promoted add nothing. */
export function merkleProof(leaves: readonly Hex[], index: number): Hex[] {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
    throw new Error(`Leaf index ${index} is out of range`);
  }

  const layers = buildLayers(leaves);
  const proof: Hex[] = [];
  let position = index;

  for (let depth = 0; depth < layers.length - 1; depth++) {
    const sibling = layers[depth]![position ^ 1];
    if (sibling !== undefined) proof.push(sibling);
    position >>= 1;
  }

  return proof;
}

/** Recomputes the root from a leaf and its proof. Same algorithm as OpenZeppelin MerkleProof.verify. */
export function verifyProof(leaf: Hex, proof: readonly Hex[], root: Hex): boolean {
  const computed = proof.reduce<Hex>((node, sibling) => hashPair(node, sibling), leaf);
  return hexToBigInt(computed) === hexToBigInt(root);
}
