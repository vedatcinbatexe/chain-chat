using System.Globalization;
using System.Security.Cryptography;
using ChainChat.Api.Auth;
using ChainChat.Api.Common;
using ChainChat.Api.Hubs;
using ChainChat.Core.Auth;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Admin;
using ChainChat.Infrastructure.Anchoring;
using ChainChat.Infrastructure.Chain;
using ChainChat.Infrastructure.Indexing;
using ChainChat.Infrastructure.Messaging;
using ChainChat.Infrastructure.Notifications;
using ChainChat.Infrastructure.Payments;
using ChainChat.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ChainChat.Api.Endpoints;

/// <summary>
/// The admin dashboard's API (SDD §4.4). Admins sign in with their wallet like everyone else; every route except
/// the two login calls requires the Admin policy. Admins see metadata only — message content is end-to-end
/// encrypted and messages cannot be edited or deleted here, so the anchored history stays verifiable.
/// </summary>
public static class AdminEndpoints
{
    public sealed record Paged<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

    public sealed record BanRequest(string? Reason);

    public sealed record FundRequest(string Address, string Asset, decimal Amount);

    public sealed record AddAdminRequest(string Address, string? Note);

    public sealed record MintBadgeRequest(int TypeId);

    public sealed record CreateBadgeTypeRequest(string Name);

    public sealed record AnnouncementRequest(string Title, string Body);

    private const string InviteAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    public static void MapAdminEndpoints(this WebApplication app)
    {
        var auth = app.MapGroup("/api/v1/admin/auth").WithTags("Admin").RequireRateLimiting(RateLimiting.AuthPolicy);
        auth.MapPost("/nonce", IssueNonce).WithSummary("Nonce for a dashboard Sign-In with Ethereum message");
        auth.MapPost("/verify", Verify).WithSummary("Verifies a dashboard login; only admin wallets get a token");

        var admin = app.MapGroup("/api/v1/admin").WithTags("Admin").RequireAuthorization(AdminAuthorization.Policy);
        admin.MapGet("/me", Me);
        admin.MapGet("/overview", Overview);

        admin.MapGet("/users", ListUsers);
        admin.MapGet("/users/{address}", GetUser);
        admin.MapPost("/users/{address}/ban", BanUser);
        admin.MapDelete("/users/{address}/ban", UnbanUser);
        admin.MapPost("/users/{address}/badge", MintBadge);

        admin.MapGet("/badges", ListBadgeTypes);
        admin.MapPost("/badges", CreateBadgeType);

        admin.MapGet("/groups", ListGroups);
        admin.MapGet("/groups/{id}", GetGroup);
        admin.MapDelete("/groups/{id}/members/{address}", RemoveMember);
        admin.MapPost("/groups/{id}/rotate-invite", RotateInvite);

        admin.MapGet("/messages", ListMessages);

        admin.MapGet("/transactions/payments", ListPayments);
        admin.MapGet("/transactions/drips", ListDrips);
        admin.MapGet("/transactions/anchors", ListAnchors);
        admin.MapGet("/transactions/fundings", ListFundings);
        admin.MapPost("/funding", Fund);

        admin.MapGet("/admins", ListAdmins);
        admin.MapPost("/admins", AddAdmin);
        admin.MapDelete("/admins/{address}", RemoveAdmin);
        admin.MapGet("/audit", ListAudit);

        admin.MapGet("/announcements", ListAnnouncements);
        admin.MapPost("/announcements", SendAnnouncement);

        admin.MapGet("/system", GetSystem);
        admin.MapPut("/system/settings", UpdateSettings);
        admin.MapPost("/system/anchor-now", AnchorNow);
    }

    // ---- Sign-in ----

    private static IResult IssueNonce(AuthEndpoints.NonceRequest request, NonceStore nonces, IOptions<AdminOptions> admin, IOptions<ChainOptions> chain)
    {
        if (!EthAddress.IsValid(request.Address)) return Problem(400, "InvalidAddress");
        var (nonce, expiresAt) = nonces.Issue(request.Address);
        return Results.Ok(new AuthEndpoints.NonceResponse(nonce, admin.Value.Domain, admin.Value.Uri, chain.Value.ChainId, admin.Value.Statement, expiresAt));
    }

    private static async Task<IResult> Verify(
        AuthEndpoints.VerifyRequest request, NonceStore nonces, TokenService tokens, AdminService admins,
        IOptions<AdminOptions> admin, IOptions<AuthOptions> auth, IOptions<ChainOptions> chain, TimeProvider time, ILogger<AdminRequirement> logger, CancellationToken ct)
    {
        byte[] signature;
        try
        {
            signature = Hex.ToBytes(request.Signature ?? "");
        }
        catch (FormatException)
        {
            return Problem(401, "InvalidSignature");
        }

        var rules = new SiweRules(admin.Value.Domain, admin.Value.Uri, chain.Value.ChainId,
            TimeSpan.FromMinutes(auth.Value.MaxMessageLifetimeMinutes), TimeSpan.FromMinutes(auth.Value.ClockSkewMinutes));
        var (result, message) = SiweVerifier.Verify(request.Message ?? "", signature, rules, time.GetUtcNow());
        if (result != SiweResult.Valid) return Problem(401, result.ToString());
        if (!nonces.TryConsume(message!.Nonce, message.Address)) return Problem(401, "NonceInvalid");

        if (!await admins.IsAdminAsync(message.Address, ct))
        {
            logger.LogWarning("Dashboard sign-in refused for {Address}: not an admin", message.Address);
            return Problem(403, "NotAnAdmin");
        }

        var (token, expiresAt) = tokens.Issue(message.Address);
        logger.LogInformation("Admin {Address} signed in to the dashboard", message.Address);
        return Results.Ok(new AuthEndpoints.SessionResponse(token, expiresAt, message.Address));
    }

