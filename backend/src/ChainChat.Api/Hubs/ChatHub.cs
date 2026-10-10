using ChainChat.Api.Auth;
using ChainChat.Core.Crypto;
using ChainChat.Infrastructure.Messaging;
using ChainChat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ChainChat.Api.Hubs;

public sealed record TypingDto(string ConversationId, string Address, bool IsTyping);

public sealed record PresenceDto(string Address, bool Online);

public sealed record ReactionDto(long MessageId, string ConversationId, string Address, string Emoji, bool Added);

/// <summary>Something about a conversation changed (e.g. a member joined or left) — apps refetch it.</summary>
public sealed record ConversationUpdatedDto(string ConversationId, string Reason);

/// <summary>An in-app notification; see <see cref="ChainChat.Infrastructure.Notifications.UserNotification"/> for the kinds.</summary>
public sealed record NotificationDto(string Kind, string Title, string Body, string? ConversationId, DateTimeOffset CreatedAt);

/// <summary>Server → app events.</summary>
public interface IChatClient
{
    /// <summary>A new message in one of the user's conversations (also echoed to the sender's other connections).</summary>
    Task MessageReceived(MessageDto message);

    /// <summary>A payment claim was confirmed or rejected from its on-chain receipt.</summary>
    Task PaymentUpdated(PaymentUpdateDto update);

    Task TypingChanged(TypingDto typing);

    Task PresenceChanged(PresenceDto presence);

    Task ReactionChanged(ReactionDto reaction);

    Task ConversationUpdated(ConversationUpdatedDto update);

    /// <summary>Something to show the user as an in-app banner (funds or a badge received, an announcement, …).</summary>
    Task Notification(NotificationDto notification);
}

