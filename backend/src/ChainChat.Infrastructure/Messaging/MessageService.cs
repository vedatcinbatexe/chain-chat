using System.Globalization;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Core.Messaging;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ChainChat.Infrastructure.Messaging;

/// <summary>A message as sent by the app: hex for bytes, decimal strings for uint64 (SPEC.md §1).</summary>
/// <param name="Recipient">The other participant of a 1:1 conversation; null for a group message.</param>
/// <param name="PaymentTxHash">For a payment message: the ChatToken transfer transaction it claims (SDD §6.4).</param>
public sealed record SendMessageCommand(
    string ConversationId,
    string? Recipient,
    string Seq,
    string PrevHash,
    string Ciphertext,
    string ClientTimestamp,
    string Signature,
    string? PaymentTxHash = null);

/// <summary>A stored message, its payment claim (if any), whether it was newly created, and who should receive it.</summary>
public sealed record AcceptedMessage(Message Message, Payment? Payment, bool Created, IReadOnlyList<string> Audience);

/// <summary>Why a message was refused; the code is sent back to the app.</summary>
public sealed class MessageRejectedException(string code) : Exception($"Message rejected: {code}")
{
    public string Code { get; } = code;
}

public sealed class MessageService(ChainChatDbContext db, TimeProvider time, ILogger<MessageService> logger)
{
    /// <summary>
    /// Validates and stores a 1:1 or group message from <paramref name="sender"/> (the signed-in wallet).
    /// Idempotent: re-sending an already stored message returns it with <c>Created = false</c>.
    /// A payment message also records a pending payment; each transaction can be claimed only once.
    /// </summary>
    public async Task<AcceptedMessage> AcceptAsync(string sender, SendMessageCommand command, CancellationToken ct)
    {
        var incoming = Parse(sender, command);
        var paymentTxHash = ParsePaymentTxHash(command.PaymentTxHash);
        var conversationId = Hex.FromBytes(incoming.ConversationId);
        var senderAddress = EthAddress.Normalize(incoming.Sender);
        var recipientAddress = incoming.Recipient is null ? null : EthAddress.Normalize(incoming.Recipient);
        var isGroup = recipientAddress is null;

        // A retry whose acknowledgement was lost: return the stored copy instead of failing the chain check.
        var candidateHash = TryHash(incoming);
        if (candidateHash is not null)
        {
            var existing = await db.Messages.AsNoTracking().FirstOrDefaultAsync(m => m.MessageHash == candidateHash, ct);
            if (existing is not null && existing.Sender == senderAddress)
            {
                var existingPayment = await db.Payments.AsNoTracking().FirstOrDefaultAsync(p => p.MessageId == existing.Id, ct);
                return new AcceptedMessage(existing, existingPayment, false, []);
            }
        }

        List<string> audience;
        if (isGroup)
        {
            // Group messages: only active members may post, and every active member receives it.
            if (paymentTxHash is not null) throw new MessageRejectedException("PaymentsNotSupportedInGroups");
            var conversation = await db.Conversations.AsNoTracking().FirstOrDefaultAsync(c => c.Id == conversationId, ct);
            if (conversation?.Type != ConversationType.Group) throw new MessageRejectedException("ConversationNotFound");
            audience = await db.Participants.Where(p => p.ConversationId == conversationId && p.RemovedAt == null).Select(p => p.Address).ToListAsync(ct);
            if (!audience.Contains(senderAddress)) throw new MessageRejectedException("NotAMember");
        }
        else
        {
            // Both sides must be registered on-chain (mirrored by the indexer), so the recipient has a public key.
            var registered = await db.Users.Where(u => u.Address == senderAddress || u.Address == recipientAddress).CountAsync(ct);
            if (registered < 2) throw new MessageRejectedException("NotRegistered");
            audience = [senderAddress, recipientAddress!];
        }

        if (paymentTxHash is not null && await db.Payments.AnyAsync(p => p.TxHash == paymentTxHash, ct))
        {
            // The same transfer cannot be shown as two payments.
            throw new MessageRejectedException("PaymentTxAlreadyClaimed");
        }

        var previous = await db.Messages.AsNoTracking()
            .Where(m => m.ConversationId == conversationId && m.Sender == senderAddress)
            .OrderByDescending(m => m.Seq)
            .Select(m => new { m.Seq, m.MessageHash })
            .FirstOrDefaultAsync(ct);

        var (rejection, messageHash) = IncomingMessageValidator.Validate(
            incoming, previous is null ? null : (previous.Seq, Hex.ToBytes(previous.MessageHash)));
        if (rejection != MessageRejection.None)
        {
            logger.LogInformation("Rejected message from {Sender} in {Conversation}: {Reason}", senderAddress, conversationId, rejection);
            throw new MessageRejectedException(rejection.ToString());
        }

        if (!isGroup && await db.Conversations.FindAsync([conversationId], ct) is null)
        {
            var now = time.GetUtcNow();
            db.Conversations.Add(new Conversation
            {
                Id = conversationId,
                Type = ConversationType.Direct,
                CreatedAt = now,
                Participants =
                [
                    new Participant { ConversationId = conversationId, Address = senderAddress, JoinedAt = now },
                    new Participant { ConversationId = conversationId, Address = recipientAddress!, JoinedAt = now },
                ],
            });
        }

        var message = new Message
        {
            ConversationId = conversationId,
            Sender = senderAddress,
            Seq = incoming.Seq,
            PrevHash = Hex.FromBytes(incoming.PrevHash),
            MessageHash = Hex.FromBytes(messageHash!),
            Ciphertext = incoming.Ciphertext,
            Signature = incoming.Signature,
            ClientTimestamp = incoming.ClientTimestamp,
            ServerReceivedAt = time.GetUtcNow(),
            Type = paymentTxHash is null ? MessageType.Text : MessageType.Payment,
            PaymentTxHash = paymentTxHash,
        };
        db.Messages.Add(message);

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        Payment? payment = null;
        try
        {
            await db.SaveChangesAsync(ct);

            if (paymentTxHash is not null)
            {
                // Pending until the PaymentVerifier has checked the on-chain receipt.
                payment = new Payment
                {
                    TxHash = paymentTxHash,
                    From = senderAddress,
                    To = recipientAddress!,
                    Status = PaymentStatus.Pending,
                    MessageId = message.Id,
                    CreatedAt = time.GetUtcNow(),
                };
                db.Payments.Add(payment);
                await db.SaveChangesAsync(ct);
            }

            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Another message with the same seq — or a payment for the same transaction — won the race.
            throw new MessageRejectedException(paymentTxHash is null ? "SeqConflict" : "SeqConflictOrPaymentTxAlreadyClaimed");
        }

        return new AcceptedMessage(message, payment, true, audience);
    }