    private static async Task<IResult> Me(HttpContext context, AdminService admins, ChainChatDbContext db, CancellationToken ct)
    {
        var me = EthAddress.Normalize(context.User.WalletAddress());
        var username = await db.Users.AsNoTracking().Where(u => u.Address == me).Select(u => u.Username).FirstOrDefaultAsync(ct);
        return Results.Ok(new { address = EthAddress.ToChecksum(me), username, isRoot = admins.IsRoot(me) });
    }

    // ---- Overview ----

    private static async Task<IResult> Overview(ChainChatDbContext db, PresenceTracker presence, ChainClient chain, TimeProvider time, CancellationToken ct)
    {
        var now = time.GetUtcNow();
        var since = now.AddDays(-13).UtcDateTime.Date;
        var recent = await db.Messages.AsNoTracking().Where(m => m.ServerReceivedAt >= since).Select(m => m.ServerReceivedAt).ToListAsync(ct);
        var perDay = Enumerable.Range(0, 14)
            .Select(i => since.AddDays(i))
            .Select(day => new { date = day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), count = recent.Count(t => t.UtcDateTime.Date == day) })
            .ToList();

        var confirmed = await db.Payments.AsNoTracking().Where(p => p.Status == PaymentStatus.Confirmed).Select(p => p.Amount).ToListAsync(ct);
        long? block = null;
        try
        {
            block = await chain.GetBlockNumberAsync(ct);
        }
        catch (InvalidOperationException)
        {
            // The chain is unreachable; the dashboard shows that instead of failing the whole page.
        }

