using ChainChat.Core.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace ChainChat.Api.Auth;

public static class AuthSetup
{
    /// <summary>Sign-In with Ethereum (nonce store, token issuing) and JWT bearer authentication.</summary>
    public static IServiceCollection AddWalletAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<AuthOptions>()
            .Bind(configuration.GetSection(AuthOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton(sp => new NonceStore(
            TimeSpan.FromMinutes(sp.GetRequiredService<IOptions<AuthOptions>>().Value.NonceLifetimeMinutes),
            sp.GetRequiredService<TimeProvider>()));
        services.AddSingleton<TokenService>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<AuthOptions>>((jwt, auth) =>
            {
                jwt.MapInboundClaims = false; // keep "sub" as "sub"
                jwt.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidIssuer = auth.Value.Issuer,
                    ValidAudience = auth.Value.Audience,
                    IssuerSigningKey = TokenService.SigningKey(auth.Value),
                    NameClaimType = JwtRegisteredClaimNames.Sub,
                    ClockSkew = TimeSpan.FromSeconds(30),
                };
                jwt.Events = new JwtBearerEvents
                {
                    // WebSockets cannot send headers, so SignalR passes the token as ?access_token= (Phase 7).
                    OnMessageReceived = context =>
                    {
                        var token = context.Request.Query["access_token"];
                        if (!string.IsNullOrEmpty(token) && context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                        {
                            context.Token = token;
                        }
                        return Task.CompletedTask;
                    },
                };
            });

        services.AddAuthorization();
        return services;
    }

    /// <summary>The signed-in wallet address (the JWT subject).</summary>
    public static string WalletAddress(this System.Security.Claims.ClaimsPrincipal user) =>
        user.Identity?.Name ?? throw new InvalidOperationException("Request is not authenticated");
}
