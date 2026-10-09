using ChainChat.Api.Auth;
using ChainChat.Api.Endpoints;
using ChainChat.Api.Common;
using ChainChat.Infrastructure;
using FluentValidation;
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

    var app = builder.Build();

    if (app.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
    {
        await app.MigrateDatabaseAsync();
    }

    app.UseExceptionHandler();
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