        return Results.Ok(new
        {
            users = await db.Users.CountAsync(ct),
            onlineNow = presence.OnlineCount,
            bannedUsers = await db.BannedUsers.CountAsync(ct),
            groups = await db.Groups.CountAsync(ct),
            directConversations = await db.Conversations.CountAsync(c => c.Type == ConversationType.Direct, ct),
            messages = await db.Messages.CountAsync(ct),
            messagesLast24h = recent.Count(t => t >= now.AddHours(-24)),
            unanchoredMessages = await db.Messages.CountAsync(m => m.AnchorBatchId == null, ct),
            anchorBatches = await db.AnchorBatches.CountAsync(b => b.Status == AnchorBatchStatus.Confirmed, ct),
            payments = confirmed.Count,
            paymentVolume = confirmed.Aggregate(System.Numerics.BigInteger.Zero, (sum, amount) => sum + amount).ToString(CultureInfo.InvariantCulture),
            blockNumber = block,
            messagesPerDay = perDay,
        });
    }

    // ---- Users ----

    private static async Task<IResult> ListUsers(string? q, int? page, int? pageSize, ChainChatDbContext db, PresenceTracker presence, CancellationToken ct)
    {
        var (p, size) = Paging(page, pageSize);
        var users = db.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLowerInvariant();
            users = EthAddress.IsValid(term)
                ? users.Where(u => u.Address == term)
                : users.Where(u => u.Username.Contains(term) || u.Address.Contains(term));
        }

        var total = await users.CountAsync(ct);
        var rows = await users.OrderByDescending(u => u.CreatedAt).Skip((p - 1) * size).Take(size)
            .Select(u => new
            {
                u.Address,
                u.Username,
                u.CreatedAt,
                u.RegisteredAtBlock,
                Messages = db.Messages.Count(m => m.Sender == u.Address),
                Banned = db.BannedUsers.Any(b => b.Address == u.Address),
            })
            .ToListAsync(ct);

        return Results.Ok(new Paged<object>(rows.Select(u => (object)new
        {
            address = EthAddress.ToChecksum(u.Address),
            username = u.Username,
            registeredAt = u.CreatedAt,
            registeredAtBlock = u.RegisteredAtBlock,
            messages = u.Messages,
            banned = u.Banned,
            online = presence.IsOnline(u.Address),
        }).ToList(), total, p, size));
    }

    private static async Task<IResult> GetUser(string address, ChainChatDbContext db, PresenceTracker presence, AdminService admins, AdminFundingService funding, BadgeService badgeService, CancellationToken ct)
    {
        if (!EthAddress.IsValid(address)) return Problem(400, "InvalidAddress");
        var normalized = EthAddress.Normalize(address);
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Address == normalized, ct);
        var ban = await db.BannedUsers.AsNoTracking().FirstOrDefaultAsync(b => b.Address == normalized, ct);

        var groups = await db.Participants.AsNoTracking()
            .Where(m => m.Address == normalized && m.RemovedAt == null)
            .Join(db.Groups, m => m.ConversationId, g => g.ConversationId, (m, g) => new { id = g.ConversationId, name = g.Name, joinedAt = m.JoinedAt })
            .ToListAsync(ct);

        AccountBalances? balances = null;
        var badges = new List<object>();
        try
        {
            balances = await funding.GetBalancesAsync(normalized, ct);
            if (badgeService.ContractAddress is { } badgeContract)
            {
                foreach (var type in await badgeService.TypesAsync(badgeContract, ct))
                {
                    var count = await badgeService.BalanceOfTypeAsync(badgeContract, normalized, type.Id, ct);
                    if (count > 0) badges.Add(new { id = type.Id, name = type.Name, count });
                }
            }
        }
        catch (InvalidOperationException)
        {
            // Chain unreachable: show the profile without balances.
        }

        return Results.Ok(new
        {
            address = EthAddress.ToChecksum(normalized),
            username = user?.Username,
            registered = user is not null,
            encryptionPublicKey = user?.EncryptionPublicKey,
            registeredAt = user?.CreatedAt,
            registeredAtBlock = user?.RegisteredAtBlock,
            registrationTxHash = user?.RegistrationTxHash,
            online = presence.IsOnline(normalized),
            isAdmin = await admins.IsAdminAsync(normalized, ct),
            ban = ban is null ? null : new { reason = ban.Reason, bannedBy = EthAddress.ToChecksum(ban.BannedBy), bannedAt = ban.CreatedAt },
            balances = balances is null ? null : new { eth = balances.Eth.ToString(CultureInfo.InvariantCulture), chat = balances.Chat?.ToString(CultureInfo.InvariantCulture), badges = (int?)balances.Badges },
            badges,
            messages = await db.Messages.CountAsync(m => m.Sender == normalized, ct),
            conversations = await db.Participants.CountAsync(m => m.Address == normalized && m.RemovedAt == null, ct),
            paymentsSent = await db.Payments.CountAsync(x => x.From == normalized && x.Status == PaymentStatus.Confirmed, ct),
            paymentsReceived = await db.Payments.CountAsync(x => x.To == normalized && x.Status == PaymentStatus.Confirmed, ct),
            groups,
        });
    }

    private static async Task<IResult> BanUser(string address, BanRequest request, HttpContext context, ChainChatDbContext db, AdminService admins, IUserNotifier notifier, TimeProvider time, CancellationToken ct)
    {
        if (!EthAddress.IsValid(address)) return Problem(400, "InvalidAddress");
        var normalized = EthAddress.Normalize(address);
        var me = context.User.WalletAddress();
        if (await admins.IsAdminAsync(normalized, ct)) return Problem(409, "CannotBanAnAdmin");
        if (await db.BannedUsers.AnyAsync(b => b.Address == normalized, ct)) return Results.NoContent();

        var reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        if (reason is { Length: > 200 }) return Problem(400, "ReasonTooLong");
        db.BannedUsers.Add(new BannedUser { Address = normalized, Reason = reason, BannedBy = EthAddress.Normalize(me), CreatedAt = time.GetUtcNow() });
        admins.Audit(me, "BanUser", normalized, reason);
        await db.SaveChangesAsync(ct);
        await notifier.NotifyAsync(normalized, new UserNotification("AccountBlocked", "Account blocked", "An administrator blocked this account on this server."), ct);
        return Results.NoContent();
    }

    private static async Task<IResult> UnbanUser(string address, HttpContext context, ChainChatDbContext db, AdminService admins, IUserNotifier notifier, CancellationToken ct)
    {
        if (!EthAddress.IsValid(address)) return Problem(400, "InvalidAddress");
        var normalized = EthAddress.Normalize(address);
        var ban = await db.BannedUsers.FirstOrDefaultAsync(b => b.Address == normalized, ct);
        if (ban is null) return Results.NoContent();

        db.BannedUsers.Remove(ban);
        admins.Audit(context.User.WalletAddress(), "UnbanUser", normalized);
        await db.SaveChangesAsync(ct);
        await notifier.NotifyAsync(normalized, new UserNotification("AccountUnblocked", "Account unblocked", "An administrator lifted the block on this account."), ct);
        return Results.NoContent();
    }

    private static async Task<IResult> MintBadge(string address, MintBadgeRequest request, HttpContext context, AdminFundingService funding, CancellationToken ct)
    {
        try
        {
            return Results.Ok(PresentFunding(await funding.MintBadgeAsync(context.User.WalletAddress(), address, request.TypeId, ct), null));
        }
        catch (FundingException ex)
        {
            return Problem(ex.Code == "FundingDisabled" ? 503 : 400, ex.Code);
        }
    }

    // ---- Badge types ----

    private static async Task<IResult> ListBadgeTypes(BadgeService badges, ChainChatDbContext db, CancellationToken ct)
    {
        if (badges.ContractAddress is not { } contract) return Results.Ok(new { contract = (string?)null, types = Array.Empty<object>() });
        var required = await db.Groups.AsNoTracking().Where(g => g.RequiredBadgeContract == contract).Select(g => g.RequiredBadgeTypes).ToListAsync(ct);
        var types = await badges.TypesAsync(contract, ct);
        return Results.Ok(new
        {
            contract = EthAddress.ToChecksum(contract),
            types = types.Select(t => new { id = t.Id, name = t.Name, groups = required.Count(r => r.Contains(t.Id)) }),
        });
    }

    private static async Task<IResult> CreateBadgeType(CreateBadgeTypeRequest request, HttpContext context, AdminFundingService funding, CancellationToken ct)
    {
        try
        {
            var created = await funding.CreateBadgeTypeAsync(context.User.WalletAddress(), request.Name ?? "", ct);
            return Results.Ok(new { id = created.Id, name = created.Name });
        }
        catch (FundingException ex)
        {
            return Problem(ex.Code == "FundingDisabled" ? 503 : 400, ex.Code);
        }
    }

    // ---- Groups ----

    private static async Task<IResult> ListGroups(string? q, int? page, int? pageSize, ChainChatDbContext db, CancellationToken ct)
    {
        var (p, size) = Paging(page, pageSize);
        var groups = db.Groups.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLowerInvariant();
            groups = groups.Where(g => g.Name.ToLower().Contains(term) || g.ConversationId == term);
        }

        var total = await groups.CountAsync(ct);
        var rows = await groups.OrderByDescending(g => g.CreatedAt).Skip((p - 1) * size).Take(size)
            .Select(g => new
            {
                g.ConversationId,
                g.Name,
                g.CreatedBy,
                CreatorUsername = db.Users.Where(u => u.Address == g.CreatedBy).Select(u => u.Username).FirstOrDefault(),
                g.CreatedAt,
                g.MaxMembers,
                g.RequiredBadgeContract,
                g.RequiredBadgeTypes,
                Members = db.Participants.Count(m => m.ConversationId == g.ConversationId && m.RemovedAt == null),
                Messages = db.Messages.Count(m => m.ConversationId == g.ConversationId),
            })
            .ToListAsync(ct);

        return Results.Ok(new Paged<object>(rows.Select(g => (object)new
        {
            id = g.ConversationId,
            name = g.Name,
            createdBy = EthAddress.ToChecksum(g.CreatedBy),
            creatorUsername = g.CreatorUsername,
            createdAt = g.CreatedAt,
            maxMembers = g.MaxMembers,
            requiresBadge = g.RequiredBadgeContract != null,
            requiredBadgeTypes = g.RequiredBadgeTypes,
            members = g.Members,
            messages = g.Messages,
        }).ToList(), total, p, size));
    }

    private static async Task<IResult> GetGroup(string id, ChainChatDbContext db, GroupService groups, PresenceTracker presence, CancellationToken ct)
    {
        var groupId = id.ToLowerInvariant();
        var group = await db.Groups.AsNoTracking().FirstOrDefaultAsync(g => g.ConversationId == groupId, ct);
        if (group is null) return Problem(404, "GroupNotFound");
        var members = await groups.ActiveMembersAsync(groupId, ct);

        return Results.Ok(new
        {
            id = group.ConversationId,
            name = group.Name,
            createdBy = EthAddress.ToChecksum(group.CreatedBy),
            createdAt = group.CreatedAt,
            maxMembers = group.MaxMembers,
            inviteCode = group.InviteCode,
            requiredBadgeContract = group.RequiredBadgeContract is null ? null : EthAddress.ToChecksum(group.RequiredBadgeContract),
            requiredBadges = (await groups.RequiredBadgesAsync(group, null, ct)).Select(b => new { id = b.Id, name = b.Name }),
            messages = await db.Messages.CountAsync(m => m.ConversationId == groupId, ct),
            members = members.Select(m => new { address = EthAddress.ToChecksum(m.Address), username = m.Username, joinedAt = m.JoinedAt, online = presence.IsOnline(m.Address) }),
        });
    }

    private static async Task<IResult> RemoveMember(
        string id, string address, HttpContext context, ChainChatDbContext db, AdminService admins, GroupService groups,
        IHubContext<ChatHub, IChatClient> hub, IUserNotifier notifier, TimeProvider time, CancellationToken ct)
    {
        if (!EthAddress.IsValid(address)) return Problem(400, "InvalidAddress");
        var groupId = id.ToLowerInvariant();
        var normalized = EthAddress.Normalize(address);
        var member = await db.Participants.FirstOrDefaultAsync(m => m.ConversationId == groupId && m.Address == normalized && m.RemovedAt == null, ct);
        if (member is null || !await db.Groups.AnyAsync(g => g.ConversationId == groupId, ct)) return Problem(404, "MemberNotFound");

        member.RemovedAt = time.GetUtcNow();
        admins.Audit(context.User.WalletAddress(), "RemoveGroupMember", groupId, normalized);
        await db.SaveChangesAsync(ct);

        // The apps of the remaining members stop encrypting new messages to the removed wallet.
        var remaining = await groups.ActiveMembersAsync(groupId, ct);
        await hub.Clients.Users([.. remaining.Select(m => m.Address), normalized]).ConversationUpdated(new ConversationUpdatedDto(groupId, "MemberRemoved"));
        var groupName = await db.Groups.AsNoTracking().Where(g => g.ConversationId == groupId).Select(g => g.Name).FirstAsync(ct);
        await notifier.NotifyAsync(normalized, new UserNotification("RemovedFromGroup", "Removed from a group", $"An administrator removed you from \"{groupName}\".", groupId), ct);
        return Results.NoContent();
    }

    private static async Task<IResult> RotateInvite(string id, HttpContext context, ChainChatDbContext db, AdminService admins, CancellationToken ct)
    {
        var groupId = id.ToLowerInvariant();
        var group = await db.Groups.FirstOrDefaultAsync(g => g.ConversationId == groupId, ct);
        if (group is null) return Problem(404, "GroupNotFound");

        group.InviteCode = RandomNumberGenerator.GetString(InviteAlphabet, 22); // the old link stops working
        admins.Audit(context.User.WalletAddress(), "RotateGroupInvite", groupId);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { inviteCode = group.InviteCode });
    }

    // ---- Messages (metadata only) ----

    private static async Task<IResult> ListMessages(string? conversationId, string? sender, int? page, int? pageSize, ChainChatDbContext db, CancellationToken ct)
    {
        var (p, size) = Paging(page, pageSize);
        var messages = db.Messages.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(conversationId))
        {
            var id = conversationId.Trim().ToLowerInvariant();
            messages = messages.Where(m => m.ConversationId == id);
        }
        if (!string.IsNullOrWhiteSpace(sender))
        {
            if (!EthAddress.IsValid(sender.Trim())) return Problem(400, "InvalidAddress");
            var address = EthAddress.Normalize(sender.Trim());
            messages = messages.Where(m => m.Sender == address);
        }

        var total = await messages.CountAsync(ct);
        var rows = await messages.OrderByDescending(m => m.Id).Skip((p - 1) * size).Take(size)
            .Select(m => new
            {
                m.Id,
                m.ConversationId,
                GroupName = db.Groups.Where(g => g.ConversationId == m.ConversationId).Select(g => g.Name).FirstOrDefault(),
                m.Sender,
                SenderUsername = db.Users.Where(u => u.Address == m.Sender).Select(u => u.Username).FirstOrDefault(),
                m.Seq,
                m.Type,
                Size = m.Ciphertext.Length,
                m.MessageHash,
                m.ServerReceivedAt,
                m.PaymentTxHash,
                BatchStatus = db.AnchorBatches.Where(b => b.Id == m.AnchorBatchId).Select(b => (AnchorBatchStatus?)b.Status).FirstOrDefault(),
                Reactions = db.MessageReactions.Count(r => r.MessageId == m.Id),
            })
            .ToListAsync(ct);

        return Results.Ok(new Paged<object>(rows.Select(m => (object)new
        {
            id = m.Id,
            conversationId = m.ConversationId,
            conversationType = m.GroupName is null ? "Direct" : "Group",
            groupName = m.GroupName,
            sender = EthAddress.ToChecksum(m.Sender),
            senderUsername = m.SenderUsername,
            seq = m.Seq.ToString(CultureInfo.InvariantCulture),
            type = m.Type.ToString(),
            sizeBytes = m.Size,
            messageHash = m.MessageHash,
            receivedAt = m.ServerReceivedAt,
            paymentTxHash = m.PaymentTxHash,
            anchor = m.BatchStatus switch { null => "NotAnchored", AnchorBatchStatus.Confirmed => "Anchored", _ => "Pending" },
            reactions = m.Reactions,
        }).ToList(), total, p, size));
    }

    // ---- Transactions ----

    private static async Task<IResult> ListPayments(int? page, int? pageSize, ChainChatDbContext db, CancellationToken ct)
    {
        var (p, size) = Paging(page, pageSize);
        var total = await db.Payments.CountAsync(ct);
        var rows = await db.Payments.AsNoTracking().OrderByDescending(x => x.CreatedAt).Skip((p - 1) * size).Take(size)
            .Select(x => new
            {
                Payment = x,
                FromUsername = db.Users.Where(u => u.Address == x.From).Select(u => u.Username).FirstOrDefault(),
                ToUsername = db.Users.Where(u => u.Address == x.To).Select(u => u.Username).FirstOrDefault(),
            })
            .ToListAsync(ct);

        return Results.Ok(new Paged<object>(rows.Select(r => (object)new
        {
            txHash = r.Payment.TxHash,
            from = EthAddress.ToChecksum(r.Payment.From),
            fromUsername = r.FromUsername,
            to = EthAddress.ToChecksum(r.Payment.To),
            toUsername = r.ToUsername,
            amount = r.Payment.Status == PaymentStatus.Confirmed ? r.Payment.Amount.ToString(CultureInfo.InvariantCulture) : null,
            status = r.Payment.Status.ToString(),
            failureReason = r.Payment.FailureReason,
            blockNumber = r.Payment.BlockNumber,
            createdAt = r.Payment.CreatedAt,
        }).ToList(), total, p, size));
    }

    private static async Task<IResult> ListDrips(int? page, int? pageSize, ChainChatDbContext db, CancellationToken ct)
    {
        var (p, size) = Paging(page, pageSize);
        var total = await db.GasDrips.CountAsync(ct);
        var rows = await db.GasDrips.AsNoTracking().OrderByDescending(d => d.CreatedAt).Skip((p - 1) * size).Take(size)
            .Select(d => new { Drip = d, Username = db.Users.Where(u => u.Address == d.Address).Select(u => u.Username).FirstOrDefault() })
            .ToListAsync(ct);

        return Results.Ok(new Paged<object>(rows.Select(r => (object)new
        {
            address = EthAddress.ToChecksum(r.Drip.Address),
            username = r.Username,
            txHash = r.Drip.TxHash,
            amount = r.Drip.AmountWei.ToString(CultureInfo.InvariantCulture),
            createdAt = r.Drip.CreatedAt,
        }).ToList(), total, p, size));
    }

    private static async Task<IResult> ListAnchors(int? page, int? pageSize, ChainChatDbContext db, CancellationToken ct)
    {
        var (p, size) = Paging(page, pageSize);
        var total = await db.AnchorBatches.CountAsync(ct);
        var rows = await db.AnchorBatches.AsNoTracking().OrderByDescending(b => b.Id).Skip((p - 1) * size).Take(size).ToListAsync(ct);

        return Results.Ok(new Paged<object>(rows.Select(b => (object)new
        {
            id = b.Id,
            chainBatchId = b.ChainBatchId,
            root = b.Root,
            fromMessageId = b.FromMessageId,
            toMessageId = b.ToMessageId,
            leafCount = b.LeafCount,
            status = b.Status.ToString(),
            txHash = b.TxHash,
            blockNumber = b.BlockNumber,
            createdAt = b.CreatedAt,
            anchoredAt = b.AnchoredAt,
        }).ToList(), total, p, size));
    }

    private static async Task<IResult> ListFundings(int? page, int? pageSize, ChainChatDbContext db, CancellationToken ct)
    {
        var (p, size) = Paging(page, pageSize);
        var total = await db.AdminFundings.CountAsync(ct);
        var rows = await db.AdminFundings.AsNoTracking().OrderByDescending(f => f.Id).Skip((p - 1) * size).Take(size)
            .Select(f => new { Funding = f, Username = db.Users.Where(u => u.Address == f.Address).Select(u => u.Username).FirstOrDefault() })
            .ToListAsync(ct);

        return Results.Ok(new Paged<object>(rows.Select(r => PresentFunding(r.Funding, r.Username)).ToList(), total, p, size));
    }

    private static async Task<IResult> Fund(FundRequest request, HttpContext context, AdminFundingService funding, IUserNotifier notifier, CancellationToken ct)
    {
        if (!Enum.TryParse<FundingAsset>(request.Asset, ignoreCase: true, out var asset) || !Enum.IsDefined(asset)) return Problem(400, "UnknownAsset");
        try
        {
            var sent = await funding.FundAsync(context.User.WalletAddress(), request.Address, asset, request.Amount, ct);
            var amount = request.Amount.ToString("0.####", CultureInfo.InvariantCulture);
            await notifier.NotifyAsync(sent.Address, new UserNotification("FundsReceived", $"{amount} {asset.ToString().ToUpperInvariant()} received", $"An administrator sent you {amount} {asset.ToString().ToUpperInvariant()}."), ct);
            return Results.Ok(PresentFunding(sent, null));
        }
        catch (FundingException ex)
        {
            return Problem(ex.Code == "FundingDisabled" ? 503 : 400, ex.Code);
        }
    }

    private static object PresentFunding(AdminFunding f, string? username) => new
    {
        id = f.Id,
        address = EthAddress.ToChecksum(f.Address),
        username,
        asset = f.Asset.ToString().ToUpperInvariant(),
        amount = f.Amount.ToString(CultureInfo.InvariantCulture),
        txHash = f.TxHash,
        admin = EthAddress.ToChecksum(f.Admin),
        createdAt = f.CreatedAt,
    };

    // ---- Admins and audit log ----

    private static async Task<IResult> ListAdmins(ChainChatDbContext db, IOptions<AdminOptions> options, CancellationToken ct)
    {
        var roots = options.Value.Addresses.Where(EthAddress.IsValid).Select(EthAddress.Normalize).Distinct().ToList();
        var added = await db.Admins.AsNoTracking().OrderBy(a => a.CreatedAt).ToListAsync(ct);
        var all = roots.Concat(added.Select(a => a.Address)).Distinct().ToList();
        var names = await db.Users.AsNoTracking().Where(u => all.Contains(u.Address)).ToDictionaryAsync(u => u.Address, u => u.Username, ct);

        return Results.Ok(roots
            .Select(a => new { address = EthAddress.ToChecksum(a), username = names.GetValueOrDefault(a), isRoot = true, note = (string?)"Configured on the server", addedBy = (string?)null, addedAt = (DateTimeOffset?)null })
            .Concat(added.Where(a => !roots.Contains(a.Address)).Select(a => new
            {
                address = EthAddress.ToChecksum(a.Address),
                username = names.GetValueOrDefault(a.Address),
                isRoot = false,
                note = a.Note,
                addedBy = (string?)EthAddress.ToChecksum(a.AddedBy),
                addedAt = (DateTimeOffset?)a.CreatedAt,
            })));
    }

    private static async Task<IResult> AddAdmin(AddAdminRequest request, HttpContext context, ChainChatDbContext db, AdminService admins, TimeProvider time, CancellationToken ct)
    {
        var me = context.User.WalletAddress();
        if (!admins.IsRoot(me)) return Problem(403, "OnlyRootAdmins");
        if (!EthAddress.IsValid(request.Address)) return Problem(400, "InvalidAddress");
        var normalized = EthAddress.Normalize(request.Address);
        if (await admins.IsAdminAsync(normalized, ct)) return Results.NoContent();
        if (await db.BannedUsers.AnyAsync(b => b.Address == normalized, ct)) return Problem(409, "UserIsBanned");

        var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        if (note is { Length: > 200 }) return Problem(400, "NoteTooLong");
        db.Admins.Add(new AdminAccount { Address = normalized, Note = note, AddedBy = EthAddress.Normalize(me), CreatedAt = time.GetUtcNow() });
        admins.Audit(me, "AddAdmin", normalized, note);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> RemoveAdmin(string address, HttpContext context, ChainChatDbContext db, AdminService admins, CancellationToken ct)
    {
        var me = context.User.WalletAddress();
        if (!admins.IsRoot(me)) return Problem(403, "OnlyRootAdmins");
        if (!EthAddress.IsValid(address)) return Problem(400, "InvalidAddress");
        var normalized = EthAddress.Normalize(address);
        if (admins.IsRoot(normalized)) return Problem(409, "RootAdminsAreConfiguredOnTheServer");

        var row = await db.Admins.FirstOrDefaultAsync(a => a.Address == normalized, ct);
        if (row is null) return Results.NoContent();
        db.Admins.Remove(row);
        admins.Audit(me, "RemoveAdmin", normalized);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> ListAudit(int? page, int? pageSize, ChainChatDbContext db, CancellationToken ct)
    {
        var (p, size) = Paging(page, pageSize);
        var total = await db.AdminAuditEntries.CountAsync(ct);
        var rows = await db.AdminAuditEntries.AsNoTracking().OrderByDescending(e => e.Id).Skip((p - 1) * size).Take(size)
            .Select(e => new { Entry = e, Username = db.Users.Where(u => u.Address == e.Admin).Select(u => u.Username).FirstOrDefault() })
            .ToListAsync(ct);

        return Results.Ok(new Paged<object>(rows.Select(r => (object)new
        {
            id = r.Entry.Id,
            admin = EthAddress.ToChecksum(r.Entry.Admin),
            adminUsername = r.Username,
            action = r.Entry.Action,
            target = r.Entry.Target,
            details = r.Entry.Details,
            createdAt = r.Entry.CreatedAt,
        }).ToList(), total, p, size));
    }

    // ---- Announcements ----

    private static async Task<IResult> ListAnnouncements(int? page, int? pageSize, ChainChatDbContext db, CancellationToken ct)
    {
        var (p, size) = Paging(page, pageSize);
        var total = await db.Announcements.CountAsync(ct);
        var rows = await db.Announcements.AsNoTracking().OrderByDescending(a => a.Id).Skip((p - 1) * size).Take(size).ToListAsync(ct);
        return Results.Ok(new Paged<object>(rows.Select(a => (object)new
        {
            id = a.Id,
            title = a.Title,
            body = a.Body,
            admin = EthAddress.ToChecksum(a.Admin),
            onlineRecipients = a.OnlineRecipients,
            createdAt = a.CreatedAt,
        }).ToList(), total, p, size));
    }

    private static async Task<IResult> SendAnnouncement(
        AnnouncementRequest request, HttpContext context, ChainChatDbContext db, AdminService admins, IUserNotifier notifier, PresenceTracker presence, TimeProvider time, CancellationToken ct)
    {
        var title = (request.Title ?? "").Trim();
        var body = (request.Body ?? "").Trim();
        if (title.Length is 0 or > 80) return Problem(400, "InvalidTitle");
        if (body.Length is 0 or > 500) return Problem(400, "InvalidBody");

        var me = context.User.WalletAddress();
        var announcement = new Announcement { Title = title, Body = body, Admin = EthAddress.Normalize(me), OnlineRecipients = presence.OnlineCount, CreatedAt = time.GetUtcNow() };
        db.Announcements.Add(announcement);
        admins.Audit(me, "SendAnnouncement", null, title);
        await db.SaveChangesAsync(ct);

        // Only connected apps receive it: announcements are not queued for users who are offline.
        await notifier.BroadcastAsync(new UserNotification("Announcement", title, body), ct);
        return Results.Ok(new { id = announcement.Id, onlineRecipients = announcement.OnlineRecipients });
    }

    // ---- System ----

    private static async Task<IResult> GetSystem(
        ChainChatDbContext db, ChainClient chain, ContractDeployments deployments, SystemSettings settings, AdminFundingService funding,
        IOptions<ChainOptions> chainOptions, IOptions<AnchoringOptions> anchoring, IOptions<IndexerOptions> indexer, IOptions<PaymentOptions> payments,
        IOptions<GasDripOptions> gasDrip, IOptions<AuthOptions> auth, IOptions<AdminOptions> admin, IConfiguration configuration, CancellationToken ct)
    {
        long? block = null;
        AccountBalances? funder = null;
        try
        {
            block = await chain.GetBlockNumberAsync(ct);
            if (funding.FunderAddress is { } address) funder = await funding.GetBalancesAsync(address, ct);
        }
        catch (InvalidOperationException)
        {
            // Chain unreachable: reported as blockNumber = null.
        }

        var rateLimiting = configuration.GetSection("RateLimiting").Get<RateLimitingOptions>() ?? new RateLimitingOptions();
        var current = await settings.GetAsync(ct);
        var sync = await db.ChainSyncStates.AsNoTracking().OrderBy(s => s.ContractName).ToListAsync(ct);

        // Secrets (private keys, the JWT key, connection strings) are never returned.
        return Results.Ok(new
        {
            chain = new { network = chainOptions.Value.Network, chainId = chainOptions.Value.ChainId, rpcUrls = chainOptions.Value.RpcUrls, blockNumber = block },
            contracts = deployments.Names.OrderBy(n => n).Select(n => new { name = n, address = deployments.TryGet(n, out var d) ? d.Address : "", deployBlock = deployments.TryGet(n, out var e) ? e.DeployBlock : 0 }),
            indexer = sync.Select(s => new { contract = s.ContractName, lastProcessedBlock = s.LastProcessedBlock, updatedAt = s.UpdatedAt, behind = block is null ? (long?)null : Math.Max(0, block.Value - s.LastProcessedBlock) }),
            funder = new
            {
                enabled = funding.Enabled,
                address = funding.FunderAddress,
                eth = funder?.Eth.ToString(CultureInfo.InvariantCulture),
                chat = funder?.Chat?.ToString(CultureInfo.InvariantCulture),
                maxFundEth = admin.Value.MaxFundEth,
                maxFundChat = admin.Value.MaxFundChat,
            },
            settings = new
            {
                messagingPaused = current.MessagingPaused,
                groupCreationEnabled = current.GroupCreationEnabled,
                groupMaxMembers = current.GroupMaxMembers,
                gasDripEnabled = current.GasDripEnabled,
            },
            configuration = new
            {
                anchoring = new { anchoring.Value.Enabled, anchoring.Value.IntervalSeconds, anchoring.Value.SettleSeconds, anchoring.Value.MaxBatchSize },
                indexer = new { indexer.Value.Enabled, indexer.Value.PollIntervalSeconds, indexer.Value.Confirmations, indexer.Value.BatchSize },
                payments = new { payments.Value.PollIntervalSeconds, payments.Value.Confirmations, payments.Value.GiveUpAfterMinutes },
                gasDrip = new { gasDrip.Value.Enabled, gasDrip.Value.AmountEth },
                auth = new { auth.Value.TokenLifetimeMinutes, auth.Value.NonceLifetimeMinutes },
                rateLimiting = new { rateLimiting.PermitLimit, rateLimiting.WindowSeconds },
                groups = new { maxMembersLimit = GroupService.MaxMembers },
            },
        });
    }

    private static async Task<IResult> UpdateSettings(Dictionary<string, System.Text.Json.JsonElement> request, HttpContext context, ChainChatDbContext db, SystemSettings settings, AdminService admins, CancellationToken ct)
    {
        var keys = new Dictionary<string, string>
        {
            ["messagingPaused"] = SystemSettings.MessagingPaused,
            ["groupCreationEnabled"] = SystemSettings.GroupCreationEnabled,
            ["groupMaxMembers"] = SystemSettings.GroupMaxMembers,
            ["gasDripEnabled"] = SystemSettings.GasDripEnabled,
        };

        var changes = new Dictionary<string, string>();
        var errors = new Dictionary<string, string[]>();
        foreach (var (name, json) in request)
        {
            var value = json.ValueKind switch
            {
                System.Text.Json.JsonValueKind.True => "true",
                System.Text.Json.JsonValueKind.False => "false",
                System.Text.Json.JsonValueKind.Number => json.GetRawText(),
                _ => json.ToString(),
            };
            var error = keys.TryGetValue(name, out var key) ? SystemSettings.Validate(key, value) : "Unknown setting.";
            if (error is null) changes[key!] = value;
            else errors[name] = [error];
        }
        if (errors.Count > 0) return Results.ValidationProblem(errors);
        if (changes.Count == 0) return Problem(400, "NothingToChange");

        var me = context.User.WalletAddress();
        var updated = await settings.UpdateAsync(changes, me, ct);
        admins.Audit(me, "UpdateSettings", null, string.Join(", ", changes.Select(c => $"{c.Key}={c.Value}")));
        await db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            messagingPaused = updated.MessagingPaused,
            groupCreationEnabled = updated.GroupCreationEnabled,
            groupMaxMembers = updated.GroupMaxMembers,
            gasDripEnabled = updated.GasDripEnabled,
        });
    }

    private static async Task<IResult> AnchorNow(HttpContext context, ChainChatDbContext db, AnchoringJob job, AdminService admins, CancellationToken ct)
    {
        job.RequestRun();
        admins.Audit(context.User.WalletAddress(), "AnchorNow");
        await db.SaveChangesAsync(ct);
        return Results.Accepted((string?)null, new { requested = true });
    }

    // ---- Helpers ----

    private static (int Page, int Size) Paging(int? page, int? pageSize) => (Math.Max(page ?? 1, 1), Math.Clamp(pageSize ?? 25, 1, 100));

    private static IResult Problem(int status, string code) => Results.Problem(statusCode: status, title: "Admin request failed", detail: code);
}
