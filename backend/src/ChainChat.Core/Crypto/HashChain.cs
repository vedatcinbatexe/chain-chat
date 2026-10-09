namespace ChainChat.Core.Crypto;

public enum ChainLinkResult
{
    Valid,
    BadGenesis,
    SeqGap,
    BrokenLink,
}

/// <summary>Per-sender hash chain checks (SPEC.md §4).</summary>
public static class HashChain
{
    /// <summary>
    /// Checks that the incoming message directly follows the sender's last accepted message in the same conversation.
    /// </summary>
    /// <param name="previous">The last accepted message from this sender, or null if this is their first.</param>
    /// <param name="nextSeq">The incoming message's seq.</param>
    /// <param name="nextPrevHash">The incoming message's prevHash.</param>
    public static ChainLinkResult Check((ulong Seq, byte[] MessageHash)? previous, ulong nextSeq, byte[] nextPrevHash)
    {
        if (previous is null)
        {
            return nextSeq == 1 && nextPrevHash.AsSpan().SequenceEqual(MessageHasher.ZeroHash)
                ? ChainLinkResult.Valid
                : ChainLinkResult.BadGenesis;
        }

        var (seq, messageHash) = previous.Value;
        if (seq == ulong.MaxValue || nextSeq != seq + 1) return ChainLinkResult.SeqGap;
        if (!nextPrevHash.AsSpan().SequenceEqual(messageHash)) return ChainLinkResult.BrokenLink;
        return ChainLinkResult.Valid;
    }
}
