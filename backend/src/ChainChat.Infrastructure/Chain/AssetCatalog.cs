using System.Numerics;
using ChainChat.Core.Crypto;
using ChainChat.Infrastructure.Admin;
using Nethereum.Contracts;

namespace ChainChat.Infrastructure.Chain;

/// <summary>An asset wallets can hold and move: the chain's native ETH, or an ERC-20 token.</summary>
/// <param name="Address">The token contract (lowercase); null for native ETH.</param>
public sealed record Asset(string Symbol, string Name, string? Address, int Decimals, long DeployBlock)
{
    public bool IsNative => Address is null;
}

/// <summary>
/// The assets this deployment supports (SDD §5.2): ETH, CHAT, and the extra test tokens — whichever of them are
/// deployed. Balances are always read from the chain; nothing here is stored in the database.
/// </summary>
public sealed class AssetCatalog(ContractDeployments deployments, ChainClient chain)
{
    // Symbol, display name, and the key in shared/deployments/{network}.json (null = native).
    private static readonly (string Symbol, string Name, string? Deployment)[] Known =
    [
        ("ETH", "Ether", null),
        ("CHAT", "ChainChat Token", ContractDeployments.ChatToken),
        ("tUSD", "Test USD", ContractDeployments.TestUSD),
        ("tBTC", "Test Bitcoin", ContractDeployments.TestBTC),
    ];

    private IReadOnlyList<Asset>? _assets;

    public IReadOnlyList<Asset> Assets => _assets ??= Known
        .Select(k => k.Deployment is null
            ? new Asset(k.Symbol, k.Name, null, 18, 0)
            : deployments.TryGet(k.Deployment, out var d) ? new Asset(k.Symbol, k.Name, d.Address.ToLowerInvariant(), 18, d.DeployBlock) : null)
        .OfType<Asset>()
        .ToList();

    public Asset? Find(string? symbol) => Assets.FirstOrDefault(a => string.Equals(a.Symbol, symbol, StringComparison.OrdinalIgnoreCase));

    public Asset? FindByAddress(string? address) => address is null ? null : Assets.FirstOrDefault(a => a.Address == address.ToLowerInvariant());

    /// <summary>The balance of one asset, in its smallest unit (wei).</summary>
    public async Task<BigInteger> BalanceAsync(Asset asset, string address, CancellationToken ct)
    {
        var owner = EthAddress.ToChecksum(address);
        return asset.IsNative
            ? (await chain.ExecuteAsync(web3 => web3.Eth.GetBalance.SendRequestAsync(owner), ct)).Value
            : await chain.ExecuteAsync(web3 => web3.Eth.GetContractQueryHandler<BalanceOfFunction>().QueryAsync<BigInteger>(asset.Address, new BalanceOfFunction { Account = owner }), ct);
    }

    /// <summary>Every asset's balance of an address, by symbol.</summary>
    public async Task<IReadOnlyDictionary<string, BigInteger>> BalancesAsync(string address, CancellationToken ct)
    {
        var balances = new Dictionary<string, BigInteger>();
        foreach (var asset in Assets) balances[asset.Symbol] = await BalanceAsync(asset, address, ct);
        return balances;
    }
}

/// <summary>One transaction at a time from the funder key, so two requests never use the same account nonce.</summary>
public static class FunderGate
{
    public static readonly SemaphoreSlim Lock = new(1, 1);
}
