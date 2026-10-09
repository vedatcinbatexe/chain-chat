using System.Numerics;

namespace ChainChat.Core.Crypto;

/// <summary>Merkle trees for anchoring message batches (SPEC.md §6). Compatible with OpenZeppelin MerkleProof.</summary>
public static class MerkleTree
{
    /// <summary>leaf = keccak256(keccak256(abi.encode(bytes32 messageHash))) — double hashing prevents second-preimage attacks.</summary>
    public static byte[] LeafHash(byte[] messageHash) => Keccak.Hash(Keccak.Hash(Abi.Bytes32(messageHash)));

    /// <summary>node = keccak256(min(a, b) ‖ max(a, b)), comparing a and b as unsigned 256-bit integers.</summary>
    public static byte[] HashPair(byte[] a, byte[] b) => ToNumber(a) <= ToNumber(b) ? Keccak.Hash(a, b) : Keccak.Hash(b, a);

    /// <summary>All levels from the leaves (level 0) to the root. An odd last node is promoted unchanged, never duplicated.</summary>
    public static IReadOnlyList<IReadOnlyList<byte[]>> BuildLayers(IReadOnlyList<byte[]> leaves)
    {
        if (leaves.Count == 0) throw new ArgumentException("A Merkle tree needs at least one leaf", nameof(leaves));

        var layers = new List<IReadOnlyList<byte[]>> { leaves.ToList() };
        var level = layers[0];

        while (level.Count > 1)
        {
            var next = new List<byte[]>((level.Count + 1) / 2);
            for (var i = 0; i < level.Count; i += 2)
            {
                next.Add(i + 1 < level.Count ? HashPair(level[i], level[i + 1]) : level[i]);
            }
            layers.Add(next);
            level = next;
        }

        return layers;
    }

    public static byte[] Root(IReadOnlyList<byte[]> leaves) => BuildLayers(leaves)[^1][0];

    /// <summary>Sibling hashes from the leaf up to the root. Levels where the node was promoted add nothing.</summary>
    public static IReadOnlyList<byte[]> Proof(IReadOnlyList<byte[]> leaves, int index)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(index);
        ArgumentOutOfRangeException.ThrowIfGreaterThanOrEqual(index, leaves.Count);

        var layers = BuildLayers(leaves);
        var proof = new List<byte[]>();
        var position = index;

        for (var depth = 0; depth < layers.Count - 1; depth++)
        {
            var sibling = position ^ 1;
            if (sibling < layers[depth].Count) proof.Add(layers[depth][sibling]);
            position >>= 1;
        }

        return proof;
    }

    /// <summary>Recomputes the root from a leaf and its proof (same algorithm as OpenZeppelin MerkleProof.verify).</summary>
    public static bool Verify(byte[] leaf, IEnumerable<byte[]> proof, byte[] root) =>
        proof.Aggregate(leaf, HashPair).AsSpan().SequenceEqual(root);

    private static BigInteger ToNumber(byte[] hash) => new(hash, isUnsigned: true, isBigEndian: true);
}
