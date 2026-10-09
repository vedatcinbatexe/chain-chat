using ChainChat.Core.Crypto;

namespace ChainChat.Core.Tests.Vectors;

/// <summary>EIP-191 message signatures against the shared vectors (SPEC.md §5).</summary>
public class SignatureVectorTests
{
    public static TheoryData<string> ValidCases => VectorFile.CaseNames("signatures.json", "valid");
    public static TheoryData<string> InvalidCases => VectorFile.CaseNames("signatures.json", "invalid");

    [Theory]
    [MemberData(nameof(ValidCases))]
    public void Valid_signature_matches_digest_and_verifies(string name)
    {
        var vector = VectorFile.Case("signatures.json", name, "valid");
        var input = vector.GetProperty("input");
        var expected = vector.GetProperty("expected");
        var messageHash = input.Bytes("messageHash");

        Assert.Equal(expected.Str("digest"), Hex.FromBytes(MessageSignature.SigningDigest(messageHash)));
        Assert.Equal(SignatureCheckResult.Valid, MessageSignature.Verify(input.Str("sender"), messageHash, expected.Bytes("signature")));
    }

    [Theory]
    [MemberData(nameof(InvalidCases))]
    public void Invalid_signature_is_rejected_for_the_expected_reason(string name)
    {
        var vector = VectorFile.Case("signatures.json", name, "invalid");
        var input = vector.GetProperty("input");
        var reason = vector.GetProperty("expected").GetProperty("check").Str("reason");

        var result = MessageSignature.Verify(input.Str("sender"), input.Bytes("messageHash"), input.Bytes("signature"));

        Assert.Equal(reason switch
        {
            "bad-length" => SignatureCheckResult.BadLength,
            "bad-v" => SignatureCheckResult.BadV,
            "high-s" => SignatureCheckResult.HighS,
            "unrecoverable" => SignatureCheckResult.Unrecoverable,
            "wrong-signer" => SignatureCheckResult.WrongSigner,
            _ => throw new InvalidOperationException($"Unknown reason in vector: {reason}"),
        }, result);
    }
}
