using ChainChat.Core.Crypto;
using ChainChat.Core.Users;
using ChainChat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace ChainChat.Api.Endpoints;

/// <summary>
/// Search and look up registered users, from the indexer's copy of the Registry (SDD §4.2).
/// Apps re-check encryption keys against the chain before using them — this API is a directory, not the authority.
/// </summary>
public static class UserEndpoints
{
    public sealed record UserSummary(string Address, string Username);

    public sealed record UserProfile(string Address, string Username, string EncryptionPublicKey, long RegisteredAtBlock, string RegistrationTxHash);

    public static void MapUserEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/users").WithTags("Users").RequireAuthorization();

        group.MapGet("/search", Search).WithSummary("Find users by username prefix or exact wallet address");
        group.MapGet("/{address}", GetProfile).WithSummary("A registered user's public profile");
    }

    private static async Task<Results<Ok<UserSummary[]>, ValidationProblem>> Search(
        string? q, int? limit, ChainChatDbContext db, CancellationToken ct)
    {
        var query = UserSearch.Parse(q);
        if (query is null)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["q"] = ["Enter part of a username (a-z, 0-9, _) or a full 0x address."],
            });
        }

        var users = db.Users.AsNoTracking();
        users = query switch
        {
            UserSearchQuery.ByAddress byAddress => users.Where(u => u.Address == byAddress.Address),
            UserSearchQuery.ByUsernamePrefix byPrefix => users.Where(u => EF.Functions.Like(u.Username, byPrefix.LikePattern, "\\")),
            _ => users.Where(_ => false),
        };

        var results = await users
            .OrderBy(u => u.Username)
            .Take(Math.Clamp(limit ?? 20, 1, 50))
            .Select(u => new { u.Address, u.Username })
            .ToListAsync(ct);

        return TypedResults.Ok(results.Select(u => new UserSummary(EthAddress.ToChecksum(u.Address), u.Username)).ToArray());
    }

    private static async Task<Results<Ok<UserProfile>, NotFound, ValidationProblem>> GetProfile(
        string address, ChainChatDbContext db, CancellationToken ct)
    {
        if (!EthAddress.IsValid(address))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["address"] = ["Must be a 0x-prefixed 20-byte address."] });
        }

        var normalized = EthAddress.Normalize(address);
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Address == normalized, ct);
        return user is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(new UserProfile(
                EthAddress.ToChecksum(user.Address), user.Username, user.EncryptionPublicKey, user.RegisteredAtBlock, user.RegistrationTxHash));
    }
}
