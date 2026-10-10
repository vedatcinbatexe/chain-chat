using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ChainChat.Infrastructure.Chain;

/// <summary>One deployed contract, as written by the Foundry deploy script (Phase 2).</summary>
public sealed record ContractDeployment(
    [property: JsonPropertyName("address")] string Address,
    [property: JsonPropertyName("deployBlock")] long DeployBlock,
    [property: JsonPropertyName("abi")] JsonElement? Abi);

/// <summary>shared/deployments/{network}.json — see shared/deployments/README.md for the format.</summary>
public sealed record DeploymentManifest(
    [property: JsonPropertyName("network")] string Network,
    [property: JsonPropertyName("chainId")] long ChainId,
    [property: JsonPropertyName("contracts")] Dictionary<string, ContractDeployment> Contracts);

/// <summary>
/// Contract addresses and ABIs for the configured network.
/// Missing files are allowed (contracts are not deployed yet); callers check <see cref="TryGet"/>.
/// </summary>
public sealed class ContractDeployments
{
    public const string Registry = "Registry";
    public const string ChatToken = "ChatToken";
    public const string ClassBadge = "ClassBadge";
    public const string Anchor = "Anchor";
    public const string TestUSD = "TestUSD";
    public const string TestBTC = "TestBTC";

    private readonly IReadOnlyDictionary<string, ContractDeployment> _contracts;

    public ContractDeployments(IOptions<ChainOptions> options, ILogger<ContractDeployments> logger)
    {
        var chain = options.Value;
        var path = Path.GetFullPath(Path.Combine(chain.DeploymentsPath, $"{chain.Network}.json"));

        if (!File.Exists(path))
        {
            logger.LogWarning("No deployment file at {Path}; contract features are unavailable until contracts are deployed", path);
            _contracts = new Dictionary<string, ContractDeployment>();
            return;
        }

        var manifest = JsonSerializer.Deserialize<DeploymentManifest>(File.ReadAllText(path))
            ?? throw new InvalidOperationException($"Deployment file {path} is empty");

        if (manifest.ChainId != chain.ChainId)
        {
            throw new InvalidOperationException(
                $"Deployment file {path} is for chain {manifest.ChainId}, but Chain:ChainId is {chain.ChainId}");
        }

        _contracts = manifest.Contracts;
        logger.LogInformation("Loaded {Count} contract deployments for {Network} from {Path}", _contracts.Count, chain.Network, path);
    }

    public IReadOnlyCollection<string> Names => _contracts.Keys.ToList();

    public bool TryGet(string name, out ContractDeployment deployment) => _contracts.TryGetValue(name, out deployment!);
}
