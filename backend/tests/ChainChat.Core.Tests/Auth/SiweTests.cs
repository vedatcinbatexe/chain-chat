using ChainChat.Core.Auth;
using ChainChat.Core.Crypto;
using ChainChat.Core.Tests.Vectors;
using Nethereum.Signer;

namespace ChainChat.Core.Tests.Auth;

public class SiweTests
{
    // Anvil's public development keys #0 (alice) and #1 (bob).
    private const string AliceKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    private const string BobKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    private const string Alice = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

    private static readonly SiweRules LocalRules = new("chainchat.local", "chainchat://app", 31337, TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(2));
    private static readonly DateTimeOffset IssuedAt = DateTimeOffset.Parse("2026-01-01T00:00:00Z");

    public static TheoryData<string> VectorCases => VectorFile.CaseNames("siwe.json");

    [Theory]
    [MemberData(nameof(VectorCases))]
    public void Vector_message_parses_and_verifies(string name)
    {
        var vector = VectorFile.Case("siwe.json", name);
        var fields = vector.GetProperty("input").GetProperty("fields");
        var expected = vector.GetProperty("expected");
        var text = expected.Str("message");

        var message = SiweMessage.Parse(text);
        Assert.Equal(fields.Str("domain"), message.Domain);
        Assert.Equal(fields.Str("address"), message.Address);
        Assert.Equal(fields.Str("statement"), message.Statement);
        Assert.Equal(fields.Str("uri"), message.Uri);
        Assert.Equal(fields.GetProperty("chainId").GetInt64(), message.ChainId);
        Assert.Equal(fields.Str("nonce"), message.Nonce);
        Assert.Equal(DateTimeOffset.Parse(fields.Str("issuedAt")), message.IssuedAt);
        Assert.Equal(DateTimeOffset.Parse(fields.Str("expirationTime")), message.ExpirationTime);

        Assert.Equal(expected.Str("digest"), Hex.FromBytes(MessageSignature.PersonalMessageDigest(text)));

        var rules = LocalRules with { ChainId = message.ChainId };
        var (result, _) = SiweVerifier.Verify(text, expected.Bytes("signature"), rules, message.IssuedAt.AddMinutes(1));
        Assert.Equal(SiweResult.Valid, result);
    }

    [Fact]
    public void Wrong_domain_uri_or_chain_is_rejected()
    {
        var (text, signature) = Signed(AliceKey, Alice);
        var now = IssuedAt.AddMinutes(1);

        Assert.Equal(SiweResult.WrongDomain, SiweVerifier.Verify(text, signature, LocalRules with { Domain = "evil.example" }, now).Result);
        Assert.Equal(SiweResult.WrongUri, SiweVerifier.Verify(text, signature, LocalRules with { Uri = "https://evil.example" }, now).Result);
        Assert.Equal(SiweResult.WrongChain, SiweVerifier.Verify(text, signature, LocalRules with { ChainId = 1 }, now).Result);
    }

    [Fact]
    public void Expired_or_future_message_is_rejected()
    {
        var (text, signature) = Signed(AliceKey, Alice);

        Assert.Equal(SiweResult.Expired, SiweVerifier.Verify(text, signature, LocalRules, IssuedAt.AddMinutes(10)).Result);
        Assert.Equal(SiweResult.NotYetValid, SiweVerifier.Verify(text, signature, LocalRules, IssuedAt.AddMinutes(-10)).Result);
    }

    [Fact]
    public void Clock_skew_is_tolerated()
    {
        var (text, signature) = Signed(AliceKey, Alice);
        // The phone's clock is one minute ahead of the server.
        Assert.Equal(SiweResult.Valid, SiweVerifier.Verify(text, signature, LocalRules, IssuedAt.AddMinutes(-1)).Result);
    }

    [Fact]
    public void Long_lived_message_is_rejected()
    {
        var (text, signature) = Signed(AliceKey, Alice, lifetime: TimeSpan.FromHours(1));
        Assert.Equal(SiweResult.LifetimeTooLong, SiweVerifier.Verify(text, signature, LocalRules, IssuedAt.AddMinutes(1)).Result);
    }

    [Fact]
    public void Message_signed_by_someone_else_is_rejected()
    {
        // Bob signs a message that claims to be Alice's login.
        var (text, signature) = Signed(BobKey, Alice);
        Assert.Equal(SiweResult.InvalidSignature, SiweVerifier.Verify(text, signature, LocalRules, IssuedAt.AddMinutes(1)).Result);
    }

    [Fact]
    public void Tampered_message_is_rejected()
    {
        var (text, signature) = Signed(AliceKey, Alice);
        var tampered = text.Replace("Nonce: k3Jd8aQ2pLx9Zr7T", "Nonce: aaaaaaaaaaaaaaaa");
        Assert.Equal(SiweResult.InvalidSignature, SiweVerifier.Verify(tampered, signature, LocalRules, IssuedAt.AddMinutes(1)).Result);
    }

    [Theory]
    [InlineData("lowercase address", "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266")]
    [InlineData("short nonce", null)]
    public void Malformed_message_is_rejected(string _, string? address)
    {
        var text = Format(address ?? Alice, nonce: address is null ? "short" : "k3Jd8aQ2pLx9Zr7T");
        Assert.Equal(SiweResult.InvalidFormat, SiweVerifier.Verify(text, new byte[65], LocalRules, IssuedAt).Result);
    }

    [Fact]
    public void Missing_line_is_rejected() =>
        Assert.Throws<FormatException>(() => SiweMessage.Parse(Format(Alice).Replace("Version: 1\n", "")));

    private static (string Text, byte[] Signature) Signed(string privateKey, string address, TimeSpan? lifetime = null)
    {
        var text = Format(address, lifetime: lifetime);
        var signature = new EthereumMessageSigner().EncodeUTF8AndSign(text, new EthECKey(privateKey));
        return (text, Hex.ToBytes(signature));
    }

    private static string Format(string address, string nonce = "k3Jd8aQ2pLx9Zr7T", TimeSpan? lifetime = null) =>
        string.Join('\n',
            "chainchat.local wants you to sign in with your Ethereum account:",
            address,
            "",
            "Sign in to ChainChat with your wallet.",
            "",
            "URI: chainchat://app",
            "Version: 1",
            "Chain ID: 31337",
            $"Nonce: {nonce}",
            $"Issued At: {IssuedAt:yyyy-MM-ddTHH:mm:ss.fffZ}",
            $"Expiration Time: {IssuedAt + (lifetime ?? TimeSpan.FromMinutes(5)):yyyy-MM-ddTHH:mm:ss.fffZ}");
}
