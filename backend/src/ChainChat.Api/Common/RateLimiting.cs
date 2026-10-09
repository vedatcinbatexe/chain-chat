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
    /// <summary>Login endpoints: 20 requests per minute per client IP.</summary>
    public const string AuthPolicy = "auth";

    /// <summary>Gas drip: 10 requests per hour per client IP, on top of the one-drip-per-address rule.</summary>
    public const string DripPolicy = "drip";

    /// <summary>A global fixed-window limit per client IP, plus stricter named policies for login and the gas drip.</summary>
    public static IServiceCollection AddApiRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var settings = configuration.GetSection("RateLimiting").Get<RateLimitingOptions>() ?? new RateLimitingOptions();

        return services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
                PerIp(context, settings.PermitLimit, TimeSpan.FromSeconds(settings.WindowSeconds)));
            options.AddPolicy(AuthPolicy, context => PerIp(context, 20, TimeSpan.FromMinutes(1)));
            options.AddPolicy(DripPolicy, context => PerIp(context, 10, TimeSpan.FromHours(1)));
        });
    }

    private static RateLimitPartition<string> PerIp(HttpContext context, int permitLimit, TimeSpan window) =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = permitLimit, Window = window });
}
