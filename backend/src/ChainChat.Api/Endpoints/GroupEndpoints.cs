using ChainChat.Api.Auth;
using ChainChat.Api.Hubs;
using ChainChat.Core.Crypto;
using ChainChat.Infrastructure.Messaging;
using Microsoft.AspNetCore.SignalR;

namespace ChainChat.Api.Endpoints;

/// <summary>Group conversations: create, share an invite link, join, leave (SDD §6.5).</summary>
public static class GroupEndpoints
{
    public sealed record CreateGroupRequest(string Name);

    public sealed record JoinGroupRequest(string InviteCode);

    public static void MapGroupEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/groups").WithTags("Groups").RequireAuthorization();

        group.MapPost("/", async (CreateGroupRequest request, HttpContext context, GroupService groups, CancellationToken ct) =>
                Results.Ok(Present(await groups.CreateAsync(context.User.WalletAddress(), request.Name, ct))))
            .WithSummary("Creates a group; the creator is its first member");

        group.MapGet("/{id}", async (string id, HttpContext context, GroupService groups, CancellationToken ct) =>
                Results.Ok(Present(await groups.GetAsync(context.User.WalletAddress(), id, ct))))
            .WithSummary("Group details and members (members only)");

        group.MapGet("/invites/{code}", async (string code, HttpContext context, GroupService groups, CancellationToken ct) =>
                Results.Ok(await groups.PreviewAsync(context.User.WalletAddress(), code, ct)))
            .WithSummary("What an invite link leads to, before joining");

        group.MapPost("/join", async (JoinGroupRequest request, HttpContext context, GroupService groups, IHubContext<ChatHub, IChatClient> hub, CancellationToken ct) =>
            {
                var (info, joined) = await groups.JoinAsync(context.User.WalletAddress(), request.InviteCode, ct);
                // Members must learn about the newcomer: their apps encrypt new messages to the updated member list.
                if (joined) await hub.Clients.Users(info.Members.Select(m => m.Address).ToList()).ConversationUpdated(new ConversationUpdatedDto(info.ConversationId, "MemberJoined"));
                return Results.Ok(Present(info));
            })
            .WithSummary("Joins a group with its invite code");

        group.MapPost("/{id}/leave", async (string id, HttpContext context, GroupService groups, IHubContext<ChatHub, IChatClient> hub, CancellationToken ct) =>
            {
                var me = context.User.WalletAddress();
                await groups.LeaveAsync(me, id, ct);
                var remaining = await groups.ActiveMembersAsync(id.ToLowerInvariant(), ct);
                await hub.Clients.Users([.. remaining.Select(m => m.Address), EthAddress.Normalize(me)]).ConversationUpdated(new ConversationUpdatedDto(id.ToLowerInvariant(), "MemberLeft"));
                return Results.NoContent();
            })
            .WithSummary("Leaves a group; new messages are no longer encrypted to the leaver");
    }

    /// <summary>Checksummed addresses for apps.</summary>
    private static GroupInfo Present(GroupInfo g) => g with
    {
        CreatedBy = EthAddress.ToChecksum(g.CreatedBy),
        Members = g.Members.Select(m => m with { Address = EthAddress.ToChecksum(m.Address) }).ToList(),
    };

    /// <summary>Maps <see cref="GroupException"/> to ProblemDetails responses.</summary>
    public static IApplicationBuilder UseGroupErrors(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            try
            {
                await next(context);
            }
            catch (GroupException ex)
            {
                await Results.Problem(statusCode: ex.Status, title: "Group request failed", detail: ex.Code).ExecuteAsync(context);
            }
        });
}
