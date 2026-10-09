import { concat, keccak256, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { buildLayers, hashPair, leafHash, merkleProof, merkleRoot, verifyProof } from "../src/merkle.js";
import { merkleTestMessageHash } from "../src/vectors.js";

const leavesOf = (n: number): Hex[] => Array.from({ length: n }, (_, i) => leafHash(merkleTestMessageHash(i)));

/** Sorted-pair hash written out by hand, independent of hashPair(). */
const manualPair = (a: Hex, b: Hex): Hex => (BigInt(a) <= BigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a])));

describe("leafHash", () => {
  it("hashes the message hash twice", () => {
    const m = merkleTestMessageHash(0);
    expect(leafHash(m)).toBe(keccak256(keccak256(m)));
  });
});

describe("hashPair", () => {
  it("is commutative", () => {
    const [a, b] = leavesOf(2) as [Hex, Hex];
    expect(hashPair(a, b)).toBe(hashPair(b, a));
  });
});

describe("tree shape", () => {
  it("a single leaf is its own root with an empty proof", () => {
    const [leaf] = leavesOf(1) as [Hex];
    expect(merkleRoot([leaf])).toBe(leaf);
    expect(merkleProof([leaf], 0)).toEqual([]);
    expect(verifyProof(leaf, [], leaf)).toBe(true);
  });

  it("3 leaves: the odd leaf is promoted, not duplicated", () => {
    const [a, b, c] = leavesOf(3) as [Hex, Hex, Hex];
    expect(merkleRoot([a, b, c])).toBe(manualPair(manualPair(a, b), c));
    expect(merkleRoot([a, b, c])).not.toBe(manualPair(manualPair(a, b), manualPair(c, c)));
    expect(merkleProof([a, b, c], 2)).toEqual([manualPair(a, b)]);
  });

  it("7 leaves: matches a hand-built tree", () => {
    const [l0, l1, l2, l3, l4, l5, l6] = leavesOf(7) as Hex[] as [Hex, Hex, Hex, Hex, Hex, Hex, Hex];
    const left = manualPair(manualPair(l0, l1), manualPair(l2, l3));
    const right = manualPair(manualPair(l4, l5), l6);
    expect(merkleRoot(leavesOf(7))).toBe(manualPair(left, right));
  });

  it("layer sizes halve, rounding up", () => {
    expect(buildLayers(leavesOf(100)).map((layer) => layer.length)).toEqual([100, 50, 25, 13, 7, 4, 2, 1]);
  });

  it("rejects an empty tree and out-of-range indexes", () => {
    expect(() => merkleRoot([])).toThrow();
    expect(() => merkleProof(leavesOf(3), 3)).toThrow();
    expect(() => merkleProof(leavesOf(3), -1)).toThrow();
  });
});

describe("proofs", () => {
  it("every leaf of every tree size from 1 to 64 verifies", () => {
    for (let n = 1; n <= 64; n++) {
      const leaves = leavesOf(n);
      const root = merkleRoot(leaves);
      leaves.forEach((leaf, i) => expect(verifyProof(leaf, merkleProof(leaves, i), root)).toBe(true));
    }
  });

  it("a proof does not verify a different leaf", () => {
    const leaves = leavesOf(8);
    const root = merkleRoot(leaves);
    expect(verifyProof(leaves[1]!, merkleProof(leaves, 0), root)).toBe(false);
  });

  it("an un-hashed message hash is not accepted as a leaf", () => {
    const leaves = leavesOf(4);
    expect(verifyProof(merkleTestMessageHash(0), merkleProof(leaves, 0), merkleRoot(leaves))).toBe(false);
  });
});
