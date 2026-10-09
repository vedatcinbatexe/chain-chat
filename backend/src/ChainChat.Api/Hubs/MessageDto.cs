using System.Globalization;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;

namespace ChainChat.Api.Hubs;

/// <summary>
/// A stored message as sent to apps. It contains everything the recipient needs to verify it independently:
/// header fields, ciphertext and the sender's signature (SDD §6.3). uint64 values are decimal strings (SPEC.md §1).
/// </summary>
public sealed record MessageDto(
    long Id,
    string ConversationId,
    string Sender,
    string Seq,
    string PrevHash,
    string MessageHash,
    string Ciphertext,
    string Signature,
    string ClientTimestamp,
    DateTimeOffset ServerReceivedAt)
{
    public static MessageDto From(Message m) => new(
        m.Id,
        m.ConversationId,
        EthAddress.ToChecksum(m.Sender),
        m.Seq.ToString(CultureInfo.InvariantCulture),
        m.PrevHash,
        m.MessageHash,
        Hex.FromBytes(m.Ciphertext),
        Hex.FromBytes(m.Signature),
        m.ClientTimestamp.ToString(CultureInfo.InvariantCulture),
        m.ServerReceivedAt);
}
