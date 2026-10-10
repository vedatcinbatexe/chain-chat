using System.Numerics;
using ChainChat.Core.Crypto;

namespace ChainChat.Core.Payments;

/// <summary>
/// An asset that moved in a transaction: an ERC-20 Transfer event of a supported token, or the ETH the
/// transaction itself carried.
/// </summary>
/// <param name="Asset">The asset's symbol: ETH, CHAT, tUSD, …</param>
public sealed record TokenTransfer(string From, string To, BigInteger Value, string Asset = "CHAT");

/// <summary>What the receipt of a claimed payment transaction shows.</summary>
/// <param name="Transfers">Only transfers of supported assets; events of unknown tokens are left out by the caller.</param>
public sealed record PaymentReceipt(bool Succeeded, long BlockNumber, IReadOnlyList<TokenTransfer> Transfers);

public enum PaymentVerdict
{
    /// <summary>Not mined yet, or not enough confirmations — check again later.</summary>
    Pending,
    Confirmed,
    Failed,
}

/// <param name="Asset">For a confirmed payment: which asset was paid, as the chain shows it.</param>
public sealed record PaymentCheckResult(PaymentVerdict Verdict, BigInteger Amount = default, string? FailureReason = null, string? Asset = null);

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

        // Only transfers from the sender to the recipient count — not to a third party, not from someone else.
        var paid = receipt.Transfers.Where(t => t.Value > 0 && EthAddress.AreEqual(t.From, from) && EthAddress.AreEqual(t.To, to)).ToList();
        if (paid.Count == 0) return new(PaymentVerdict.Failed, FailureReason: "NoMatchingTransfer");

        // A payment is in one asset: the first one the transaction paid (a normal transfer only has one).
        var asset = paid[0].Asset;
        var amount = paid.Where(t => t.Asset == asset).Aggregate(BigInteger.Zero, (sum, t) => sum + t.Value);
        return new(PaymentVerdict.Confirmed, amount, Asset: asset);
    }
}
