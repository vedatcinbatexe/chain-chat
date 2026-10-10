using ChainChat.Api.Auth;
using ChainChat.Api.Hubs;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Messaging;
using ChainChat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace ChainChat.Api.Endpoints;

/// <summary>Conversation list and message history — also how apps catch up on messages received while offline.</summary>
public static class ConversationEndpoints
{
    public sealed record Peer(string Address, string Username);

    public sealed record GroupSummary(string Name, int MemberCount);

    /// <param name="Peer">Set for 1:1 conversations.</param>
    /// <param name="Group">Set for group conversations.</param>
    public sealed record ConversationSummary(string Id, string Type, Peer? Peer, GroupSummary? Group, MessageDto? LastMessage);

    public static void MapConversationEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/conversations").WithTags("Conversations").RequireAuthorization();

        group.MapGet("/", ListConversations).WithSummary("The signed-in user's 1:1 chats and groups, most recent first");
        group.MapGet("/{id}/messages", GetMessages).WithSummary("Messages of a conversation, oldest first; page backwards with ?before=");
    }

    private static async Task<Ok<ConversationSummary[]>> ListConversations(HttpContext context, ChainChatDbContext db, CancellationToken ct)
    {
        var me = EthAddress.Normalize(context.User.WalletAddress());

        var conversations = await db.Participants
            .Where(p => p.Address == me && p.RemovedAt == null)
            .Join(db.Conversations, p => p.ConversationId, c => c.Id, (p, c) => new { c.Id, c.Type })
            .ToListAsync(ct);
        var ids = conversations.Select(c => c.Id).ToList();

        var peers = await db.Participants
            .Where(p => ids.Contains(p.ConversationId) && p.Address != me)
            .Join(db.Users, p => p.Address, u => u.Address, (p, u) => new { p.ConversationId, u.Address, u.Username })
            .ToListAsync(ct);
        var groups = await db.Groups.AsNoTracking()
            .Where(g => ids.Contains(g.ConversationId))
            .Select(g => new { g.ConversationId, g.Name, Members = db.Participants.Count(p => p.ConversationId == g.ConversationId && p.RemovedAt == null) })
            .ToDictionaryAsync(g => g.ConversationId, ct);

        var lastIds = await db.Messages
            .Where(m => ids.Contains(m.ConversationId))
            .GroupBy(m => m.ConversationId)
            .Select(g => g.Max(m => m.Id))
            .ToListAsync(ct);
        var lastMessages = await db.Messages.AsNoTracking().Where(m => lastIds.Contains(m.Id)).ToDictionaryAsync(m => m.ConversationId, ct);
        var lastPayments = await PaymentsFor(db, lastIds, ct);

        var summaries = conversations
            .Select(c =>
            {
                MessageDto? last = lastMessages.TryGetValue(c.Id, out var m) ? MessageDto.From(m, lastPayments.GetValueOrDefault(m.Id)) : null;
                if (c.Type == ConversationType.Group && groups.TryGetValue(c.Id, out var g))
                {
                    return new ConversationSummary(c.Id, "Group", null, new GroupSummary(g.Name, g.Members), last);
                }
                var peer = peers.FirstOrDefault(p => p.ConversationId == c.Id);
                return peer is null ? null : new ConversationSummary(c.Id, "Direct", new Peer(EthAddress.ToChecksum(peer.Address), peer.Username), null, last);
            })
            .OfType<ConversationSummary>()
            // Most recent activity first; groups without messages yet sort by being new.
            .OrderByDescending(s => s.LastMessage?.Id ?? long.MaxValue)
            .ToArray();

        return TypedResults.Ok(summaries);
    }

    private static async Task<Results<Ok<MessageDto[]>, NotFound>> GetMessages(
        string id, long? before, int? limit, HttpContext context, ChainChatDbContext db, ReactionService reactions, CancellationToken ct)
    {
        var me = EthAddress.Normalize(context.User.WalletAddress());
        var conversationId = id.ToLowerInvariant();

        // Only active participants may read a conversation; 404 rather than 403 so ids cannot be probed.
        if (!await db.Participants.AnyAsync(p => p.ConversationId == conversationId && p.Address == me && p.RemovedAt == null, ct)) return TypedResults.NotFound();

        var page = await db.Messages.AsNoTracking()
            .Where(m => m.ConversationId == conversationId && (before == null || m.Id < before))
            .OrderByDescending(m => m.Id)
            .Take(Math.Clamp(limit ?? 50, 1, 200))
            .ToListAsync(ct);

        var messageIds = page.Select(m => m.Id).ToList();
        var payments = await PaymentsFor(db, messageIds, ct);
        var messageReactions = await reactions.ForMessagesAsync(messageIds, ct);
        return TypedResults.Ok(page
            .OrderBy(m => m.Id)
            .Select(m => MessageDto.From(m, payments.GetValueOrDefault(m.Id), messageReactions.GetValueOrDefault(m.Id)))
            .ToArray());
    }

    private static async Task<Dictionary<long, Payment>> PaymentsFor(ChainChatDbContext db, List<long> messageIds, CancellationToken ct) =>
        await db.Payments.AsNoTracking()
            .Where(p => p.MessageId != null && messageIds.Contains(p.MessageId.Value))
            .ToDictionaryAsync(p => p.MessageId!.Value, ct);
}
