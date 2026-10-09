using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;

namespace ChainChat.Infrastructure.Chain;

/// <summary>Healthy when an RPC endpoint answers and reports the configured chain id.</summary>
public sealed class ChainHealthCheck(ChainClient chain, IOptions<ChainOptions> options) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default)
    {
        try
        {
            var chainId = await chain.GetChainIdAsync(ct);
            var block = await chain.GetBlockNumberAsync(ct);
            var data = new Dictionary<string, object> { ["network"] = options.Value.Network, ["chainId"] = chainId, ["block"] = block };

            return chainId == options.Value.ChainId
                ? HealthCheckResult.Healthy($"Block {block}", data)
                : HealthCheckResult.Unhealthy($"Expected chain {options.Value.ChainId}, RPC reports {chainId}", data: data);
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("RPC unreachable", ex);
        }
    }
}
