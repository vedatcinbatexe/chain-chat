using System.ComponentModel.DataAnnotations;
using System.Numerics;
using System.Text.RegularExpressions;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Chain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Nethereum.Signer;
using Nethereum.Web3;

namespace ChainChat.Infrastructure.Assets;

/// <summary>The simulated exchange portal (configuration section "Exchange", SDD §4.5). Demo only.</summary>
public sealed class ExchangeOptions
{
    public const string SectionName = "Exchange";

    /// <summary>Off by default: the portal's API needs no login and can create test balances.</summary>
    public bool Enabled { get; set; }

    /// <summary>Largest amount (in whole units) a visitor can add to a wallet in one action.</summary>
    [Range(typeof(decimal), "1", "1000000000", ParseLimitsInInvariantCulture = true)]
    public decimal MaxFundPerAction { get; set; } = 1_000_000m;

    /// <summary>Test ETH sent to a new exchange wallet (and topped up when low) so it can pay gas for deposits.</summary>
    [Range(typeof(decimal), "0.001", "1", ParseLimitsInInvariantCulture = true)]
    public decimal GasEth { get; set; } = 0.05m;

    [Range(1, 50)]
    public int MaxWalletsPerAccount { get; set; } = 10;
}

public sealed record ExchangeWalletView(string Address, string Label, DateTimeOffset CreatedAt, IReadOnlyDictionary<string, BigInteger> Balances);

