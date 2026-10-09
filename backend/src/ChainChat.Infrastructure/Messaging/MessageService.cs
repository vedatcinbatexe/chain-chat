using System.Globalization;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Core.Messaging;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ChainChat.Infrastructure.Messaging;

/// <summary>A message as sent by the app: hex for bytes, decimal strings for uint64 (SPEC.md §1).</summary>
public sealed record SendMessageCommand(
    string ConversationId,
    string Recipient,
    string Seq,
    string PrevHash,
    string Ciphertext,
    string ClientTimestamp,
    string Signature);

/// <summary>Why a message was refused; the code is sent back to the app.</summary>
public sealed class MessageRejectedException(string code) : Exception($"Message rejected: {code}")
{
    public string Code { get; } = code;
}

public sealed class MessageService(ChainChatDbContext db, TimeProvider time, ILogger<MessageService> logger)
{
    /// <summary>
    /// Validates and stores a 1:1 message from <paramref name="sender"/> (the signed-in wallet).
    /// Idempotent: re-sending an already stored message returns it with <c>Created = false</c>.
    /// </summary>
    public async Task<(Message Message, bool Created)> AcceptAsync(string sender, SendMessageCommand command, CancellationToken ct)
    {
        var incoming = Parse(sender, command);
        var conversationId = Hex.FromBytes(incoming.ConversationId);
        var senderAddress = EthAddress.Normalize(incoming.Sender);
        var recipientAddress = EthAddress.Normalize(incoming.Recipient);

        // A retry whose acknowledgement was lost: return the stored copy instead of failing the chain check.
        var candidateHash = TryHash(incoming);
        if (candidateHash is not null)
        {
            var existing = await db.Messages.AsNoTracking().FirstOrDefaultAsync(m => m.MessageHash == candidateHash, ct);
            if (existing is not null && existing.Sender == senderAddress) return (existing, false);
        }

        // Both sides must be registered on-chain (mirrored by the indexer), so the recipient has a public key.
        var registered = await db.Users.Where(u => u.Address == senderAddress || u.Address == recipientAddress).CountAsync(ct);
        if (registered < 2) throw new MessageRejectedException("NotRegistered");

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

        if (await db.Conversations.FindAsync([conversationId], ct) is null)
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
                    new Participant { ConversationId = conversationId, Address = recipientAddress, JoinedAt = now },
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
            Type = MessageType.Text,
        };
        db.Messages.Add(message);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Another message with the same seq won the race (unique index on conversation + sender + seq).
            throw new MessageRejectedException("SeqConflict");
        }

        return (message, true);
    }

    private static IncomingMessage Parse(string sender, SendMessageCommand c)
    {
        try
        {
            return new IncomingMessage(
                Hex.ToBytes(c.ConversationId),
                EthAddress.ToChecksum(sender),
                EthAddress.ToChecksum(c.Recipient),
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
