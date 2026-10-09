using System.Threading.RateLimiting;

namespace ChainChat.Api.Common;

/// <summary>Rate limit settings (configuration section "RateLimiting").</summary>
public sealed class RateLimitingOptions
{
    public int PermitLimit { get; set; } = 100;
    public int WindowSeconds { get; set; } = 10;
}

public static class RateLimiting
{
    /// <summary>
    /// Global fixed-window limit per client IP. Phase 5 adds per-address limits once requests are authenticated,
    /// and stricter policies for login, the gas drip and the faucet.
    /// </summary>
    public static IServiceCollection AddApiRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var settings = configuration.GetSection("RateLimiting").Get<RateLimitingOptions>() ?? new RateLimitingOptions();

        return services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = settings.PermitLimit,
                        Window = TimeSpan.FromSeconds(settings.WindowSeconds),
                    }));
        });
    }
}
