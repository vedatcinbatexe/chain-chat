namespace ChainChat.Core.Crypto;

/// <summary>The header a sender builds, hashes and signs for every message (SPEC.md §3).</summary>
/// <param name="ConversationId">bytes32 conversation id.</param>
/// <param name="Sender">The sender's wallet address.</param>
/// <param name="Seq">The sender's message counter in this conversation, starting at 1.</param>
/// <param name="PrevHash">messageHash of the sender's previous message in this conversation; 32 zero bytes for seq 1.</param>
/// <param name="Ciphertext">The encrypted payload exactly as sent (opaque bytes).</param>
/// <param name="ClientTimestamp">Milliseconds since the Unix epoch, from the sender's device.</param>
public sealed record MessageHeader(
    byte[] ConversationId,
    string Sender,
    ulong Seq,
    byte[] PrevHash,
    byte[] Ciphertext,
    ulong ClientTimestamp);

public static class MessageHasher
{
    public static readonly byte[] ZeroHash = new byte[32];

    public static byte[] CiphertextHash(byte[] ciphertext) => Keccak.Hash(ciphertext);

    /// <summary>abi.encode of the six header fields — always 192 bytes.</summary>
    public static byte[] Encode(MessageHeader header)
    {
        Validate(header);
        return Abi.Encode(
            Abi.Bytes32(header.ConversationId),
            Abi.Address(header.Sender),
            Abi.UInt64(header.Seq),
            Abi.Bytes32(header.PrevHash),
            CiphertextHash(header.Ciphertext),
            Abi.UInt64(header.ClientTimestamp));
    }

    /// <summary>messageHash = keccak256(abi.encode(conversationId, sender, seq, prevHash, keccak256(ciphertext), clientTimestamp))</summary>
    public static byte[] Hash(MessageHeader header) => Keccak.Hash(Encode(header));

    private static void Validate(MessageHeader header)
    {
        if (header.ConversationId.Length != 32) throw new ArgumentException("conversationId must be 32 bytes");
        if (header.PrevHash.Length != 32) throw new ArgumentException("prevHash must be 32 bytes");
        if (header.Ciphertext.Length == 0) throw new ArgumentException("ciphertext must not be empty");
        if (header.Seq < 1) throw new ArgumentException("seq must be at least 1");

        var isGenesis = header.PrevHash.AsSpan().SequenceEqual(ZeroHash);
        if (header.Seq == 1 && !isGenesis) throw new ArgumentException("The first message (seq 1) must have prevHash = zero");
        if (header.Seq > 1 && isGenesis) throw new ArgumentException("Only the first message (seq 1) may have prevHash = zero");
    }
}
