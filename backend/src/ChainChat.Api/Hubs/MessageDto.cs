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
    DateTimeOffset ServerReceivedAt,
    PaymentDto? Payment,
    IReadOnlyList<ChainChat.Infrastructure.Messaging.ReactionSummary> Reactions)
{
    public static MessageDto From(Message m, Payment? payment = null, IReadOnlyList<ChainChat.Infrastructure.Messaging.ReactionSummary>? reactions = null) => new(
        m.Id,
        m.ConversationId,
        EthAddress.ToChecksum(m.Sender),
        m.Seq.ToString(CultureInfo.InvariantCulture),
        m.PrevHash,
        m.MessageHash,
        Hex.FromBytes(m.Ciphertext),
        Hex.FromBytes(m.Signature),
        m.ClientTimestamp.ToString(CultureInfo.InvariantCulture),
        m.ServerReceivedAt,
        payment is null ? null : PaymentDto.From(payment),
        reactions ?? []);
}

/// <summary>
/// The server's view of a payment claim (SDD §6.4). Apps also check the receipt on-chain themselves.
/// Amount is the on-chain amount in wei (decimal string) and Asset the asset that was paid, both known once confirmed.
/// </summary>
public sealed record PaymentDto(string TxHash, string Status, string? Amount, long? BlockNumber, string? FailureReason, string? Asset)
{
    public static PaymentDto From(Payment p) => new(
        p.TxHash,
        p.Status.ToString(),
        p.Status == PaymentStatus.Confirmed ? p.Amount.ToString(CultureInfo.InvariantCulture) : null,
        p.BlockNumber,
        p.FailureReason,
        p.Status == PaymentStatus.Confirmed ? p.Asset ?? "CHAT" : null);
}

/// <summary>Pushed when a payment is confirmed or fails.</summary>
public sealed record PaymentUpdateDto(long MessageId, string ConversationId, PaymentDto Payment);
