using System.ComponentModel.DataAnnotations;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;

namespace ChainChat.Infrastructure.Chain;

/// <summary>Demo-only test-ETH faucet for new wallets (configuration section "GasDrip", SDD §4.2).</summary>
public sealed class GasDripOptions
{
    public const string SectionName = "GasDrip";

    public bool Enabled { get; set; }

    /// <summary>Key of the funded drip wallet. Local default: a public Anvil development key. Never a real key in git.</summary>
    public string PrivateKey { get; set; } = "";

    /// <summary>ETH sent per drip — enough for registration and a few transactions.</summary>
    [Range(typeof(decimal), "0.0001", "1")]
    public decimal AmountEth { get; set; } = 0.05m;
}

public enum GasDripStatus
{
    Sent,
    AlreadyFunded,
    AlreadyDripped,
    Disabled,
}

public sealed record GasDripResult(GasDripStatus Status, string? TxHash = null, decimal? AmountEth = null);

public sealed class GasDripService(
    ChainChatDbContext db,
    ChainClient chain,
    IOptions<GasDripOptions> options,
    IOptions<ChainOptions> chainOptions,
    TimeProvider time,
    ILogger<GasDripService> logger)
{
    private const string PendingTxHash = "pending";

    /// <summary>Sends AmountEth to <paramref name="address"/> once; skips wallets that already have at least that much.</summary>
    public async Task<GasDripResult> DripAsync(string address, CancellationToken ct)
    {
        var settings = options.Value;
        if (!settings.Enabled) return new GasDripResult(GasDripStatus.Disabled);

        var normalized = EthAddress.Normalize(address);
        if (await db.GasDrips.AnyAsync(d => d.Address == normalized, ct)) return new GasDripResult(GasDripStatus.AlreadyDripped);

        var balanceWei = (await chain.ExecuteAsync(web3 => web3.Eth.GetBalance.SendRequestAsync(normalized), ct)).Value;
        var amountWei = Web3.Convert.ToWei(settings.AmountEth);
        if (balanceWei >= amountWei) return new GasDripResult(GasDripStatus.AlreadyFunded);

        // Reserve the address first: the primary key makes a concurrent second drip fail here instead of sending twice.
        var drip = new GasDrip { Address = normalized, TxHash = PendingTxHash, AmountWei = amountWei, CreatedAt = time.GetUtcNow() };
        db.GasDrips.Add(drip);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return new GasDripResult(GasDripStatus.AlreadyDripped);
        }

        try
        {
            var account = new Account(settings.PrivateKey, chainOptions.Value.ChainId);
            var web3 = new Web3(account, chainOptions.Value.RpcUrls[0]);
            var receipt = await web3.Eth.GetEtherTransferService()
                .TransferEtherAndWaitForReceiptAsync(EthAddress.ToChecksum(normalized), settings.AmountEth, cancellationToken: ct);

            drip.TxHash = receipt.TransactionHash;
            await db.SaveChangesAsync(CancellationToken.None);

            logger.LogInformation("Gas drip of {Amount} ETH to {Address}: {TxHash}", settings.AmountEth, normalized, receipt.TransactionHash);
            return new GasDripResult(GasDripStatus.Sent, receipt.TransactionHash, settings.AmountEth);
        }
        catch
        {
            // Release the reservation so the user can try again.
            db.GasDrips.Remove(drip);
            await db.SaveChangesAsync(CancellationToken.None);
            throw;
        }
    }
}
