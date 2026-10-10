using ChainChat.Api.Auth;
using ChainChat.Api.Endpoints;
using ChainChat.Api.Hubs;
using ChainChat.Api.Common;
using ChainChat.Infrastructure;
using FluentValidation;
using Microsoft.AspNetCore.SignalR;
using Scalar.AspNetCore;
using Serilog;

Log.Logger = new LoggerConfiguration().WriteTo.Console().CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Services.AddSerilog((services, logger) => logger
        .ReadFrom.Configuration(builder.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext());

    builder.Services.AddProblemDetails();
    builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
    builder.Services.AddValidatorsFromAssemblyContaining<Program>();
    builder.Services.AddOpenApi();
    builder.Services.AddApiRateLimiting(builder.Configuration);
    builder.Services.AddInfrastructure(builder.Configuration);
    builder.Services.AddWalletAuthentication(builder.Configuration);
    builder.Services.AddAdminAuthorization();
    builder.Services.AddSignalR();
    builder.Services.AddSingleton<IUserIdProvider, WalletUserIdProvider>();
    builder.Services.AddSingleton<PresenceTracker>();
    builder.Services.AddSingleton<HubMessageLimiter>();
    builder.Services.AddSingleton<ChainChat.Infrastructure.Payments.IPaymentNotifier, HubPaymentNotifier>();
    builder.Services.AddSingleton<ChainChat.Infrastructure.Indexing.IGroupNotifier, HubGroupNotifier>();
    builder.Services.AddSingleton<ChainChat.Infrastructure.Notifications.IUserNotifier, HubUserNotifier>();

    var app = builder.Build();

    if (app.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
    {
        await app.MigrateDatabaseAsync();
    }

    app.UseExceptionHandler();
    app.UseGroupErrors();
    app.UseStatusCodePages();
    app.UseSerilogRequestLogging();
    app.UseAuthentication();
    app.UseAuthorization();
    app.UseRateLimiter();

    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
        app.MapScalarApiReference(); // interactive API docs at /scalar
    }

    app.MapHealthEndpoints();
    app.MapSystemEndpoints();
    app.MapAuthEndpoints();
    app.MapDripEndpoints();
    app.MapUserEndpoints();
    app.MapConversationEndpoints();
    app.MapAnchoringEndpoints();
    app.MapGroupEndpoints();
    app.MapActivityEndpoints();
    app.MapAdminEndpoints();
    app.MapHub<ChatHub>(ChatHub.Path);

    await app.RunAsync();
}
catch (Exception ex) when (ex is not HostAbortedException)
{
    Log.Fatal(ex, "ChainChat API terminated unexpectedly");
    throw;
}
finally
{
    await Log.CloseAndFlushAsync();
}

/// <summary>Entry point marker, used by AddValidatorsFromAssemblyContaining and future integration tests.</summary>
public partial class Program;