/// <summary>
/// A stand-in for "the outside world" (SDD §4.5): visitors create wallets whose keys the server holds, like an
/// exchange does, give them test balances, and deposit from them to ChainChat users. Every balance and every
/// movement is real on the local chain; this service only remembers which wallets exist.
/// </summary>
public sealed partial class ExchangeService(
    ChainChatDbContext db,
    AssetCatalog catalog,
    AssetTransferService transfers,
    IOptions<ExchangeOptions> options,
    TimeProvider time)
{
    [GeneratedRegex("^[a-z0-9_-]{2,32}$")]
    private static partial Regex AccountPattern();

    public bool Enabled => options.Value.Enabled;

    /// <summary>The account name in its stored form. Throws InvalidAccountName.</summary>
    public static string NormalizeAccount(string? name)
    {
        var normalized = (name ?? "").Trim().ToLowerInvariant();
        return AccountPattern().IsMatch(normalized) ? normalized : throw new AssetException("InvalidAccountName");
    }

    public async Task<IReadOnlyList<ExchangeWalletView>> ListAsync(string account, CancellationToken ct)
    {
        var owner = NormalizeAccount(account);
        var wallets = await db.ExchangeWallets.AsNoTracking().Where(w => w.Owner == owner).OrderBy(w => w.CreatedAt).ToListAsync(ct);
        var views = new List<ExchangeWalletView>(wallets.Count);
        foreach (var wallet in wallets) views.Add(new ExchangeWalletView(wallet.Address, wallet.Label, wallet.CreatedAt, await catalog.BalancesAsync(wallet.Address, ct)));
        return views;
    }

    /// <summary>Creates a wallet with a fresh key pair and sends it a little test ETH for gas.</summary>
    public async Task<ExchangeWalletView> CreateWalletAsync(string account, string? label, CancellationToken ct)
    {
        var owner = NormalizeAccount(account);
        var name = (label ?? "").Trim();
        if (name.Length is 0 or > 40) throw new AssetException("InvalidLabel");
        if (await db.ExchangeWallets.CountAsync(w => w.Owner == owner, ct) >= options.Value.MaxWalletsPerAccount) throw new AssetException("TooManyWallets", 409);

        var key = EthECKey.GenerateKey();
        var wallet = new ExchangeWallet
        {
            Address = EthAddress.Normalize(key.GetPublicAddress()),
            Owner = owner,
            Label = name,
            PrivateKey = key.GetPrivateKey(),
            CreatedAt = time.GetUtcNow(),
        };
        db.ExchangeWallets.Add(wallet);
        await db.SaveChangesAsync(ct);

        await transfers.FundAsync(catalog.Find("ETH")!, wallet.Address, Web3.Convert.ToWei(options.Value.GasEth), ct);
        return new ExchangeWalletView(wallet.Address, wallet.Label, wallet.CreatedAt, await catalog.BalancesAsync(wallet.Address, ct));
    }

    /// <summary>Adds a test balance to one of the account's wallets.</summary>
    public async Task<AssetTransfer> AddBalanceAsync(string account, string address, string? symbol, string? amount, CancellationToken ct)
    {
        var wallet = await OwnedWalletAsync(account, address, ct);
        var asset = catalog.Find(symbol) ?? throw new AssetException("UnknownAsset");
        var wei = AssetTransferService.ParseAmount(amount);
        if (wei > Web3.Convert.ToWei(options.Value.MaxFundPerAction)) throw new AssetException("AmountTooLarge");
        return await transfers.FundAsync(asset, wallet.Address, wei, ct);
    }

    /// <summary>Deposits into ChainChat: a real transfer from the exchange wallet to a user's wallet address.</summary>
    /// <param name="recipient">A ChainChat username (with or without @) or a wallet address.</param>
    public async Task<AssetTransfer> DepositAsync(string account, string address, string? recipient, string? symbol, string? amount, CancellationToken ct)
    {
        var wallet = await OwnedWalletAsync(account, address, ct);
        var asset = catalog.Find(symbol) ?? throw new AssetException("UnknownAsset");
        var wei = AssetTransferService.ParseAmount(amount);
        var to = await ResolveRecipientAsync(recipient, ct);
        if (to == wallet.Address) throw new AssetException("SameWallet");

        // The wallet pays its own gas; keep it able to.
        var eth = catalog.Find("ETH")!;
        var gasReserve = Web3.Convert.ToWei(options.Value.GasEth) / 5;
        if (await catalog.BalanceAsync(eth, wallet.Address, ct) < gasReserve + (asset.IsNative ? wei : 0))
        {
            if (asset.IsNative) throw new AssetException("InsufficientBalance"); // sending ETH must leave some for gas
            await transfers.FundAsync(eth, wallet.Address, Web3.Convert.ToWei(options.Value.GasEth), ct);
        }

        return await transfers.SendAsync(wallet.PrivateKey, asset, to, wei, AssetTransferKind.Deposit, ct);
    }

    /// <summary>Everything that moved in or out of the wallet, newest first.</summary>
    public async Task<IReadOnlyList<AssetTransfer>> HistoryAsync(string account, string address, CancellationToken ct)
    {
        var wallet = await OwnedWalletAsync(account, address, ct);
        return await db.AssetTransfers.AsNoTracking()
            .Where(t => t.From == wallet.Address || t.To == wallet.Address)
            .OrderByDescending(t => t.CreatedAt)
            .Take(100)
            .ToListAsync(ct);
    }

    /// <summary>The wallet address of a ChainChat username, or the address itself.</summary>
    public async Task<string> ResolveRecipientAsync(string? recipient, CancellationToken ct)
    {
        var value = (recipient ?? "").Trim();
        if (EthAddress.IsValid(value)) return EthAddress.Normalize(value);

        var username = value.TrimStart('@').ToLowerInvariant();
        return await db.Users.AsNoTracking().Where(u => u.Username == username).Select(u => u.Address).FirstOrDefaultAsync(ct)
            ?? throw new AssetException("RecipientNotFound", 404);
    }

    private async Task<ExchangeWallet> OwnedWalletAsync(string account, string address, CancellationToken ct)
    {
        var owner = NormalizeAccount(account);
        if (!EthAddress.IsValid(address)) throw new AssetException("InvalidAddress");
        var normalized = EthAddress.Normalize(address);
        return await db.ExchangeWallets.AsNoTracking().FirstOrDefaultAsync(w => w.Address == normalized && w.Owner == owner, ct)
            ?? throw new AssetException("WalletNotFound", 404);
    }
}
