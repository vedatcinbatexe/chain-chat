using ChainChat.Infrastructure.Admin;
using ChainChat.Infrastructure.Anchoring;
using ChainChat.Infrastructure.Chain;
using ChainChat.Infrastructure.Indexing;
using ChainChat.Infrastructure.Messaging;
using ChainChat.Infrastructure.Payments;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ChainChat.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Postgres")
            ?? throw new InvalidOperationException("Connection string 'Postgres' is not configured");

        services.AddDbContext<ChainChatDbContext>(options => options
            .UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history"))
            .UseSnakeCaseNamingConvention());

        services.AddOptions<ChainOptions>()
            .Bind(configuration.GetSection(ChainOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddSingleton<ChainClient>();
        services.AddSingleton<ContractDeployments>();
        services.AddSingleton<BadgeService>();

        services.AddOptions<GasDripOptions>()
            .Bind(configuration.GetSection(GasDripOptions.SectionName))
            .ValidateDataAnnotations()
            .Validate(o => !o.Enabled || o.PrivateKey.Length > 0, "GasDrip:PrivateKey is required when the drip is enabled")
            .ValidateOnStart();
        services.AddScoped<GasDripService>();

        services.AddOptions<IndexerOptions>()
            .Bind(configuration.GetSection(IndexerOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();
        services.TryAddSingleton(TimeProvider.System);
        services.AddHostedService<RegistryIndexer>();
        services.AddHostedService<AnchorIndexer>();
        services.TryAddSingleton<IGroupNotifier, NullGroupNotifier>(); // the API replaces it with SignalR
        services.AddHostedService<BadgeIndexer>();

        services.AddOptions<AnchoringOptions>()
            .Bind(configuration.GetSection(AnchoringOptions.SectionName))
            .ValidateDataAnnotations()
            .Validate(o => !o.Enabled || o.PrivateKey.Length > 0, "Anchoring:PrivateKey is required when anchoring is enabled")
            .ValidateOnStart();
        // Singleton so the API can trigger a run ("anchor now"); also registered as the hosted service.
        services.AddSingleton<AnchoringJob>();
        services.AddHostedService(sp => sp.GetRequiredService<AnchoringJob>());

        services.AddOptions<AdminOptions>()
            .Bind(configuration.GetSection(AdminOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();
        services.AddSingleton<SystemSettings>();
        services.AddScoped<AdminService>();
        services.AddScoped<AdminFundingService>();

        services.AddScoped<MessageService>();
        services.AddScoped<GroupService>();
        services.AddScoped<ReactionService>();

        services.AddOptions<PaymentOptions>()
            .Bind(configuration.GetSection(PaymentOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();
        services.TryAddSingleton<IPaymentNotifier, NullPaymentNotifier>(); // the API replaces it with SignalR
        services.AddHostedService<PaymentVerifier>();

        services.AddHealthChecks()
            .AddNpgSql(connectionString, name: "postgres", tags: ["ready"])
            .AddCheck<ChainHealthCheck>("chain", tags: ["ready"]);

        return services;
    }

    /// <summary>Applies pending EF Core migrations (enabled with Database:MigrateOnStartup, used for local Docker runs).</summary>
    public static async Task MigrateDatabaseAsync(this IHost host)
    {
        using var scope = host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ChainChatDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<ChainChatDbContext>>();

        var pending = (await db.Database.GetPendingMigrationsAsync()).ToList();
        if (pending.Count == 0) return;

        logger.LogInformation("Applying {Count} database migration(s): {Migrations}", pending.Count, string.Join(", ", pending));
        await db.Database.MigrateAsync();
    }
}
