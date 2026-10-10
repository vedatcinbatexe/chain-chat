using System.Globalization;
using System.Numerics;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Admin;
using ChainChat.Infrastructure.Chain;
using ChainChat.Infrastructure.Notifications;
using ChainChat.Infrastructure.Payments;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nethereum.ABI.FunctionEncoding.Attributes;
using Nethereum.Contracts;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;

namespace ChainChat.Infrastructure.Assets;

[Function("transfer", "bool")]
public sealed class Erc20TransferFunction : FunctionMessage
{
    [Parameter("address", "to", 1)]
    public string To { get; set; } = "";

    [Parameter("uint256", "value", 2)]
    public BigInteger Value { get; set; }
}

/// <summary>Why an asset operation was refused; the code is returned to the caller.</summary>
public sealed class AssetException(string code, int status = 400) : Exception(code)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
}

/// <summary>
/// Moves assets on the chain for the server-held keys (the funder and the exchange portal's wallets), and keeps a
/// history of deposits, withdrawals and transfers. The history is a log of transactions; balances are never stored
/// — they are read from the chain (SDD §4.5).
/// </summary>
public sealed class AssetTransferService(
    ChainChatDbContext db,
    ChainClient chain,
    AssetCatalog catalog,
    IUserNotifier notifier,
    IOptions<AdminOptions> admin,
    IOptions<ChainOptions> chainOptions,
    TimeProvider time,
    ILogger<AssetTransferService> logger)
{
    public const string ZeroAddress = "0x0000000000000000000000000000000000000000";

    public bool FunderConfigured => admin.Value.FunderPrivateKey.Length > 0;

    /// <summary>"12.5" → wei. Throws AmountInvalid for anything that is not a positive number with at most 18 decimals.</summary>
    public static BigInteger ParseAmount(string? amount)
    {
        if (!decimal.TryParse(amount, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var value) || value <= 0) throw new AssetException("AmountInvalid");
        return Web3.Convert.ToWei(value);
    }

    public static string Format(BigInteger wei, Asset asset) =>
        $"{Web3.Convert.FromWei(wei).ToString("0.######", CultureInfo.InvariantCulture)} {asset.Symbol}";

    /// <summary>Creates balance out of nothing with the funder key: mints a token, or sends test ETH.</summary>
    public async Task<AssetTransfer> FundAsync(Asset asset, string to, BigInteger amountWei, CancellationToken ct)
    {
        if (!FunderConfigured) throw new AssetException("FundingDisabled", 503);
        var web3 = Web3For(admin.Value.FunderPrivateKey);
        var recipient = EthAddress.ToChecksum(to);

        string txHash;
        await FunderGate.Lock.WaitAsync(ct);
        try
        {
            if (asset.IsNative)
            {
                var receipt = await web3.Eth.GetEtherTransferService().TransferEtherAndWaitForReceiptAsync(recipient, Web3.Convert.FromWei(amountWei), cancellationToken: ct);
                txHash = receipt.TransactionHash;
            }
            else
            {
                var receipt = await web3.Eth.GetContractTransactionHandler<MintFunction>()
                    .SendRequestAndWaitForReceiptAsync(asset.Address, new MintFunction { To = recipient, Amount = amountWei }, ct);
                if (receipt.Status?.Value != 1) throw new AssetException("TransactionReverted");
                txHash = receipt.TransactionHash;
            }
        }
        finally
        {
            FunderGate.Lock.Release();
        }

        var from = asset.IsNative ? new Account(admin.Value.FunderPrivateKey).Address : ZeroAddress;
        return await RecordAsync(txHash, from, to, asset, amountWei, AssetTransferKind.Funding, ct);
    }

    /// <summary>Sends an asset from a wallet whose key the server holds (an exchange wallet) and waits until it is mined.</summary>
    public async Task<AssetTransfer> SendAsync(string privateKey, Asset asset, string to, BigInteger amountWei, AssetTransferKind kind, CancellationToken ct)
    {
        var account = new Account(privateKey, chainOptions.Value.ChainId);
        if (await catalog.BalanceAsync(asset, account.Address, ct) < amountWei) throw new AssetException("InsufficientBalance");

        var web3 = new Web3(account, chainOptions.Value.RpcUrls[0]);
        var recipient = EthAddress.ToChecksum(to);
        string txHash;
        try
        {
            if (asset.IsNative)
            {
                txHash = (await web3.Eth.GetEtherTransferService().TransferEtherAndWaitForReceiptAsync(recipient, Web3.Convert.FromWei(amountWei), cancellationToken: ct)).TransactionHash;
            }
            else
            {
                var receipt = await web3.Eth.GetContractTransactionHandler<Erc20TransferFunction>()
                    .SendRequestAndWaitForReceiptAsync(asset.Address, new Erc20TransferFunction { To = recipient, Value = amountWei }, ct);
                if (receipt.Status?.Value != 1) throw new AssetException("TransactionReverted");
                txHash = receipt.TransactionHash;
            }
        }
        catch (Exception ex) when (ex is not AssetException and not OperationCanceledException)
        {
            // Most often: not enough ETH left for gas after sending the whole ETH balance.
            logger.LogWarning(ex, "Transfer of {Asset} from {From} failed", asset.Symbol, account.Address);
            throw new AssetException("TransferFailed");
        }

        return await RecordAsync(txHash, account.Address, to, asset, amountWei, kind, ct);
    }

    /// <summary>
    /// Records a transfer the app sent from the user's own wallet (a withdrawal, or sending to another address). The
    /// server does not take the app's word for it: the transaction is read from the chain and must come from
    /// <paramref name="sender"/>. Idempotent.
    /// </summary>
    public async Task<AssetTransfer> ReportAsync(string sender, string txHash, CancellationToken ct)
    {
        var me = EthAddress.Normalize(sender);
        string hash;
        try
        {
            var bytes = Hex.ToBytes(txHash);
            if (bytes.Length != 32) throw new FormatException();
            hash = Hex.FromBytes(bytes);
        }
        catch (FormatException)
        {
            throw new AssetException("InvalidTransactionHash");
        }

        var existing = await db.AssetTransfers.AsNoTracking().FirstOrDefaultAsync(t => t.TxHash == hash, ct);
        if (existing is not null) return existing.From == me ? existing : throw new AssetException("NotYourTransaction", 403);

        var tx = await chain.ExecuteAsync(web3 => web3.Eth.Transactions.GetTransactionByHash.SendRequestAsync(hash), ct);
        var receipt = await chain.ExecuteAsync(web3 => web3.Eth.Transactions.GetTransactionReceipt.SendRequestAsync(hash), ct);
        if (tx is null || receipt is null) throw new AssetException("TransactionNotFound", 404);
        if (receipt.Status?.Value != 1) throw new AssetException("TransactionReverted");
        if (EthAddress.Normalize(tx.From) != me) throw new AssetException("NotYourTransaction", 403);

        Asset asset;
        string to;
        BigInteger amount;
        if (catalog.FindByAddress(tx.To) is { } token)
        {
            var transfer = receipt.DecodeAllEvents<TransferEvent>()
                .FirstOrDefault(e => e.Log.Address.Equals(token.Address, StringComparison.OrdinalIgnoreCase) && EthAddress.Normalize(e.Event.From) == me);
            if (transfer is null) throw new AssetException("NoTransferInTransaction");
            (asset, to, amount) = (token, EthAddress.Normalize(transfer.Event.To), transfer.Event.Value);
        }
        else
        {
            if (tx.To is null || tx.Value.Value == 0) throw new AssetException("NoTransferInTransaction");
            (asset, to, amount) = (catalog.Find("ETH")!, EthAddress.Normalize(tx.To), tx.Value.Value);
        }

        var toExchange = await db.ExchangeWallets.AnyAsync(w => w.Address == to, ct);
        return await RecordAsync(hash, me, to, asset, amount, toExchange ? AssetTransferKind.Withdrawal : AssetTransferKind.Transfer, ct);
    }

    /// <summary>Saves the transfer and tells the recipient's app, if the recipient is a ChainChat user.</summary>
    private async Task<AssetTransfer> RecordAsync(string txHash, string from, string to, Asset asset, BigInteger amount, AssetTransferKind kind, CancellationToken ct)
    {
        var transfer = new AssetTransfer
        {
            TxHash = txHash.ToLowerInvariant(),
            From = EthAddress.Normalize(from),
            To = EthAddress.Normalize(to),
            Asset = asset.Symbol,
            Amount = amount,
            Kind = kind,
            CreatedAt = time.GetUtcNow(),
        };
        db.AssetTransfers.Add(transfer);
        try
        {
            await db.SaveChangesAsync(CancellationToken.None);
        }
        catch (DbUpdateException)
        {
            // Reported twice at the same moment: the other request stored it.
            db.Entry(transfer).State = EntityState.Detached;
            return await db.AssetTransfers.AsNoTracking().FirstAsync(t => t.TxHash == transfer.TxHash, ct);
        }

        logger.LogInformation("{Kind}: {Amount} from {From} to {To} ({TxHash})", kind, Format(amount, asset), transfer.From, transfer.To, transfer.TxHash);

        if (kind != AssetTransferKind.Funding && await db.Users.AnyAsync(u => u.Address == transfer.To, ct))
        {
            var senderName = await db.Users.AsNoTracking().Where(u => u.Address == transfer.From).Select(u => u.Username).FirstOrDefaultAsync(ct);
            var source = kind == AssetTransferKind.Deposit ? "Deposit from an exchange wallet." : senderName is null ? "From another wallet." : $"From @{senderName}.";
            await notifier.NotifyAsync(transfer.To, new UserNotification("FundsReceived", $"{Format(amount, asset)} received", source), ct);
        }

        return transfer;
    }

    private Web3 Web3For(string privateKey) => new(new Account(privateKey, chainOptions.Value.ChainId), chainOptions.Value.RpcUrls[0]);
}
