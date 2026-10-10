using System.Globalization;
using ChainChat.Api.Auth;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChainChat.Api.Endpoints;

/// <summary>
/// Helps the app's Activity screen (SDD §2.1). Almost everything there is read from contract events on the chain;
/// plain ETH transfers emit no event, so the server lists the transactions it sent to the wallet (gas drip, admin
/// funding). The app treats them as hints and reads each transaction from the chain before showing it.
/// </summary>
public static class ActivityEndpoints
{
    /// <param name="Kind">GasDrip or AdminFunding.</param>
    /// <param name="Amount">The amount the server recorded, in wei (decimal string).</param>
    public sealed record EthTransferHint(string TxHash, string Kind, string Amount, DateTimeOffset CreatedAt);

    public static void MapActivityEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/activity/eth", async (HttpContext context, ChainChatDbContext db, CancellationToken ct) =>
            {
                var me = EthAddress.Normalize(context.User.WalletAddress());

                var drips = await db.GasDrips.AsNoTracking().Where(d => d.Address == me).ToListAsync(ct);
                var fundings = await db.AdminFundings.AsNoTracking().Where(f => f.Address == me && f.Asset == FundingAsset.Eth).ToListAsync(ct);

                return drips
                    .Where(d => d.TxHash.StartsWith("0x", StringComparison.Ordinal)) // skip a drip that is still being sent
                    .Select(d => new EthTransferHint(d.TxHash, "GasDrip", d.AmountWei.ToString(CultureInfo.InvariantCulture), d.CreatedAt))
                    .Concat(fundings.Select(f => new EthTransferHint(f.TxHash, "AdminFunding", f.Amount.ToString(CultureInfo.InvariantCulture), f.CreatedAt)))
                    .OrderByDescending(t => t.CreatedAt)
                    .ToList();
            })
            .RequireAuthorization()
            .WithTags("Activity")
            .WithSummary("ETH transfers the server sent to the signed-in wallet (gas drip, admin funding)");
    }
}
