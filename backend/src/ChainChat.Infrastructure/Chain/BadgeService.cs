using System.Collections.Concurrent;
using System.Numerics;
using ChainChat.Core.Crypto;
using ChainChat.Infrastructure.Admin;
using Nethereum.ABI.FunctionEncoding.Attributes;
using Nethereum.Contracts;

namespace ChainChat.Infrastructure.Chain;

[Function("badgeTypeCount", "uint256")]
public sealed class BadgeTypeCountFunction : FunctionMessage;

[Function("badgeTypeName", "string")]
public sealed class BadgeTypeNameFunction : FunctionMessage
{
    [Parameter("uint256", "typeId", 1)]
    public BigInteger TypeId { get; set; }
}

[Function("balanceOfType", "uint256")]
public sealed class BalanceOfTypeFunction : FunctionMessage
{
    [Parameter("address", "owner", 1)]
    public string Owner { get; set; } = "";

    [Parameter("uint256", "typeId", 2)]
    public BigInteger TypeId { get; set; }
}

[Function("typeOf", "uint256")]
public sealed class TypeOfFunction : FunctionMessage
{
    [Parameter("uint256", "tokenId", 1)]
    public BigInteger TokenId { get; set; }
}

/// <summary>A kind of badge defined in the ClassBadge contract, e.g. 1 = "Student".</summary>
public sealed record BadgeType(int Id, string Name);

/// <summary>
/// Badge types and badge ownership, as the rest of the backend sees them (SDD §6.5). The real implementation asks
/// the chain; tests replace it to decide who holds what.
/// </summary>
public interface IBadgeReader
{
    /// <summary>The deployed ClassBadge contract (lowercase), or null if it is not deployed on this network.</summary>
    string? ContractAddress { get; }

    /// <summary>All badge types of the contract, in id order (ids start at 1).</summary>
    Task<IReadOnlyList<BadgeType>> TypesAsync(string contract, CancellationToken ct);

    /// <summary>The badge type name of one minted badge, e.g. "Student".</summary>
    Task<string> TypeNameOfTokenAsync(string contract, BigInteger tokenId, CancellationToken ct);

    /// <summary>Total number of badges (of any type) the address holds.</summary>
    Task<BigInteger> BalanceAsync(string contract, string address, CancellationToken ct);

    Task<int> BalanceOfTypeAsync(string contract, string address, int typeId, CancellationToken ct);

    /// <summary>Which of the badge types the address holds at least one of, right now.</summary>
    Task<IReadOnlySet<int>> HeldAsync(string contract, string address, IEnumerable<int> typeIds, CancellationToken ct);

    /// <summary>True if the address holds every badge type in the list (true for an empty list).</summary>
    Task<bool> HoldsAllAsync(string contract, string address, IReadOnlyCollection<int> typeIds, CancellationToken ct);
}

/// <summary>
/// Reads ClassBadge (ERC-721) badge types and ownership from the chain for NFT-gated groups (SDD §6.5). Ownership
/// is always asked from the chain and never cached, so a transferred badge stops counting at once.
/// </summary>
public sealed class BadgeService(ChainClient chain, ContractDeployments deployments) : IBadgeReader
{
    // Badge type names never change once created, so they can be cached per contract.
    private readonly ConcurrentDictionary<(string Contract, int Id), string> _names = new();

    /// <summary>The deployed ClassBadge contract (lowercase), or null if it is not deployed on this network.</summary>
    public string? ContractAddress => deployments.TryGet(ContractDeployments.ClassBadge, out var badge) ? badge.Address.ToLowerInvariant() : null;

    /// <summary>All badge types of the contract, in id order (ids start at 1).</summary>
    public async Task<IReadOnlyList<BadgeType>> TypesAsync(string contract, CancellationToken ct)
    {
        var count = (int)await chain.ExecuteAsync(web3 =>
            web3.Eth.GetContractQueryHandler<BadgeTypeCountFunction>().QueryAsync<BigInteger>(contract, new BadgeTypeCountFunction()), ct);

        var types = new List<BadgeType>(count);
        for (var id = 1; id <= count; id++)
        {
            if (!_names.TryGetValue((contract, id), out var name))
            {
                var typeId = id;
                name = await chain.ExecuteAsync(web3 =>
                    web3.Eth.GetContractQueryHandler<BadgeTypeNameFunction>().QueryAsync<string>(contract, new BadgeTypeNameFunction { TypeId = typeId }), ct);
                _names[(contract, id)] = name;
            }
            types.Add(new BadgeType(id, name));
        }
        return types;
    }

    /// <summary>The badge type name of one minted badge, e.g. "Student".</summary>
    public async Task<string> TypeNameOfTokenAsync(string contract, BigInteger tokenId, CancellationToken ct)
    {
        var typeId = (int)await chain.ExecuteAsync(web3 =>
            web3.Eth.GetContractQueryHandler<TypeOfFunction>().QueryAsync<BigInteger>(contract, new TypeOfFunction { TokenId = tokenId }), ct);
        return (await TypesAsync(contract, ct)).FirstOrDefault(t => t.Id == typeId)?.Name ?? $"#{typeId}";
    }

    /// <summary>Total number of badges (of any type) the address holds.</summary>
    public Task<BigInteger> BalanceAsync(string contract, string address, CancellationToken ct) =>
        chain.ExecuteAsync(web3 => web3.Eth.GetContractQueryHandler<BalanceOfFunction>()
            .QueryAsync<BigInteger>(contract, new BalanceOfFunction { Account = EthAddress.ToChecksum(address) }), ct);

    public async Task<int> BalanceOfTypeAsync(string contract, string address, int typeId, CancellationToken ct) =>
        (int)await chain.ExecuteAsync(web3 => web3.Eth.GetContractQueryHandler<BalanceOfTypeFunction>()
            .QueryAsync<BigInteger>(contract, new BalanceOfTypeFunction { Owner = EthAddress.ToChecksum(address), TypeId = typeId }), ct);

    /// <summary>Which of the badge types the address holds at least one of, right now.</summary>
    public async Task<IReadOnlySet<int>> HeldAsync(string contract, string address, IEnumerable<int> typeIds, CancellationToken ct)
    {
        var held = new HashSet<int>();
        foreach (var typeId in typeIds.Distinct())
        {
            if (await BalanceOfTypeAsync(contract, address, typeId, ct) > 0) held.Add(typeId);
        }
        return held;
    }

    /// <summary>True if the address holds every badge type in the list (true for an empty list).</summary>
    public async Task<bool> HoldsAllAsync(string contract, string address, IReadOnlyCollection<int> typeIds, CancellationToken ct) =>
        (await HeldAsync(contract, address, typeIds, ct)).Count == typeIds.Distinct().Count();
}
