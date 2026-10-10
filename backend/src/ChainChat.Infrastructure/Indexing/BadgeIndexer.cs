using System.Numerics;
using ChainChat.Core.Crypto;
using ChainChat.Infrastructure.Chain;
using ChainChat.Infrastructure.Notifications;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nethereum.ABI.FunctionEncoding.Attributes;
using Nethereum.RPC.Eth.DTOs;

namespace ChainChat.Infrastructure.Indexing;

/// <summary>ClassBadge (ERC-721) Transfer(address indexed from, address indexed to, uint256 indexed tokenId)</summary>
[Event("Transfer")]
public sealed class BadgeTransferEvent : IEventDTO
{
    [Parameter("address", "from", 1, true)]
    public string From { get; set; } = "";

    [Parameter("address", "to", 2, true)]
    public string To { get; set; } = "";

    [Parameter("uint256", "tokenId", 3, true)]
    public BigInteger TokenId { get; set; }
}

/// <summary>Tells group members that the member list changed (implemented by the API with SignalR).</summary>
public interface IGroupNotifier
{
    Task MembersChangedAsync(string conversationId, IReadOnlyCollection<string> addresses, string reason, CancellationToken ct);
}

public sealed class NullGroupNotifier : IGroupNotifier
{
    public Task MembersChangedAsync(string conversationId, IReadOnlyCollection<string> addresses, string reason, CancellationToken ct) => Task.CompletedTask;
}

/// <summary>
/// Revokes membership of NFT-gated groups when a badge is transferred away (SDD §6.5). After a Transfer, the
/// sender's badges are read from the chain; they are removed from every group whose required badge types they no
/// longer all hold, and the remaining members' apps stop encrypting to them.
/// </summary>
public sealed class BadgeIndexer(
    IServiceScopeFactory scopes,
    ChainClient chain,
    ContractDeployments deployments,
    BadgeService badges,
    IGroupNotifier notifier,
    IUserNotifier users,
    IOptions<IndexerOptions> options,
    TimeProvider time,
    ILogger<BadgeIndexer> logger) : ContractEventIndexer(scopes, chain, deployments, options, time, logger)
{
    private const string ZeroAddress = "0x0000000000000000000000000000000000000000";

    protected override string ContractName => ContractDeployments.ClassBadge;

    protected override async Task<IEnumerable<IndexedEvent>> FetchEventsAsync(string contract, BlockParameter from, BlockParameter to, CancellationToken ct) =>
        (await GetEventsAsync<BadgeTransferEvent>(contract, from, to, ct))
            .Select(e => new IndexedEvent(e.Log, (db, token) => OnTransferAsync(db, contract.ToLowerInvariant(), e.Event, token)));

    private async Task OnTransferAsync(ChainChatDbContext db, string contract, BadgeTransferEvent e, CancellationToken ct)
    {
        var from = EthAddress.Normalize(e.From);
        var to = EthAddress.Normalize(e.To);
        var minted = from == ZeroAddress;

        if (to != ZeroAddress)
        {
            var badge = await badges.TypeNameOfTokenAsync(contract, e.TokenId, ct);
            await users.NotifyAsync(to, new UserNotification(
                "BadgeReceived", "New badge", minted ? $"An administrator gave you the {badge} badge." : $"You received the {badge} badge."), ct);
        }

        if (minted) return; // a mint: nobody lost a badge

        var gated = await db.Participants
            .Where(p => p.Address == from && p.RemovedAt == null)
            .Join(db.Groups.Where(g => g.RequiredBadgeContract == contract), p => p.ConversationId, g => g.ConversationId, (p, g) => new { Membership = p, g.RequiredBadgeTypes, g.Name })
            .ToListAsync(ct);
        if (gated.Count == 0) return;

        // Ask the chain what they hold now, so replaying old events can never remove a current holder.
        var held = await badges.HeldAsync(contract, from, gated.SelectMany(g => g.RequiredBadgeTypes), ct);
        var lost = gated.Where(g => !g.RequiredBadgeTypes.All(held.Contains)).ToList();
        if (lost.Count == 0) return;

        foreach (var group in lost) group.Membership.RemovedAt = Time.GetUtcNow();
        await db.SaveChangesAsync(ct); // saved before notifying, so apps that refetch see the new member list

        foreach (var group in lost)
        {
            var conversationId = group.Membership.ConversationId;
            var remaining = await db.Participants.AsNoTracking()
                .Where(p => p.ConversationId == conversationId && p.RemovedAt == null)
                .Select(p => p.Address)
                .ToListAsync(ct);
            await notifier.MembersChangedAsync(conversationId, [.. remaining, from], "BadgeRevoked", ct);
            await users.NotifyAsync(from, new UserNotification(
                "RemovedFromGroup", "Removed from a group", $"You no longer hold a badge that \"{group.Name}\" requires.", conversationId), ct);
        }

        Logger.LogInformation("{Address} transferred badge #{TokenId} away and was removed from {Count} gated group(s)", from, e.TokenId, lost.Count);
    }
}
