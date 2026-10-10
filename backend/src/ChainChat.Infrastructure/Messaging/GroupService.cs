using System.Security.Cryptography;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChainChat.Infrastructure.Messaging;

public sealed record GroupMember(string Address, string? Username, DateTimeOffset JoinedAt);

/// <param name="InviteCode">Only returned to members — the code is what lets someone join.</param>
public sealed record GroupInfo(
    string ConversationId,
    string Name,
    string CreatedBy,
    DateTimeOffset CreatedAt,
    int MaxMembers,
    string InviteCode,
    IReadOnlyList<GroupMember> Members);

/// <summary>What someone with an invite link sees before joining.</summary>
public sealed record InvitePreview(string ConversationId, string Name, int MemberCount, int MaxMembers, string? CreatedByUsername, bool AlreadyMember);

/// <summary>Why a group operation was refused; mapped to an HTTP status by the API.</summary>
public sealed class GroupException(string code, int status) : Exception(code)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
}

/// <summary>Group conversations joined with an invite link (SDD §6.5). Messages stay end-to-end encrypted to all members.</summary>
public sealed class GroupService(ChainChatDbContext db, TimeProvider time)
{
    public const int MaxNameLength = 64;
    public const int MaxMembers = 20; // per-member key wrapping keeps messages small up to this size
    private const string Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    public async Task<GroupInfo> CreateAsync(string creator, string name, CancellationToken ct)
    {
        var me = EthAddress.Normalize(creator);
        var trimmed = name.Trim();
        if (trimmed.Length is 0 or > MaxNameLength) throw new GroupException("InvalidName", 400);
        await EnsureRegisteredAsync(me, ct);

        var now = time.GetUtcNow();
        var id = Hex.FromBytes(RandomNumberGenerator.GetBytes(32)); // group ids are random (SPEC.md §2)
        db.Conversations.Add(new Conversation
        {
            Id = id,
            Type = ConversationType.Group,
            CreatedAt = now,
            Group = new Group
            {
                ConversationId = id,
                Name = trimmed,
                InviteCode = RandomNumberGenerator.GetString(Alphabet, 22), // ~131 bits: unguessable
                MaxMembers = MaxMembers,
                CreatedBy = me,
                CreatedAt = now,
            },
            Participants = [new Participant { ConversationId = id, Address = me, JoinedAt = now }],
        });
        await db.SaveChangesAsync(ct);
        return await GetAsync(me, id, ct);
    }

    public async Task<GroupInfo> GetAsync(string requester, string conversationId, CancellationToken ct)
    {
        var me = EthAddress.Normalize(requester);
        var id = conversationId.ToLowerInvariant();
        var group = await db.Groups.AsNoTracking().FirstOrDefaultAsync(g => g.ConversationId == id, ct) ?? throw new GroupException("GroupNotFound", 404);
        var members = await ActiveMembersAsync(id, ct);
        if (!members.Any(m => m.Address == me)) throw new GroupException("GroupNotFound", 404); // members only

        return new GroupInfo(id, group.Name, group.CreatedBy, group.CreatedAt, group.MaxMembers, group.InviteCode, members);
    }

    public async Task<InvitePreview> PreviewAsync(string requester, string inviteCode, CancellationToken ct)
    {
        var me = EthAddress.Normalize(requester);
        var group = await db.Groups.AsNoTracking().FirstOrDefaultAsync(g => g.InviteCode == inviteCode, ct) ?? throw new GroupException("InviteNotFound", 404);
        var members = await ActiveMembersAsync(group.ConversationId, ct);
        var creator = await db.Users.AsNoTracking().Where(u => u.Address == group.CreatedBy).Select(u => u.Username).FirstOrDefaultAsync(ct);

        return new InvitePreview(group.ConversationId, group.Name, members.Count, group.MaxMembers, creator, members.Any(m => m.Address == me));
    }

    /// <returns>The group, and whether the user was newly added (false if already a member).</returns>
    public async Task<(GroupInfo Group, bool Joined)> JoinAsync(string requester, string inviteCode, CancellationToken ct)
    {
        var me = EthAddress.Normalize(requester);
        await EnsureRegisteredAsync(me, ct); // members need an on-chain encryption key
        var group = await db.Groups.FirstOrDefaultAsync(g => g.InviteCode == inviteCode, ct) ?? throw new GroupException("InviteNotFound", 404);

        var participant = await db.Participants.FirstOrDefaultAsync(p => p.ConversationId == group.ConversationId && p.Address == me, ct);
        if (participant is { RemovedAt: null }) return (await GetAsync(me, group.ConversationId, ct), false);

        var activeCount = await db.Participants.CountAsync(p => p.ConversationId == group.ConversationId && p.RemovedAt == null, ct);
        if (activeCount >= group.MaxMembers) throw new GroupException("GroupFull", 409);

        if (participant is null)
        {
            db.Participants.Add(new Participant { ConversationId = group.ConversationId, Address = me, JoinedAt = time.GetUtcNow() });
        }
        else
        {
            participant.RemovedAt = null; // rejoining after leaving
            participant.JoinedAt = time.GetUtcNow();
        }
        await db.SaveChangesAsync(ct);
        return (await GetAsync(me, group.ConversationId, ct), true);
    }

    public async Task LeaveAsync(string requester, string conversationId, CancellationToken ct)
    {
        var me = EthAddress.Normalize(requester);
        var id = conversationId.ToLowerInvariant();
        var participant = await db.Participants.FirstOrDefaultAsync(p => p.ConversationId == id && p.Address == me && p.RemovedAt == null, ct)
            ?? throw new GroupException("GroupNotFound", 404);
        participant.RemovedAt = time.GetUtcNow();
        await db.SaveChangesAsync(ct);
    }

    public async Task<List<GroupMember>> ActiveMembersAsync(string conversationId, CancellationToken ct)
    {
        var rows = await db.Participants.AsNoTracking()
            .Where(p => p.ConversationId == conversationId && p.RemovedAt == null)
            .GroupJoin(db.Users, p => p.Address, u => u.Address, (p, users) => new { p, users })
            .SelectMany(x => x.users.DefaultIfEmpty(), (x, u) => new { x.p.Address, Username = u == null ? null : u.Username, x.p.JoinedAt })
            .OrderBy(x => x.JoinedAt)
            .ToListAsync(ct);
        return rows.Select(r => new GroupMember(r.Address, r.Username, r.JoinedAt)).ToList();
    }

    private async Task EnsureRegisteredAsync(string address, CancellationToken ct)
    {
        if (!await db.Users.AnyAsync(u => u.Address == address, ct)) throw new GroupException("NotRegistered", 403);
    }
}
