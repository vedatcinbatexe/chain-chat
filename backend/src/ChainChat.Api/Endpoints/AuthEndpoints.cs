using ChainChat.Api.Auth;
using ChainChat.Api.Common;
using ChainChat.Core.Auth;
using ChainChat.Core.Crypto;
using ChainChat.Infrastructure.Chain;
using FluentValidation;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;

namespace ChainChat.Api.Endpoints;

/// <summary>Sign-In with Ethereum (SDD §6.2, SPEC.md §7): nonce → sign → verify → JWT.</summary>
public static class AuthEndpoints
{
    public sealed record NonceRequest(string Address);

    /// <summary>Everything the app needs to build the exact EIP-4361 message.</summary>
    public sealed record NonceResponse(string Nonce, string Domain, string Uri, long ChainId, string Statement, DateTimeOffset ExpiresAt);

    public sealed record VerifyRequest(string Message, string Signature);

    public sealed record SessionResponse(string Token, DateTimeOffset ExpiresAt, string Address);

    public sealed record MeResponse(string Address);

    public sealed class NonceRequestValidator : AbstractValidator<NonceRequest>
    {
        public NonceRequestValidator() =>
            RuleFor(r => r.Address).Must(EthAddress.IsValid).WithMessage("Must be a 0x-prefixed 20-byte address.");
    }

    public sealed class VerifyRequestValidator : AbstractValidator<VerifyRequest>
    {
        public VerifyRequestValidator()
        {
            RuleFor(r => r.Message).NotEmpty().MaximumLength(2_000);
            RuleFor(r => r.Signature).Matches("^0x[0-9a-fA-F]{130}$").WithMessage("Must be a 65-byte hex signature.");
        }
    }

    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/auth").WithTags("Auth");

        group.MapPost("/nonce", IssueNonce)
            .AddEndpointFilter<ValidationFilter<NonceRequest>>()
            .RequireRateLimiting(RateLimiting.AuthPolicy)
            .WithSummary("Issues a single-use nonce for a Sign-In with Ethereum message");

        group.MapPost("/verify", Verify)
            .AddEndpointFilter<ValidationFilter<VerifyRequest>>()
            .RequireRateLimiting(RateLimiting.AuthPolicy)
            .WithSummary("Verifies a signed SIWE message and returns a JWT");

        group.MapGet("/me", (HttpContext context) => TypedResults.Ok(new MeResponse(context.User.WalletAddress())))
            .RequireAuthorization()
            .WithSummary("The signed-in wallet address");
    }

    private static Ok<NonceResponse> IssueNonce(NonceRequest request, NonceStore nonces, IOptions<AuthOptions> auth, IOptions<ChainOptions> chain)
    {
        var (nonce, expiresAt) = nonces.Issue(request.Address);
        var settings = auth.Value;
        return TypedResults.Ok(new NonceResponse(nonce, settings.Domain, settings.Uri, chain.Value.ChainId, settings.Statement, expiresAt));
    }

    private static async Task<Results<Ok<SessionResponse>, ProblemHttpResult>> Verify(
        VerifyRequest request,
        ChainChat.Infrastructure.Persistence.ChainChatDbContext db,
        NonceStore nonces,
        TokenService tokens,
        IOptions<AuthOptions> auth,
        IOptions<ChainOptions> chain,
        TimeProvider time,
        ILogger<VerifyRequest> logger)
    {
        var settings = auth.Value;
        var rules = new SiweRules(
            settings.Domain,
            settings.Uri,
            chain.Value.ChainId,
            TimeSpan.FromMinutes(settings.MaxMessageLifetimeMinutes),
            TimeSpan.FromMinutes(settings.ClockSkewMinutes));

        var (result, message) = SiweVerifier.Verify(request.Message, Hex.ToBytes(request.Signature), rules, time.GetUtcNow());
        if (result != SiweResult.Valid)
        {
            logger.LogInformation("Sign-in rejected: {Result}", result);
            return Unauthorized(result.ToString());
        }

        // Checked after the signature, so invalid requests cannot burn someone else's nonce.
        if (!nonces.TryConsume(message!.Nonce, message.Address))
        {
            logger.LogInformation("Sign-in rejected for {Address}: unknown, expired or reused nonce", message.Address);
            return Unauthorized("NonceInvalid");
        }

        var normalized = EthAddress.Normalize(message.Address);
        if (await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.AnyAsync(db.BannedUsers, b => b.Address == normalized))
        {
            logger.LogInformation("Sign-in rejected for {Address}: banned", message.Address);
            return Unauthorized("Banned");
        }

        var (token, expiresAt) = tokens.Issue(message.Address);
        logger.LogInformation("Wallet {Address} signed in", message.Address);
        return TypedResults.Ok(new SessionResponse(token, expiresAt, message.Address));
    }

    private static ProblemHttpResult Unauthorized(string reason) =>
        TypedResults.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Sign-in failed", detail: reason);
}
