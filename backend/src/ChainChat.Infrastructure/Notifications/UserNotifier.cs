namespace ChainChat.Infrastructure.Notifications;

/// <summary>
/// Something the app should tell the user right now, as an in-app banner (SDD §9). Sent only to connected apps
/// and not stored: a notification is a hint, the facts behind it (balances, badges, membership) are on the chain
/// or in the conversation list.
/// </summary>
/// <param name="Kind">FundsReceived · BadgeReceived · RemovedFromGroup · AccountBlocked · AccountUnblocked · Announcement.</param>
/// <param name="ConversationId">The group the notification is about, if any.</param>
public sealed record UserNotification(string Kind, string Title, string Body, string? ConversationId = null);

/// <summary>Delivers notifications to connected apps (implemented by the API with SignalR).</summary>
public interface IUserNotifier
{
    Task NotifyAsync(string address, UserNotification notification, CancellationToken ct);

    /// <summary>To every connected app, e.g. an admin announcement.</summary>
    Task BroadcastAsync(UserNotification notification, CancellationToken ct);
}

public sealed class NullUserNotifier : IUserNotifier
{
    public Task NotifyAsync(string address, UserNotification notification, CancellationToken ct) => Task.CompletedTask;

    public Task BroadcastAsync(UserNotification notification, CancellationToken ct) => Task.CompletedTask;
}
