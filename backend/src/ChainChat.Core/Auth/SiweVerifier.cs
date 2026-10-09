using ChainChat.Core.Crypto;

namespace ChainChat.Core.Auth;

public enum SiweResult
{
    Valid,
    InvalidFormat,
    WrongDomain,
    WrongUri,
    WrongChain,
    NotYetValid,
    Expired,
    LifetimeTooLong,
    InvalidSignature,
}

/// <summary>What the server accepts (configured per environment).</summary>
public sealed record SiweRules(string Domain, string Uri, long ChainId, TimeSpan MaxLifetime, TimeSpan ClockSkew);

/// <summary>
/// Checks a signed SIWE login message against the server's rules (SPEC.md §7).
/// Nonce bookkeeping (exists, belongs to the address, single use) is the caller's job, because it needs server state.
/// </summary>
public static class SiweVerifier
{
    public static (SiweResult Result, SiweMessage? Message) Verify(string text, byte[] signature, SiweRules rules, DateTimeOffset now)
    {
        SiweMessage message;
        try
        {
            message = SiweMessage.Parse(text);
        }
        catch (FormatException)
        {
            return (SiweResult.InvalidFormat, null);
        }

        var result = CheckRules(message, rules, now);
        if (result != SiweResult.Valid) return (result, message);

        // The signature covers the exact text; any edit to any field changes the recovered signer.
        return MessageSignature.VerifyPersonalMessage(message.Address, text, signature) == SignatureCheckResult.Valid
            ? (SiweResult.Valid, message)
            : (SiweResult.InvalidSignature, message);
    }

    private static SiweResult CheckRules(SiweMessage message, SiweRules rules, DateTimeOffset now)
    {
        if (!string.Equals(message.Domain, rules.Domain, StringComparison.OrdinalIgnoreCase)) return SiweResult.WrongDomain;
        if (message.Uri != rules.Uri) return SiweResult.WrongUri;
        if (message.ChainId != rules.ChainId) return SiweResult.WrongChain;
        if (message.IssuedAt > now + rules.ClockSkew) return SiweResult.NotYetValid;
        if (message.ExpirationTime <= now - rules.ClockSkew) return SiweResult.Expired;
        if (message.ExpirationTime - message.IssuedAt > rules.MaxLifetime) return SiweResult.LifetimeTooLong;
        return SiweResult.Valid;
    }
}
