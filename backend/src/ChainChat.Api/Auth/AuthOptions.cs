using System.ComponentModel.DataAnnotations;

namespace ChainChat.Api.Auth;

/// <summary>Sign-In with Ethereum and JWT settings (configuration section "Auth").</summary>
public sealed class AuthOptions
{
    public const string SectionName = "Auth";

    /// <summary>EIP-4361 domain the app signs in to; must match the message exactly.</summary>
    [Required]
    public string Domain { get; set; } = "chainchat.local";

    /// <summary>EIP-4361 URI; must match the message exactly.</summary>
    [Required]
    public string Uri { get; set; } = "chainchat://app";

    [Required]
    public string Statement { get; set; } = "Sign in to ChainChat with your wallet.";

    /// <summary>HMAC-SHA256 key for JWTs (at least 32 characters). Never commit a production key.</summary>
    [Required, MinLength(32)]
    public string JwtSigningKey { get; set; } = "";

    public string Issuer { get; set; } = "chainchat-api";

    public string Audience { get; set; } = "chainchat-app";

    [Range(1, 24 * 60)]
    public int TokenLifetimeMinutes { get; set; } = 60;

    [Range(1, 60)]
    public int NonceLifetimeMinutes { get; set; } = 5;

    /// <summary>Longest allowed gap between Issued At and Expiration Time in a login message.</summary>
    [Range(1, 60)]
    public int MaxMessageLifetimeMinutes { get; set; } = 10;

    /// <summary>Tolerance for phone clocks that are slightly ahead or behind.</summary>
    [Range(0, 10)]
    public int ClockSkewMinutes { get; set; } = 2;
}
