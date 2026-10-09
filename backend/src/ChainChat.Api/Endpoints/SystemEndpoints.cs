using ChainChat.Infrastructure.Chain;
using Microsoft.Extensions.Options;

namespace ChainChat.Api.Endpoints;

public static class SystemEndpoints
{
    public sealed record SystemInfo(string Network, long ChainId, IReadOnlyDictionary<string, string> Contracts);

    public static void MapSystemEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/system").WithTags("System");

        // Tells the mobile app which network and contract addresses this backend uses.
        group.MapGet("/info", (IOptions<ChainOptions> chain, ContractDeployments deployments) =>
            TypedResults.Ok(new SystemInfo(
                chain.Value.Network,
                chain.Value.ChainId,
                deployments.Names.ToDictionary(name => name, name => deployments.TryGet(name, out var d) ? d.Address : ""))))
            .WithName("GetSystemInfo")
            .WithSummary("Network, chain id and deployed contract addresses");
    }
}
