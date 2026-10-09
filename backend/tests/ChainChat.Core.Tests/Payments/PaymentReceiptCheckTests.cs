using System.Numerics;
using ChainChat.Core.Payments;

namespace ChainChat.Core.Tests.Payments;

public class PaymentReceiptCheckTests
{
    private const string Alice = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    private const string Bob = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    private const string Carol = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
    private static readonly BigInteger TenChat = BigInteger.Parse("10000000000000000000");

    private static PaymentCheckResult Check(PaymentReceipt? receipt, long head = 110, bool giveUp = false) =>
        PaymentReceiptCheck.Evaluate(Alice, Bob, receipt, head, confirmations: 2, giveUp);

    private static PaymentReceipt Mined(params TokenTransfer[] transfers) => new(true, BlockNumber: 100, transfers);

    [Fact]
    public void Transfer_from_sender_to_recipient_confirms_with_the_on_chain_amount() =>
        Assert.Equal(new PaymentCheckResult(PaymentVerdict.Confirmed, TenChat), Check(Mined(new TokenTransfer(Alice, Bob, TenChat))));

    [Fact]
    public void Addresses_are_compared_case_insensitively() =>
        Assert.Equal(PaymentVerdict.Confirmed, Check(Mined(new TokenTransfer(Alice.ToLowerInvariant(), Bob.ToUpperInvariant().Replace("0X", "0x"), TenChat))).Verdict);

    [Fact]
    public void Several_matching_transfers_in_one_transaction_are_summed() =>
        Assert.Equal(TenChat * 2, Check(Mined(new TokenTransfer(Alice, Bob, TenChat), new TokenTransfer(Alice, Bob, TenChat))).Amount);

    [Fact]
    public void Missing_receipt_waits_then_fails()
    {
        Assert.Equal(PaymentVerdict.Pending, Check(null).Verdict);
        Assert.Equal(new PaymentCheckResult(PaymentVerdict.Failed, FailureReason: "TransactionNotFound"), Check(null, giveUp: true));
    }

    [Fact]
    public void Not_enough_confirmations_waits() => Assert.Equal(PaymentVerdict.Pending, Check(Mined(new TokenTransfer(Alice, Bob, TenChat)), head: 101).Verdict);

    [Fact]
    public void Reverted_transaction_fails() =>
        Assert.Equal("TransactionReverted", Check(new PaymentReceipt(false, 100, [])).FailureReason);

    [Theory]
    [InlineData("transfer to a third party")]
    [InlineData("transfer from someone else")]
    [InlineData("no token transfer at all")]
    public void Transaction_that_does_not_pay_the_recipient_fails(string scenario)
    {
        var receipt = scenario switch
        {
            "transfer to a third party" => Mined(new TokenTransfer(Alice, Carol, TenChat)),
            "transfer from someone else" => Mined(new TokenTransfer(Carol, Bob, TenChat)),
            _ => Mined(),
        };
        Assert.Equal(new PaymentCheckResult(PaymentVerdict.Failed, FailureReason: "NoMatchingTransfer"), Check(receipt));
    }
}