/// <summary>
/// Real-time messaging (SDD §4.2, §9). Connections are authenticated with the SIWE JWT; each wallet address is
/// a SignalR user, so events reach every device of a user. Typing, presence and reactions are metadata the
/// server can see; message content stays end-to-end encrypted.
/// </summary>
[Authorize]
public sealed class ChatHub(
    MessageService messages,
    ReactionService reactions,
    PresenceTracker presence,
    ChainChat.Api.Common.HubMessageLimiter limiter,
    ChainChatDbContext db,
    ILogger<ChatHub> logger) : Hub<IChatClient>
{
    public const string Path = "/hubs/chat";

    private string Me => EthAddress.Normalize(Context.User!.WalletAddress());

    public override async Task OnConnectedAsync()
    {
        if (presence.Connected(Me)) await NotifyContactsAsync(new PresenceDto(EthAddress.ToChecksum(Me), true));
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (presence.Disconnected(Me)) await NotifyContactsAsync(new PresenceDto(EthAddress.ToChecksum(Me), false));
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>Validates, stores and relays a message. Returns the stored message as the acknowledgement.</summary>
    public async Task<MessageDto> SendMessage(SendMessageCommand request)
    {
        // A wallet that floods the hub is slowed down before any signature or database work is done.
        if (!limiter.TryAcquire(Me)) throw new HubException("RateLimited");

        try
        {
            var (message, payment, created, audience) = await messages.AcceptAsync(Me, request, Context.ConnectionAborted);
            var dto = MessageDto.From(message, payment);

            if (created)
            {
                await Clients.Users(audience).MessageReceived(dto);
                logger.LogInformation("Relayed message {Id} in {Conversation} to {Count} member(s)", message.Id, message.ConversationId, audience.Count);
            }

            return dto;
        }
        catch (MessageRejectedException ex)
        {
            // HubException messages are sent to the caller; anything else is hidden as a generic error.
            throw new HubException(ex.Code);
        }
    }

    /// <summary>Tells the other participants that the caller started or stopped typing.</summary>
    public async Task Typing(string conversationId, bool isTyping)
    {
        var id = conversationId.ToLowerInvariant();
        var participants = await ActiveParticipantsAsync(id);
        if (!participants.Contains(Me)) return; // silently ignore non-members

        await Clients.Users(participants.Where(p => p != Me).ToList()).TypingChanged(new TypingDto(id, EthAddress.ToChecksum(Me), isTyping));
    }

    /// <summary>Adds or removes the caller's emoji reaction on a message.</summary>
    public async Task React(long messageId, string emoji)
    {
        try
        {
            var toggle = await reactions.ToggleAsync(Me, messageId, emoji, Context.ConnectionAborted);
            await Clients.Users(toggle.Audience).ReactionChanged(new ReactionDto(messageId, toggle.ConversationId, EthAddress.ToChecksum(Me), emoji, toggle.Added));
        }
        catch (MessageRejectedException ex)
        {
            throw new HubException(ex.Code);
        }
    }

    /// <summary>Which of the given addresses are online now (initial state; changes arrive as PresenceChanged).</summary>
    public string[] GetPresence(string[] addresses) =>
        addresses.Where(EthAddress.IsValid).Select(EthAddress.Normalize).Where(presence.IsOnline).Select(EthAddress.ToChecksum).Distinct().ToArray();

    private Task<List<string>> ActiveParticipantsAsync(string conversationId) =>
        db.Participants.AsNoTracking()
            .Where(p => p.ConversationId == conversationId && p.RemovedAt == null)
            .Select(p => p.Address)
            .ToListAsync(Context.ConnectionAborted);

    /// <summary>Everyone who shares a conversation with the caller.</summary>
    private async Task NotifyContactsAsync(PresenceDto update)
    {
        var me = Me;
        var contacts = await db.Participants.AsNoTracking()
            .Where(p => p.RemovedAt == null && p.Address != me &&
                        db.Participants.Any(mine => mine.ConversationId == p.ConversationId && mine.Address == me && mine.RemovedAt == null))
            .Select(p => p.Address)
            .Distinct()
            .ToListAsync();
        if (contacts.Count > 0) await Clients.Users(contacts).PresenceChanged(update);
    }
}

/// <summary>Pushes payment status changes to the payer and the payee over SignalR.</summary>
public sealed class HubPaymentNotifier(IHubContext<ChatHub, IChatClient> hub) : ChainChat.Infrastructure.Payments.IPaymentNotifier
{
    public Task PaymentUpdatedAsync(ChainChat.Core.Domain.Payment payment, string conversationId, CancellationToken ct) =>
        hub.Clients.Users(payment.From, payment.To).PaymentUpdated(new PaymentUpdateDto(payment.MessageId!.Value, conversationId, PaymentDto.From(payment)));
}

public sealed class HubUserNotifier(IHubContext<ChatHub, IChatClient> hub, TimeProvider time) : ChainChat.Infrastructure.Notifications.IUserNotifier
{
    public Task NotifyAsync(string address, ChainChat.Infrastructure.Notifications.UserNotification notification, CancellationToken ct) =>
        hub.Clients.User(address.ToLowerInvariant()).Notification(Present(notification));

    public Task BroadcastAsync(ChainChat.Infrastructure.Notifications.UserNotification notification, CancellationToken ct) =>
        hub.Clients.All.Notification(Present(notification));

    private NotificationDto Present(ChainChat.Infrastructure.Notifications.UserNotification n) => new(n.Kind, n.Title, n.Body, n.ConversationId, time.GetUtcNow());
}

public sealed class HubGroupNotifier(IHubContext<ChatHub, IChatClient> hub) : ChainChat.Infrastructure.Indexing.IGroupNotifier
{
    public Task MembersChangedAsync(string conversationId, IReadOnlyCollection<string> addresses, string reason, CancellationToken ct) =>
        hub.Clients.Users(addresses.ToList()).ConversationUpdated(new ConversationUpdatedDto(conversationId, reason));
}

/// <summary>Uses the lowercase wallet address (the JWT subject) as the SignalR user id.</summary>
public sealed class WalletUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection) => connection.User?.Identity?.Name?.ToLowerInvariant();
}
