using ChainChat.Core.Crypto;

namespace ChainChat.Core.Tests.Vectors;

/// <summary>Conversation ids, message hashes and hash chains against the shared vectors (SPEC.md §2–§4).</summary>
public class MessageVectorTests
{
    public static TheoryData<string> ConversationIdCases => VectorFile.CaseNames("conversation-id.json");
    public static TheoryData<string> MessageHashCases => VectorFile.CaseNames("message-hash.json");
    public static TheoryData<string> HashChainCases => VectorFile.CaseNames("hash-chain.json");

    [Theory]
    [MemberData(nameof(ConversationIdCases))]
    public void ConversationId_matches_vector(string name)
    {
        var vector = VectorFile.Case("conversation-id.json", name);
        var input = vector.GetProperty("input");

        var id = ConversationId.ForDirect(input.Str("a"), input.Str("b"));

        Assert.Equal(vector.GetProperty("expected").Str("conversationId"), Hex.FromBytes(id));
    }

    [Theory]
    [MemberData(nameof(MessageHashCases))]
    public void MessageHash_matches_vector_at_every_step(string name)
    {
        var vector = VectorFile.Case("message-hash.json", name);
        var input = vector.GetProperty("input");
        var expected = vector.GetProperty("expected");

        var header = new MessageHeader(
            input.Bytes("conversationId"),
            input.Str("sender"),
            input.UInt64("seq"),
            input.Bytes("prevHash"),
            input.Bytes("ciphertext"),
            input.UInt64("clientTimestamp"));

        Assert.Equal(expected.Str("ciphertextHash"), Hex.FromBytes(MessageHasher.CiphertextHash(header.Ciphertext)));
        Assert.Equal(expected.Str("encoded"), Hex.FromBytes(MessageHasher.Encode(header)));
        Assert.Equal(expected.Str("messageHash"), Hex.FromBytes(MessageHasher.Hash(header)));
    }

    [Theory]
    [MemberData(nameof(HashChainCases))]
    public void HashChain_matches_vector(string name)
    {
        var vector = VectorFile.Case("hash-chain.json", name);
        var input = vector.GetProperty("input");
        var previousJson = input.GetProperty("previous");
        var next = input.GetProperty("next");

        (ulong, byte[])? previous = previousJson.ValueKind == System.Text.Json.JsonValueKind.Null
            ? null
            : (previousJson.UInt64("seq"), previousJson.Bytes("messageHash"));

        var result = HashChain.Check(previous, next.UInt64("seq"), next.Bytes("prevHash"));

        Assert.Equal(ExpectedChainResult(vector.GetProperty("expected")), result);
    }

    private static ChainLinkResult ExpectedChainResult(System.Text.Json.JsonElement expected) =>
        expected.GetProperty("valid").GetBoolean()
            ? ChainLinkResult.Valid
            : expected.Str("reason") switch
            {
                "bad-genesis" => ChainLinkResult.BadGenesis,
                "seq-gap" => ChainLinkResult.SeqGap,
                "broken-link" => ChainLinkResult.BrokenLink,
                var other => throw new InvalidOperationException($"Unknown reason in vector: {other}"),
            };
}
