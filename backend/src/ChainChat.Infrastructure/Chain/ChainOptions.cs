using System.ComponentModel.DataAnnotations;

namespace ChainChat.Infrastructure.Chain;

/// <summary>Blockchain connection settings (configuration section "Chain").</summary>
public sealed class ChainOptions
{
    public const string SectionName = "Chain";

    /// <summary>Network name; selects shared/deployments/{Network}.json (e.g. "anvil", "base-sepolia").</summary>
    [Required]
    public string Network { get; set; } = "anvil";

    /// <summary>Expected chain id — the health check fails if the RPC reports a different chain.</summary>
    [Range(1, long.MaxValue)]
    public long ChainId { get; set; } = 31337;

    /// <summary>RPC endpoints in priority order: the first is primary, the rest are fallbacks.</summary>
    [MinLength(1)]
    public string[] RpcUrls { get; set; } = [];

    /// <summary>Directory containing the per-network deployment files.</summary>
    [Required]
    public string DeploymentsPath { get; set; } = "../../../shared/deployments";

    /// <summary>Retries per endpoint before moving to the next one.</summary>
    [Range(0, 10)]
    public int MaxRetriesPerEndpoint { get; set; } = 2;

    [Range(1, 60)]
    public int RequestTimeoutSeconds { get; set; } = 10;
}
