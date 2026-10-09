using System.Numerics;
using ChainChat.Core.Crypto;

namespace ChainChat.Core.Payments;

/// <summary>A ChatToken Transfer event decoded from a transaction receipt.</summary>
public sealed record TokenTransfer(string From, string To, BigInteger Value);

/// <summary>What the receipt of a claimed payment transaction shows.</summary>
public sealed record PaymentReceipt(bool Succeeded, long BlockNumber, IReadOnlyList<TokenTransfer> ChatTokenTransfers);

public enum PaymentVerdict
{
    /// <summary>Not mined yet, or not enough confirmations — check again later.</summary>
    Pending,
    Confirmed,
    Failed,
}

public sealed record PaymentCheckResult(PaymentVerdict Verdict, BigInteger Amount = default, string? FailureReason = null);

/// <summary>
/// Decides whether a payment claimed in a chat really happened (SDD §6.4): "the server never trusts the client's
/// claim about a payment; it trusts only the on-chain receipt".
/// </summary>
public static class PaymentReceiptCheck
{
    /// <param name="from">The message sender — who claims to have paid.</param>
    /// <param name="to">The message recipient — who should have been paid.</param>
    /// <param name="receipt">The transaction receipt, or null if the transaction is not mined (or does not exist).</param>
    /// <param name="headBlock">Current chain head, for confirmation depth.</param>
    /// <param name="confirmations">Blocks required on top of the receipt's block.</param>
    /// <param name="giveUp">True when the claim is old enough that a still-missing receipt means the tx never existed.</param>
    public static PaymentCheckResult Evaluate(string from, string to, PaymentReceipt? receipt, long headBlock, int confirmations, bool giveUp)
    {
        if (receipt is null) return giveUp ? new(PaymentVerdict.Failed, FailureReason: "TransactionNotFound") : new(PaymentVerdict.Pending);
        if (!receipt.Succeeded) return new(PaymentVerdict.Failed, FailureReason: "TransactionReverted");
        if (headBlock - receipt.BlockNumber < confirmations) return new(PaymentVerdict.Pending);

        // Only ChatToken transfers from the sender to the recipient count — not another token, not a third party.
        var amount = receipt.ChatTokenTransfers
            .Where(t => EthAddress.AreEqual(t.From, from) && EthAddress.AreEqual(t.To, to))
            .Aggregate(BigInteger.Zero, (sum, t) => sum + t.Value);

        return amount > 0
            ? new(PaymentVerdict.Confirmed, amount)
            : new(PaymentVerdict.Failed, FailureReason: "NoMatchingTransfer");
    }
}
