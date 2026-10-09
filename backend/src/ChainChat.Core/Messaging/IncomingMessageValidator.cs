using ChainChat.Core.Crypto;

namespace ChainChat.Core.Messaging;

/// <summary>A 1:1 message as received from the sender's device (SDD §6.3).</summary>
public sealed record IncomingMessage(
    byte[] ConversationId,
    string Sender,
    string Recipient,
    ulong Seq,
    byte[] PrevHash,
    byte[] Ciphertext,
    ulong ClientTimestamp,
    byte[] Signature);

public enum MessageRejection
{
    None,
    Malformed,
    SelfMessage,
    ConversationMismatch,
    BadGenesis,
    SeqGap,
    BrokenLink,
    InvalidSignature,
}

/// <summary>
/// Everything the server checks before it stores and relays a message. The server cannot read the content,
/// but it refuses anything the recipient would reject anyway: forged senders, wrong conversations, broken chains.
/// </summary>
public static class IncomingMessageValidator
{
    /// <summary>Ciphertext limit: text messages only in the MVP (nonce + box of a few thousand characters).</summary>
    public const int MaxCiphertextBytes = 16 * 1024;

    /// <param name="previous">The sender's last accepted message in this conversation, or null if this is their first.</param>
    /// <returns>The rejection reason (None if accepted) and, when accepted, the message hash.</returns>
    public static (MessageRejection Rejection, byte[]? MessageHash) Validate(IncomingMessage message, (ulong Seq, byte[] MessageHash)? previous)
    {
        if (message.Ciphertext.Length is 0 or > MaxCiphertextBytes) return (MessageRejection.Malformed, null);
        if (message.ConversationId.Length != 32 || message.PrevHash.Length != 32) return (MessageRejection.Malformed, null);
        if (EthAddress.AreEqual(message.Sender, message.Recipient)) return (MessageRejection.SelfMessage, null);

        // A 1:1 conversation id is derived from the two addresses (SPEC.md §2), so it cannot be moved to another chat.
        if (!message.ConversationId.AsSpan().SequenceEqual(ConversationId.ForDirect(message.Sender, message.Recipient)))
        {
            return (MessageRejection.ConversationMismatch, null);
        }

        // The sender's hash chain (SPEC.md §4): nothing deleted, reordered or replayed.
        var link = HashChain.Check(previous, message.Seq, message.PrevHash);
        if (link != ChainLinkResult.Valid)
        {
            return (link switch
            {
                ChainLinkResult.BadGenesis => MessageRejection.BadGenesis,
                ChainLinkResult.SeqGap => MessageRejection.SeqGap,
                _ => MessageRejection.BrokenLink,
            }, null);
        }

        byte[] messageHash;
        try
        {
            messageHash = MessageHasher.Hash(new MessageHeader(
                message.ConversationId, message.Sender, message.Seq, message.PrevHash, message.Ciphertext, message.ClientTimestamp));
        }
        catch (ArgumentException)
        {
            return (MessageRejection.Malformed, null);
        }

        // Only the sender's wallet can produce this signature (SPEC.md §5), so the server cannot forge or alter messages.
        return MessageSignature.Verify(message.Sender, messageHash, message.Signature) == SignatureCheckResult.Valid
            ? (MessageRejection.None, messageHash)
            : (MessageRejection.InvalidSignature, null);
    }
}
