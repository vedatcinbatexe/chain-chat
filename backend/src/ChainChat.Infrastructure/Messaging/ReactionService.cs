using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChainChat.Infrastructure.Messaging;

public sealed record ReactionSummary(string Emoji, IReadOnlyList<string> Addresses);

/// <summary>Result of toggling a reaction, with who should be told about it.</summary>
public sealed record ReactionToggle(string ConversationId, bool Added, IReadOnlyList<string> Audience);

/// <summary>
/// Emoji reactions. They are metadata the server can see (like who talks to whom, SDD §8.3) — only message
/// content is end-to-end encrypted.
/// </summary>
public sealed class ReactionService(ChainChatDbContext db, TimeProvider time)
{
    /// <summary>A fixed set keeps reactions small and avoids storing arbitrary user text.</summary>
    public static readonly IReadOnlySet<string> Allowed = new HashSet<string> { "👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "🙏" };

    /// <summary>Adds the reaction if the user has not made it yet, otherwise removes it.</summary>
    public async Task<ReactionToggle> ToggleAsync(string requester, long messageId, string emoji, CancellationToken ct)
    {
        if (!Allowed.Contains(emoji)) throw new MessageRejectedException("ReactionNotAllowed");
        var me = EthAddress.Normalize(requester);

        var conversationId = await db.Messages.Where(m => m.Id == messageId).Select(m => m.ConversationId).FirstOrDefaultAsync(ct)
            ?? throw new MessageRejectedException("MessageNotFound");
        var audience = await db.Participants
            .Where(p => p.ConversationId == conversationId && p.RemovedAt == null)
            .Select(p => p.Address)
            .ToListAsync(ct);
        if (!audience.Contains(me)) throw new MessageRejectedException("MessageNotFound"); // not a participant

        var existing = await db.MessageReactions.FindAsync([messageId, me, emoji], ct);
        if (existing is null)
        {
            db.MessageReactions.Add(new MessageReaction { MessageId = messageId, Address = me, Emoji = emoji, CreatedAt = time.GetUtcNow() });
        }
        else
        {
            db.MessageReactions.Remove(existing);
        }
        await db.SaveChangesAsync(ct);

        return new ReactionToggle(conversationId, existing is null, audience);
    }

    /// <summary>Reactions of several messages, grouped by emoji, in the order they were first used.</summary>
    public async Task<Dictionary<long, IReadOnlyList<ReactionSummary>>> ForMessagesAsync(IReadOnlyCollection<long> messageIds, CancellationToken ct)
    {
        var rows = await db.MessageReactions.AsNoTracking()
            .Where(r => messageIds.Contains(r.MessageId))
            .OrderBy(r => r.CreatedAt)
            .ToListAsync(ct);

        return rows
            .GroupBy(r => r.MessageId)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<ReactionSummary>)g.GroupBy(r => r.Emoji)
                    .Select(e => new ReactionSummary(e.Key, e.Select(r => EthAddress.ToChecksum(r.Address)).ToList()))
                    .ToList());
    }
}
