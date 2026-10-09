using ChainChat.Core.Crypto;

namespace ChainChat.Core.Anchoring;

/// <summary>A stored message to include in an anchor batch.</summary>
public sealed record AnchorCandidate(long MessageId, byte[] MessageHash);

/// <summary>Where one message sits in an anchored tree, and the sibling hashes that prove it.</summary>
public sealed record MessageProof(long MessageId, int LeafIndex, IReadOnlyList<byte[]> Proof);

/// <summary>Everything needed to anchor a batch on-chain and later prove each message against it.</summary>
public sealed record AnchorBatchPlan(byte[] Root, long FromMessageId, long ToMessageId, IReadOnlyList<MessageProof> Proofs);

/// <summary>
/// Builds the Merkle tree of a message batch (SPEC.md §6, SDD §6.6): leaves in message id order, so anyone with
/// the same messages rebuilds the same root. The root goes on-chain; each message keeps its own proof.
/// </summary>
public static class AnchorBatchBuilder
{
    public static AnchorBatchPlan Build(IReadOnlyList<AnchorCandidate> messages)
    {
        if (messages.Count == 0) throw new ArgumentException("An anchor batch needs at least one message (empty batches are never anchored)", nameof(messages));

        var ordered = messages.OrderBy(m => m.MessageId).ToList();
        if (ordered.Select(m => m.MessageId).Distinct().Count() != ordered.Count)
        {
            throw new ArgumentException("Message ids in a batch must be unique", nameof(messages));
        }

        var leaves = ordered.Select(m => MerkleTree.LeafHash(m.MessageHash)).ToList();
        var proofs = ordered.Select((m, index) => new MessageProof(m.MessageId, index, MerkleTree.Proof(leaves, index))).ToList();

        return new AnchorBatchPlan(MerkleTree.Root(leaves), ordered[0].MessageId, ordered[^1].MessageId, proofs);
    }
}
