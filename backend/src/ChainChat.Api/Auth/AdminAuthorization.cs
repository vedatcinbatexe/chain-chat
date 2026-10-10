using ChainChat.Infrastructure.Admin;
using Microsoft.AspNetCore.Authorization;

namespace ChainChat.Api.Auth;

/// <summary>The signed-in wallet must be an admin right now (checked on every request, so removal is immediate).</summary>
public sealed class AdminRequirement : IAuthorizationRequirement;

public sealed class AdminRequirementHandler(AdminService admins) : AuthorizationHandler<AdminRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, AdminRequirement requirement)
    {
        var address = context.User.Identity is { IsAuthenticated: true, Name: { } name } ? name : null;
        if (address is not null && await admins.IsAdminAsync(address)) context.Succeed(requirement);
    }
}

public static class AdminAuthorization
{
    public const string Policy = "Admin";

    public static IServiceCollection AddAdminAuthorization(this IServiceCollection services)
    {
        services.AddScoped<IAuthorizationHandler, AdminRequirementHandler>();
        services.AddAuthorizationBuilder().AddPolicy(Policy, policy => policy.RequireAuthenticatedUser().AddRequirements(new AdminRequirement()));
        return services;
    }
}
