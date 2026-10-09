using ChainChat.Api.Auth;
using ChainChat.Api.Hubs;
using ChainChat.Core.Crypto;
using ChainChat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace ChainChat.Api.Endpoints;

/// <summary>Conversation list and message history — also how apps catch up on messages received while offline.</summary>
public static class ConversationEndpoints
{
    public sealed record Peer(string Address, string Username);

    public sealed record ConversationSummary(string Id, Peer Peer, MessageDto? LastMessage);

    public static void MapConversationEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/conversations").WithTags("Conversations").RequireAuthorization();

        group.MapGet("/", ListConversations).WithSummary("The signed-in user's conversations, most recent first");
        group.MapGet("/{id}/messages", GetMessages).WithSummary("Messages of a conversation, oldest first; page backwards with ?before=");
    }

    private static async Task<Ok<ConversationSummary[]>> ListConversations(HttpContext context, ChainChatDbContext db, CancellationToken ct)
    {
        var me = EthAddress.Normalize(context.User.WalletAddress());

        var conversationIds = await db.Participants.Where(p => p.Address == me).Select(p => p.ConversationId).ToListAsync(ct);

        var peers = await db.Participants
            .Where(p => conversationIds.Contains(p.ConversationId) && p.Address != me)
            .Join(db.Users, p => p.Address, u => u.Address, (p, u) => new { p.ConversationId, u.Address, u.Username })
            .ToListAsync(ct);

        var lastIds = await db.Messages
            .Where(m => conversationIds.Contains(m.ConversationId))
            .GroupBy(m => m.ConversationId)
            .Select(g => g.Max(m => m.Id))
            .ToListAsync(ct);
        var lastMessages = await db.Messages.AsNoTracking().Where(m => lastIds.Contains(m.Id)).ToDictionaryAsync(m => m.ConversationId, ct);
        var lastPayments = await PaymentsFor(db, lastIds, ct);

        var summaries = peers
            .Select(p => new ConversationSummary(
                p.ConversationId,
                new Peer(EthAddress.ToChecksum(p.Address), p.Username),
                lastMessages.TryGetValue(p.ConversationId, out var last) ? MessageDto.From(last, lastPayments.GetValueOrDefault(last.Id)) : null))
            .OrderByDescending(s => s.LastMessage?.Id ?? 0)
            .ToArray();

        return TypedResults.Ok(summaries);
    }

    private static async Task<Results<Ok<MessageDto[]>, NotFound>> GetMessages(
        string id, long? before, int? limit, HttpContext context, ChainChatDbContext db, CancellationToken ct)
    {
        var me = EthAddress.Normalize(context.User.WalletAddress());
        var conversationId = id.ToLowerInvariant();

        // Only participants may read a conversation; 404 rather than 403 so ids cannot be probed.
        if (!await db.Participants.AnyAsync(p => p.ConversationId == conversationId && p.Address == me, ct)) return TypedResults.NotFound();

        var page = await db.Messages.AsNoTracking()
            .Where(m => m.ConversationId == conversationId && (before == null || m.Id < before))
            .OrderByDescending(m => m.Id)
            .Take(Math.Clamp(limit ?? 50, 1, 200))
            .ToListAsync(ct);

        var payments = await PaymentsFor(db, page.Select(m => m.Id).ToList(), ct);
        return TypedResults.Ok(page.OrderBy(m => m.Id).Select(m => MessageDto.From(m, payments.GetValueOrDefault(m.Id))).ToArray());
    }

    private static async Task<Dictionary<long, ChainChat.Core.Domain.Payment>> PaymentsFor(ChainChatDbContext db, List<long> messageIds, CancellationToken ct) =>
        await db.Payments.AsNoTracking()
            .Where(p => p.MessageId != null && messageIds.Contains(p.MessageId.Value))
            .ToDictionaryAsync(p => p.MessageId!.Value, ct);
}
