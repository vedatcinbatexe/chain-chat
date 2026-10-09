using ChainChat.Core.Crypto;
using ChainChat.Core.Messaging;
using Nethereum.Signer;

namespace ChainChat.Core.Tests.Messaging;

public class IncomingMessageValidatorTests
{
    // Anvil's public development keys #0 (alice) and #1 (bob).
    private const string AliceKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    private const string BobKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    private const string Alice = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    private const string Bob = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    private const string Carol = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

    private static readonly byte[] AliceBob = ConversationId.ForDirect(Alice, Bob);

    [Fact]
    public void First_message_is_accepted_and_hash_matches_the_spec()
    {
        var message = Signed(AliceKey, Alice, Bob, seq: 1, prevHash: MessageHasher.ZeroHash);

        var (rejection, hash) = IncomingMessageValidator.Validate(message, previous: null);

        Assert.Equal(MessageRejection.None, rejection);
        Assert.Equal(HashOf(message), hash);
    }

    [Fact]
    public void Chained_message_is_accepted()
    {
        var first = Signed(AliceKey, Alice, Bob, seq: 1, prevHash: MessageHasher.ZeroHash);
        var second = Signed(AliceKey, Alice, Bob, seq: 2, prevHash: HashOf(first));

        Assert.Equal(MessageRejection.None, IncomingMessageValidator.Validate(second, (1, HashOf(first))).Rejection);
    }

    [Fact]
    public void Message_signed_by_someone_else_is_rejected()
    {
        // Bob's wallet signs a message that claims to come from Alice — what a malicious server would need to do.
        var forged = Signed(BobKey, Alice, Bob, seq: 1, prevHash: MessageHasher.ZeroHash);
        Assert.Equal(MessageRejection.InvalidSignature, IncomingMessageValidator.Validate(forged, null).Rejection);
    }

    [Fact]
    public void Altered_ciphertext_is_rejected()
    {
        var message = Signed(AliceKey, Alice, Bob, seq: 1, prevHash: MessageHasher.ZeroHash);
        var altered = message with { Ciphertext = [.. message.Ciphertext.SkipLast(1), 0xFF] };
        Assert.Equal(MessageRejection.InvalidSignature, IncomingMessageValidator.Validate(altered, null).Rejection);
    }

    [Fact]
    public void Message_for_another_conversation_is_rejected()
    {
        // Signed for Alice↔Bob, but delivered as if it were for Alice↔Carol.
        var message = Signed(AliceKey, Alice, Bob, seq: 1, prevHash: MessageHasher.ZeroHash) with { Recipient = Carol };
        Assert.Equal(MessageRejection.ConversationMismatch, IncomingMessageValidator.Validate(message, null).Rejection);
    }

    [Fact]
    public void Message_to_yourself_is_rejected()
    {
        var message = Signed(AliceKey, Alice, Bob, seq: 1, prevHash: MessageHasher.ZeroHash) with { Recipient = Alice };
        Assert.Equal(MessageRejection.SelfMessage, IncomingMessageValidator.Validate(message, null).Rejection);
    }

    [Fact]
    public void Hash_chain_violations_are_rejected()
    {
        var first = Signed(AliceKey, Alice, Bob, seq: 1, prevHash: MessageHasher.ZeroHash);
        var previous = (1UL, HashOf(first));

        var gap = Signed(AliceKey, Alice, Bob, seq: 3, prevHash: HashOf(first));
        var wrongLink = Signed(AliceKey, Alice, Bob, seq: 2, prevHash: Keccak.Hash([1, 2, 3]));
        var replay = first;

        Assert.Equal(MessageRejection.SeqGap, IncomingMessageValidator.Validate(gap, previous).Rejection);
        Assert.Equal(MessageRejection.BrokenLink, IncomingMessageValidator.Validate(wrongLink, previous).Rejection);
        Assert.Equal(MessageRejection.SeqGap, IncomingMessageValidator.Validate(replay, previous).Rejection);
        Assert.Equal(MessageRejection.BadGenesis, IncomingMessageValidator.Validate(gap, previous: null).Rejection);
    }

    [Fact]
    public void Oversized_or_empty_ciphertext_is_rejected()
    {
        var message = Signed(AliceKey, Alice, Bob, seq: 1, prevHash: MessageHasher.ZeroHash);
        Assert.Equal(MessageRejection.Malformed, IncomingMessageValidator.Validate(message with { Ciphertext = [] }, null).Rejection);
        Assert.Equal(MessageRejection.Malformed,
            IncomingMessageValidator.Validate(message with { Ciphertext = new byte[IncomingMessageValidator.MaxCiphertextBytes + 1] }, null).Rejection);
    }

    private static IncomingMessage Signed(string privateKey, string sender, string recipient, ulong seq, byte[] prevHash)
    {
        var unsigned = new IncomingMessage(AliceBob, sender, recipient, seq, prevHash,
            Ciphertext: [.. "ciphertext"u8, (byte)seq], ClientTimestamp: 1767225600000 + seq, Signature: []);

        // EIP-191 over the 32-byte message hash — the same digest as MessageSignature.SigningDigest.
        var signature = new EthereumMessageSigner().Sign(HashOf(unsigned), new EthECKey(privateKey));
        return unsigned with { Signature = Hex.ToBytes(signature) };
    }

    private static byte[] HashOf(IncomingMessage m) =>
        MessageHasher.Hash(new MessageHeader(m.ConversationId, m.Sender, m.Seq, m.PrevHash, m.Ciphertext, m.ClientTimestamp));
}
