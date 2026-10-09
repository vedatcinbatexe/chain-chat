using ChainChat.Core.Anchoring;
using ChainChat.Core.Crypto;
using ChainChat.Core.Tests.Vectors;

namespace ChainChat.Core.Tests.Anchoring;

public class AnchorBatchBuilderTests
{
    public static TheoryData<string> TreeCases => VectorFile.CaseNames("merkle.json");

    /// <summary>The batch the server anchors is exactly the tree from the shared vectors — so the phone and the contract agree.</summary>
    [Theory]
    [MemberData(nameof(TreeCases))]
    public void Batch_matches_the_shared_merkle_vectors(string name)
    {
        var vector = VectorFile.Case("merkle.json", name);
        var messageHashes = vector.GetProperty("input").BytesList("messageHashes");
        var expected = vector.GetProperty("expected");

        // Message ids 101, 102, … in order — like rows in the messages table.
        var plan = AnchorBatchBuilder.Build(messageHashes.Select((hash, i) => new AnchorCandidate(101 + i, hash)).ToList());

        Assert.Equal(expected.Str("root"), Hex.FromBytes(plan.Root));
        Assert.Equal(101, plan.FromMessageId);
        Assert.Equal(100 + messageHashes.Count, plan.ToMessageId);

        var expectedProofs = expected.GetProperty("proofs").EnumerateArray().ToList();
        foreach (var proof in plan.Proofs)
        {
            Assert.Equal(proof.MessageId - 101, proof.LeafIndex);
            Assert.Equal(expectedProofs[proof.LeafIndex].EnumerateArray().Select(p => p.GetString()), proof.Proof.Select(p => Hex.FromBytes(p)));
        }
    }

    [Fact]
    public void Messages_are_ordered_by_id_regardless_of_input_order()
    {
        var hashes = Enumerable.Range(0, 3).Select(i => Keccak.Hash([(byte)i])).ToList();
        var inOrder = AnchorBatchBuilder.Build([new(1, hashes[0]), new(2, hashes[1]), new(3, hashes[2])]);
        var shuffled = AnchorBatchBuilder.Build([new(3, hashes[2]), new(1, hashes[0]), new(2, hashes[1])]);

        Assert.Equal(inOrder.Root, shuffled.Root);
        Assert.Equal([0, 1, 2], shuffled.Proofs.OrderBy(p => p.MessageId).Select(p => p.LeafIndex));
    }

    [Fact]
    public void Every_message_proof_verifies_against_the_root()
    {
        var messages = Enumerable.Range(1, 13).Select(i => new AnchorCandidate(i * 7, Keccak.Hash([(byte)i]))).ToList();
        var plan = AnchorBatchBuilder.Build(messages);

        foreach (var proof in plan.Proofs)
        {
            var leaf = MerkleTree.LeafHash(messages.Single(m => m.MessageId == proof.MessageId).MessageHash);
            Assert.True(MerkleTree.Verify(leaf, proof.Proof, plan.Root));
        }
        Assert.Equal((7, 91), (plan.FromMessageId, plan.ToMessageId));
    }

    [Fact]
    public void Empty_batch_or_duplicate_ids_are_rejected()
    {
        Assert.Throws<ArgumentException>(() => AnchorBatchBuilder.Build([]));
        Assert.Throws<ArgumentException>(() => AnchorBatchBuilder.Build([new(1, Keccak.Hash([1])), new(1, Keccak.Hash([2]))]));
    }
}