    private static string? ParsePaymentTxHash(string? txHash)
    {
        if (txHash is null) return null;
        try
        {
            var bytes = Hex.ToBytes(txHash);
            return bytes.Length == 32 ? Hex.FromBytes(bytes) : throw new FormatException();
        }
        catch (FormatException)
        {
            throw new MessageRejectedException(nameof(MessageRejection.Malformed));
        }
    }

    private static IncomingMessage Parse(string sender, SendMessageCommand c)
    {
        try
        {
            return new IncomingMessage(
                Hex.ToBytes(c.ConversationId),
                EthAddress.ToChecksum(sender),
                c.Recipient is null ? null : EthAddress.ToChecksum(c.Recipient),
                ulong.Parse(c.Seq, NumberStyles.None, CultureInfo.InvariantCulture),
                Hex.ToBytes(c.PrevHash),
                Hex.ToBytes(c.Ciphertext),
                ulong.Parse(c.ClientTimestamp, NumberStyles.None, CultureInfo.InvariantCulture),
                Hex.ToBytes(c.Signature));
        }
        catch (Exception ex) when (ex is FormatException or OverflowException or ArgumentException)
        {
            throw new MessageRejectedException(nameof(MessageRejection.Malformed));
        }
    }

    private static string? TryHash(IncomingMessage m)
    {
        try
        {
            return Hex.FromBytes(MessageHasher.Hash(new MessageHeader(m.ConversationId, m.Sender, m.Seq, m.PrevHash, m.Ciphertext, m.ClientTimestamp)));
        }
        catch (ArgumentException)
        {
            return null;
        }
    }
}
