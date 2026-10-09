using ChainChat.Api.Auth;
using ChainChat.Api.Common;
using ChainChat.Infrastructure.Chain;

namespace ChainChat.Api.Endpoints;

/// <summary>Demo-only gas drip: test ETH for the signed-in wallet so it can register (SDD §6.1).</summary>
public static class DripEndpoints
{
    public sealed record DripResponse(string Status, string? TxHash, decimal? AmountEth);

    public static void MapDripEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/drip", async (HttpContext context, GasDripService drips, CancellationToken ct) =>
            {
                // Only the signed-in wallet can receive a drip, so nobody can drain the faucet into other addresses.
                var result = await drips.DripAsync(context.User.WalletAddress(), ct);
                return result.Status == GasDripStatus.Disabled
                    ? Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Gas drip is disabled")
                    : Results.Ok(new DripResponse(result.Status.ToString(), result.TxHash, result.AmountEth));
            })
            .RequireAuthorization()
            .RequireRateLimiting(RateLimiting.DripPolicy)
            .WithTags("Drip")
            .WithSummary("Sends a one-time amount of test ETH to the signed-in wallet");
    }
}
