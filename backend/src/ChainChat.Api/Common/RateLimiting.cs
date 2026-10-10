using System.Threading.RateLimiting;

namespace ChainChat.Api.Common;

/// <summary>Rate limit settings (configuration section "RateLimiting").</summary>
public sealed class RateLimitingOptions
{
    public int PermitLimit { get; set; } = 100;
    public int WindowSeconds { get; set; } = 10;

    /// <summary>Login requests (nonce + verify) per minute per client IP.</summary>
    public int AuthPermitLimit { get; set; } = 20;

    /// <summary>Chat messages a wallet may send over the hub within <see cref="HubMessageWindowSeconds"/>.</summary>
    public int HubMessageLimit { get; set; } = 30;

    public int HubMessageWindowSeconds { get; set; } = 10;
}

/// <summary>Limits how fast one wallet can send chat messages over the hub (the HTTP limits do not cover it).</summary>
public sealed class HubMessageLimiter(IConfiguration configuration, TimeProvider time)
{
    private readonly ChainChat.Core.Messaging.SlidingWindowLimiter _limiter = Create(configuration, time);

    public bool TryAcquire(string address) => _limiter.TryAcquire(address);

    private static ChainChat.Core.Messaging.SlidingWindowLimiter Create(IConfiguration configuration, TimeProvider time)
    {
        var settings = configuration.GetSection("RateLimiting").Get<RateLimitingOptions>() ?? new RateLimitingOptions();
        return new(settings.HubMessageLimit, TimeSpan.FromSeconds(settings.HubMessageWindowSeconds), time);
    }
}

public static class RateLimiting
{
    /// <summary>Login endpoints: 20 requests per minute per client IP.</summary>
    public const string AuthPolicy = "auth";

    /// <summary>Gas drip: 10 requests per hour per client IP, on top of the one-drip-per-address rule.</summary>
    public const string DripPolicy = "drip";

    /// <summary>Manual anchoring trigger: 5 requests per minute per client IP (each run may send a transaction).</summary>
    public const string AnchorPolicy = "anchor";

    /// <summary>A global fixed-window limit per client IP, plus stricter named policies for login and the gas drip.</summary>
    public static IServiceCollection AddApiRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var settings = configuration.GetSection("RateLimiting").Get<RateLimitingOptions>() ?? new RateLimitingOptions();

        return services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
                PerIp(context, settings.PermitLimit, TimeSpan.FromSeconds(settings.WindowSeconds)));
            options.AddPolicy(AuthPolicy, context => PerIp(context, settings.AuthPermitLimit, TimeSpan.FromMinutes(1)));
            options.AddPolicy(DripPolicy, context => PerIp(context, 10, TimeSpan.FromHours(1)));
            options.AddPolicy(AnchorPolicy, context => PerIp(context, 5, TimeSpan.FromMinutes(1)));
        });
    }

    private static RateLimitPartition<string> PerIp(HttpContext context, int permitLimit, TimeSpan window) =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = permitLimit, Window = window });
}
