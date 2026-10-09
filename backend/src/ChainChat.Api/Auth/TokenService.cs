using System.Security.Claims;
using System.Text;
using ChainChat.Core.Crypto;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace ChainChat.Api.Auth;

/// <summary>Issues short-lived JWTs whose subject is the wallet address that signed in.</summary>
public sealed class TokenService(IOptions<AuthOptions> options, TimeProvider time)
{
    private readonly JsonWebTokenHandler _handler = new();

    public (string Token, DateTimeOffset ExpiresAt) Issue(string address)
    {
        var settings = options.Value;
        var now = time.GetUtcNow();
        var expiresAt = now.AddMinutes(settings.TokenLifetimeMinutes);

        var token = _handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = settings.Issuer,
            Audience = settings.Audience,
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expiresAt.UtcDateTime,
            Subject = new ClaimsIdentity([
                new Claim(JwtRegisteredClaimNames.Sub, EthAddress.ToChecksum(address)),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            ]),
            SigningCredentials = new SigningCredentials(SigningKey(settings), SecurityAlgorithms.HmacSha256),
        });

        return (token, expiresAt);
    }

    public static SymmetricSecurityKey SigningKey(AuthOptions settings) => new(Encoding.UTF8.GetBytes(settings.JwtSigningKey));
}
