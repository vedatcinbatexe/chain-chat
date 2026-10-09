using ChainChat.Core.Crypto;

namespace ChainChat.Core.Tests.Vectors;

/// <summary>Merkle leaves, roots and proofs against the shared vectors (SPEC.md §6).</summary>
public class MerkleVectorTests
{
    public static TheoryData<string> TreeCases => VectorFile.CaseNames("merkle.json");
    public static TheoryData<string> NegativeCases => VectorFile.CaseNames("merkle.json", "negative");

    [Theory]
    [MemberData(nameof(TreeCases))]
    public void Tree_matches_vector(string name)
    {
        var vector = VectorFile.Case("merkle.json", name);
        var expected = vector.GetProperty("expected");
        var messageHashes = vector.GetProperty("input").BytesList("messageHashes");

        var leaves = messageHashes.Select(MerkleTree.LeafHash).ToList();
        Assert.Equal(expected.GetProperty("leaves").EnumerateArray().Select(l => l.GetString()), leaves.Select(l => Hex.FromBytes(l)));

        var root = MerkleTree.Root(leaves);
        Assert.Equal(expected.Str("root"), Hex.FromBytes(root));

        var expectedProofs = expected.GetProperty("proofs").EnumerateArray().ToList();
        for (var i = 0; i < leaves.Count; i++)
        {
            var proof = MerkleTree.Proof(leaves, i);
            Assert.Equal(expectedProofs[i].EnumerateArray().Select(p => p.GetString()), proof.Select(p => Hex.FromBytes(p)));
            Assert.True(MerkleTree.Verify(leaves[i], proof, root), $"proof for leaf {i} should verify");
        }
    }

    [Theory]
    [MemberData(nameof(NegativeCases))]
    public void Invalid_proof_is_rejected(string name)
    {
        var vector = VectorFile.Case("merkle.json", name, "negative");

        var valid = MerkleTree.Verify(vector.Bytes("leaf"), vector.BytesList("proof"), vector.Bytes("root"));

        Assert.False(vector.GetProperty("expected").GetProperty("valid").GetBoolean());
        Assert.False(valid);
    }
}
