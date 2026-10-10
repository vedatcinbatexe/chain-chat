using System.ComponentModel.DataAnnotations;
using System.Numerics;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Core.Payments;
using ChainChat.Infrastructure.Chain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nethereum.ABI.FunctionEncoding.Attributes;
using Nethereum.Contracts;

namespace ChainChat.Infrastructure.Payments;

/// <summary>Payment verification settings (configuration section "Payments").</summary>
public sealed class PaymentOptions
{
    public const string SectionName = "Payments";

    [Range(1, 300)]
    public int PollIntervalSeconds { get; set; } = 3;

    /// <summary>Blocks required on top of the payment's block before it counts as confirmed.</summary>
    [Range(0, 100)]
    public int Confirmations { get; set; } = 2;

    /// <summary>A claim whose transaction is still unknown after this long is marked failed.</summary>
    [Range(1, 1_440)]
    public int GiveUpAfterMinutes { get; set; } = 5;
}

/// <summary>ERC-20 Transfer(address indexed from, address indexed to, uint256 value)</summary>
[Event("Transfer")]
public sealed class TransferEvent : IEventDTO
{
    [Parameter("address", "from", 1, true)]
    public string From { get; set; } = "";

    [Parameter("address", "to", 2, true)]
    public string To { get; set; } = "";

    [Parameter("uint256", "value", 3, false)]
    public BigInteger Value { get; set; }
}

/// <summary>Tells the payer and payee that a payment's status changed (implemented by the API with SignalR).</summary>
public interface IPaymentNotifier
{
    Task PaymentUpdatedAsync(Payment payment, string conversationId, CancellationToken ct);
}

public sealed class NullPaymentNotifier : IPaymentNotifier
{
    public Task PaymentUpdatedAsync(Payment payment, string conversationId, CancellationToken ct) => Task.CompletedTask;
}

/// <summary>
/// Confirms or rejects payment claims from their on-chain receipts (SDD §6.4). It checks exactly the transaction
/// the message claims: mined, successful, confirmed, and paying the recipient from the sender — in ETH or in one
/// of the supported tokens — so the asset and amount shown in the chat are the on-chain ones, never the claimed ones.
/// </summary>
public sealed class PaymentVerifier(
    IServiceScopeFactory scopes,
    ChainClient chain,
    AssetCatalog catalog,
    IPaymentNotifier notifier,
    IOptions<PaymentOptions> options,
    TimeProvider time,
    ILogger<PaymentVerifier> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await VerifyPendingAsync(options.Value, ct);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                logger.LogWarning(ex, "Payment verification failed; retrying");
            }

            await Task.Delay(TimeSpan.FromSeconds(options.Value.PollIntervalSeconds), time, ct);
        }
    }

    private async Task VerifyPendingAsync(PaymentOptions settings, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ChainChatDbContext>();

        var pending = await db.Payments.Where(p => p.Status == PaymentStatus.Pending).OrderBy(p => p.CreatedAt).Take(50).ToListAsync(ct);
        if (pending.Count == 0) return;

        var head = await chain.GetBlockNumberAsync(ct);
        var giveUpBefore = time.GetUtcNow().AddMinutes(-settings.GiveUpAfterMinutes);
        var changed = new List<Payment>();

        foreach (var payment in pending)
        {
            var receipt = await chain.ExecuteAsync(web3 => web3.Eth.Transactions.GetTransactionReceipt.SendRequestAsync(payment.TxHash), ct);
            PaymentReceipt? onChain = null;
            if (receipt is not null)
            {
                // Token transfers of supported assets only — an event from an unknown contract proves nothing.
                var transfers = receipt.DecodeAllEvents<TransferEvent>()
                    .Select(e => (Transfer: e.Event, Asset: catalog.FindByAddress(e.Log.Address)))
                    .Where(t => t.Asset is not null)
                    .Select(t => new TokenTransfer(t.Transfer.From, t.Transfer.To, t.Transfer.Value, t.Asset!.Symbol))
                    .ToList();

                // ETH has no event: it is the value the transaction itself carried.
                var tx = await chain.ExecuteAsync(web3 => web3.Eth.Transactions.GetTransactionByHash.SendRequestAsync(payment.TxHash), ct);
                if (tx is { To: not null } && tx.Value.Value > 0) transfers.Add(new TokenTransfer(tx.From, tx.To, tx.Value.Value, "ETH"));

                onChain = new PaymentReceipt(receipt.Status?.Value == 1, (long)receipt.BlockNumber.Value, transfers);
            }

            var result = PaymentReceiptCheck.Evaluate(payment.From, payment.To, onChain, head, settings.Confirmations, payment.CreatedAt < giveUpBefore);
            if (result.Verdict == PaymentVerdict.Pending) continue;

            payment.Status = result.Verdict == PaymentVerdict.Confirmed ? PaymentStatus.Confirmed : PaymentStatus.Failed;
            payment.Amount = result.Amount;
            payment.Asset = result.Asset;
            payment.FailureReason = result.FailureReason;
            payment.BlockNumber = onChain?.BlockNumber;
            payment.ConfirmedAt = result.Verdict == PaymentVerdict.Confirmed ? time.GetUtcNow() : null;
            changed.Add(payment);

            logger.LogInformation("Payment {TxHash} from {From} to {To}: {Status} {Reason}", payment.TxHash, payment.From, payment.To, payment.Status, result.FailureReason);
        }

        if (changed.Count == 0) return;
        await db.SaveChangesAsync(ct);

        var messageIds = changed.Select(p => p.MessageId).ToList();
        var conversations = await db.Messages.Where(m => messageIds.Contains(m.Id)).ToDictionaryAsync(m => m.Id, m => m.ConversationId, ct);
        foreach (var payment in changed)
        {
            if (payment.MessageId is { } id && conversations.TryGetValue(id, out var conversationId))
            {
                await notifier.PaymentUpdatedAsync(payment, conversationId, ct);
            }
        }
    }
}
