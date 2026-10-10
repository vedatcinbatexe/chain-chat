using System.Globalization;
using ChainChat.Api.Auth;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Assets;
using ChainChat.Infrastructure.Chain;

namespace ChainChat.Api.Endpoints;

/// <summary>
/// The simulated exchange portal's API and the app's transfer report (SDD §4.5).
/// <para>
/// The portal routes need no login and can create test balances, so they exist only when <c>Exchange:Enabled</c>
/// is set (local development). They never touch a user's ChainChat wallet: a withdrawal is signed on the phone and
/// only reported here afterwards.
/// </para>
/// </summary>
public static class ExchangeEndpoints
{
    public sealed record CreateWalletRequest(string Label);

    public sealed record AmountRequest(string Asset, string Amount);

    public sealed record DepositRequest(string Recipient, string Asset, string Amount);

    public sealed record ReportTransferRequest(string TxHash);

    public static void MapExchangeEndpoints(this WebApplication app)
    {
        var exchange = app.MapGroup("/api/v1/exchange").WithTags("Exchange (demo)").AddEndpointFilter(async (context, next) =>
            context.HttpContext.RequestServices.GetRequiredService<ExchangeService>().Enabled
                ? await next(context)
                : Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "The exchange portal is not enabled on this server"));

        exchange.MapGet("/assets", (AssetCatalog catalog) => Results.Ok(catalog.Assets.Select(PresentAsset)))
            .WithSummary("The assets wallets can hold");

        exchange.MapGet("/accounts/{account}/wallets", async (string account, ExchangeService service, CancellationToken ct) =>
                Results.Ok((await service.ListAsync(account, ct)).Select(PresentWallet)))
            .WithSummary("An account's wallets with their on-chain balances");

        exchange.MapPost("/accounts/{account}/wallets", async (string account, CreateWalletRequest request, ExchangeService service, CancellationToken ct) =>
                Results.Ok(PresentWallet(await service.CreateWalletAsync(account, request.Label, ct))))
            .WithSummary("Creates a wallet; the server holds its key");

        exchange.MapPost("/accounts/{account}/wallets/{address}/balance", async (string account, string address, AmountRequest request, ExchangeService service, CancellationToken ct) =>
                Results.Ok(PresentTransfer(await service.AddBalanceAsync(account, address, request.Asset, request.Amount, ct))))
            .WithSummary("Adds a test balance to a wallet (mints the token or sends test ETH)");

        exchange.MapPost("/accounts/{account}/wallets/{address}/deposit", async (string account, string address, DepositRequest request, ExchangeService service, CancellationToken ct) =>
                Results.Ok(PresentTransfer(await service.DepositAsync(account, address, request.Recipient, request.Asset, request.Amount, ct))))
            .WithSummary("Deposits into ChainChat: transfers from the wallet to a user (username or address)");

        exchange.MapGet("/accounts/{account}/wallets/{address}/history", async (string account, string address, ExchangeService service, ChainChat.Infrastructure.Persistence.ChainChatDbContext db, CancellationToken ct) =>
            {
                var history = await service.HistoryAsync(account, address, ct);
                // Show ChainChat usernames next to the addresses.
                var addresses = history.SelectMany(t => new[] { t.From, t.To }).Distinct().ToList();
                var names = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ToDictionaryAsync(
                    db.Users.Where(u => addresses.Contains(u.Address)), u => u.Address, u => u.Username, ct);
                return Results.Ok(history.Select(t => new
                {
                    txHash = t.TxHash,
                    from = EthAddress.ToChecksum(t.From),
                    fromUsername = names.GetValueOrDefault(t.From),
                    to = EthAddress.ToChecksum(t.To),
                    toUsername = names.GetValueOrDefault(t.To),
                    asset = t.Asset,
                    amount = t.Amount.ToString(CultureInfo.InvariantCulture),
                    kind = t.Kind.ToString(),
                    createdAt = t.CreatedAt,
                }));
            })
            .WithSummary("Deposits, withdrawals and added balances of a wallet");

        // Used by the mobile app after it sent a transfer from the user's own wallet (a withdrawal).
        app.MapPost("/api/v1/transfers/report", async (ReportTransferRequest request, HttpContext context, AssetTransferService transfers, CancellationToken ct) =>
                Results.Ok(PresentTransfer(await transfers.ReportAsync(context.User.WalletAddress(), request.TxHash, ct))))
            .RequireAuthorization()
            .WithTags("Assets")
            .WithSummary("Records a transfer the signed-in wallet sent, after reading it from the chain, and notifies the recipient");
    }

    public static object PresentAsset(Asset asset) => new
    {
        symbol = asset.Symbol,
        name = asset.Name,
        address = asset.Address is null ? null : EthAddress.ToChecksum(asset.Address),
        decimals = asset.Decimals,
        deployBlock = asset.DeployBlock,
    };

    private static object PresentWallet(ExchangeWalletView wallet) => new
    {
        address = EthAddress.ToChecksum(wallet.Address),
        label = wallet.Label,
        createdAt = wallet.CreatedAt,
        balances = wallet.Balances.ToDictionary(b => b.Key, b => b.Value.ToString(CultureInfo.InvariantCulture)),
    };

    public static object PresentTransfer(AssetTransfer transfer) => new
    {
        txHash = transfer.TxHash,
        from = EthAddress.ToChecksum(transfer.From),
        to = EthAddress.ToChecksum(transfer.To),
        asset = transfer.Asset,
        amount = transfer.Amount.ToString(CultureInfo.InvariantCulture),
        kind = transfer.Kind.ToString(),
        createdAt = transfer.CreatedAt,
    };

    /// <summary>Maps <see cref="AssetException"/> to ProblemDetails responses.</summary>
    public static IApplicationBuilder UseAssetErrors(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            try
            {
                await next(context);
            }
            catch (AssetException ex)
            {
                await Results.Problem(statusCode: ex.Status, title: "Asset request failed", detail: ex.Code).ExecuteAsync(context);
            }
        });
}
