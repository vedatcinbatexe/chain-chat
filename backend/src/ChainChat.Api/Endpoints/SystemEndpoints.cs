using ChainChat.Infrastructure.Chain;
using Microsoft.Extensions.Options;

namespace ChainChat.Api.Endpoints;

public static class SystemEndpoints
{
    /// <param name="DeployBlocks">The block each contract was deployed in (or shortly before): where apps start reading its events.</param>
    public sealed record SystemInfo(string Network, long ChainId, IReadOnlyDictionary<string, string> Contracts, IReadOnlyDictionary<string, long> DeployBlocks);

    public static void MapSystemEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/system").WithTags("System");

        // Tells the mobile app which network and contract addresses this backend uses.
        group.MapGet("/info", (IOptions<ChainOptions> chain, ContractDeployments deployments) =>
            TypedResults.Ok(new SystemInfo(
                chain.Value.Network,
                chain.Value.ChainId,
                deployments.Names.ToDictionary(name => name, name => deployments.TryGet(name, out var d) ? d.Address : ""),
                deployments.Names.ToDictionary(name => name, name => deployments.TryGet(name, out var d) ? d.DeployBlock : 0))))
            .WithName("GetSystemInfo")
            .WithSummary("Network, chain id and deployed contract addresses");
    }
}
