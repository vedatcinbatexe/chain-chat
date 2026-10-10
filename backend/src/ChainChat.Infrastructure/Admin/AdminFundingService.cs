using System.Numerics;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Chain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nethereum.ABI.FunctionEncoding.Attributes;
using Nethereum.Contracts;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;

namespace ChainChat.Infrastructure.Admin;

[Function("mint")]
public sealed class MintFunction : FunctionMessage
{
    [Parameter("address", "to", 1)]
    public string To { get; set; } = "";

    [Parameter("uint256", "amount", 2)]
    public BigInteger Amount { get; set; }
}

[Function("balanceOf", "uint256")]
public sealed class BalanceOfFunction : FunctionMessage
{
    [Parameter("address", "account", 1)]
    public string Account { get; set; } = "";
}

[Function("mint", "uint256")]
public sealed class MintBadgeFunction : FunctionMessage
{
    [Parameter("address", "to", 1)]
    public string To { get; set; } = "";

    [Parameter("uint256", "typeId", 2)]
    public BigInteger TypeId { get; set; }
}

[Function("createBadgeType", "uint256")]
public sealed class CreateBadgeTypeFunction : FunctionMessage
{
    [Parameter("string", "name", 1)]
    public string Name { get; set; } = "";
}

/// <summary>ETH and CHAT in the smallest unit (wei); Badges is a count. Null when that contract is not deployed.</summary>
public sealed record AccountBalances(BigInteger Eth, BigInteger? Chat, BigInteger? Badges);

/// <summary>Why funding was refused; the code is returned to the dashboard.</summary>
public sealed class FundingException(string code) : Exception(code)
{
    public string Code { get; } = code;
}

/// <summary>
/// Adds balance to an account from the admin dashboard: sends test ETH, or mints CHAT (the funder key owns the
/// ChatToken contract). Every funding is a real transaction and is recorded with the admin who made it.
/// </summary>
public sealed class AdminFundingService(
    ChainChatDbContext db,
    ChainClient chain,
    ContractDeployments deployments,
    AdminService admins,
    BadgeService badges,
    IOptions<AdminOptions> options,
    IOptions<ChainOptions> chainOptions,
    TimeProvider time,
    ILogger<AdminFundingService> logger)
{
    // One funding transaction at a time, so two admins never use the same account nonce.
    private static readonly SemaphoreSlim Gate = new(1, 1);

    public bool Enabled => options.Value.FunderPrivateKey.Length > 0;

    public string? FunderAddress => Enabled ? new Account(options.Value.FunderPrivateKey).Address : null;

    public async Task<AccountBalances> GetBalancesAsync(string address, CancellationToken ct)
    {
        var checksum = EthAddress.ToChecksum(address);
        var eth = (await chain.ExecuteAsync(web3 => web3.Eth.GetBalance.SendRequestAsync(checksum), ct)).Value;
        BigInteger? chat = deployments.TryGet(ContractDeployments.ChatToken, out var token)
            ? await chain.ExecuteAsync(web3 => web3.Eth.GetContractQueryHandler<BalanceOfFunction>().QueryAsync<BigInteger>(token.Address, new BalanceOfFunction { Account = checksum }), ct)
            : null;
        BigInteger? badgeCount = badges.ContractAddress is { } badge ? await badges.BalanceAsync(badge, checksum, ct) : null;
        return new AccountBalances(eth, chat, badgeCount);
    }

    /// <summary>Adds a new badge type to the ClassBadge contract (owner only) and returns it.</summary>
    public async Task<BadgeType> CreateBadgeTypeAsync(string admin, string name, CancellationToken ct)
    {
        var settings = options.Value;
        if (!Enabled) throw new FundingException("FundingDisabled");
        var trimmed = name.Trim();
        if (trimmed.Length is 0 or > 32 || System.Text.Encoding.UTF8.GetByteCount(trimmed) > 32) throw new FundingException("InvalidBadgeName");
        var contract = badges.ContractAddress ?? throw new FundingException("BadgeNotDeployed");
        if ((await badges.TypesAsync(contract, ct)).Any(t => string.Equals(t.Name, trimmed, StringComparison.OrdinalIgnoreCase))) throw new FundingException("BadgeNameTaken");

        var web3 = new Web3(new Account(settings.FunderPrivateKey, chainOptions.Value.ChainId), chainOptions.Value.RpcUrls[0]);
        string txHash;
        await Gate.WaitAsync(ct);
        try
        {
            var receipt = await web3.Eth.GetContractTransactionHandler<CreateBadgeTypeFunction>()
                .SendRequestAndWaitForReceiptAsync(contract, new CreateBadgeTypeFunction { Name = trimmed }, ct);
            if (receipt.Status?.Value != 1) throw new FundingException("TransactionReverted");
            txHash = receipt.TransactionHash;
        }
        finally
        {
            Gate.Release();
        }

        var created = (await badges.TypesAsync(contract, ct)).Last(t => t.Name == trimmed);
        admins.Audit(admin, "CreateBadgeType", $"#{created.Id}", $"{created.Name} · {txHash}");
        await db.SaveChangesAsync(CancellationToken.None);
        logger.LogInformation("Admin {Admin} created badge type {Id} \"{Name}\": {TxHash}", EthAddress.Normalize(admin), created.Id, created.Name, txHash);
        return created;
    }

    /// <summary>Mints one ClassBadge (ERC-721) of the given type to the address, so it can join groups that require it (SDD §6.5).</summary>
    public async Task<AdminFunding> MintBadgeAsync(string admin, string address, int typeId, CancellationToken ct)
    {
        var settings = options.Value;
        if (!Enabled) throw new FundingException("FundingDisabled");
        if (!EthAddress.IsValid(address)) throw new FundingException("InvalidAddress");
        var contract = badges.ContractAddress ?? throw new FundingException("BadgeNotDeployed");
        var type = (await badges.TypesAsync(contract, ct)).FirstOrDefault(t => t.Id == typeId) ?? throw new FundingException("UnknownBadgeType");

        var web3 = new Web3(new Account(settings.FunderPrivateKey, chainOptions.Value.ChainId), chainOptions.Value.RpcUrls[0]);
        string txHash;
        await Gate.WaitAsync(ct);
        try
        {
            var receipt = await web3.Eth.GetContractTransactionHandler<MintBadgeFunction>()
                .SendRequestAndWaitForReceiptAsync(contract, new MintBadgeFunction { To = EthAddress.ToChecksum(address), TypeId = typeId }, ct);
            if (receipt.Status?.Value != 1) throw new FundingException("TransactionReverted");
            txHash = receipt.TransactionHash;
        }
        finally
        {
            Gate.Release();
        }

        var funding = new AdminFunding
        {
            Address = EthAddress.Normalize(address),
            Asset = FundingAsset.Badge,
            Amount = BigInteger.One,
            TxHash = txHash,
            Admin = EthAddress.Normalize(admin),
            CreatedAt = time.GetUtcNow(),
        };
        db.AdminFundings.Add(funding);
        admins.Audit(admin, "MintBadge", funding.Address, $"{type.Name} (#{type.Id}) · {txHash}");
        await db.SaveChangesAsync(CancellationToken.None);

        logger.LogInformation("Admin {Admin} minted a {Type} badge to {Address}: {TxHash}", funding.Admin, type.Name, funding.Address, txHash);
        return funding;
    }

    /// <param name="amount">In whole units (ETH or CHAT), e.g. 0.5.</param>
    public async Task<AdminFunding> FundAsync(string admin, string address, FundingAsset asset, decimal amount, CancellationToken ct)
    {
        var settings = options.Value;
        if (!Enabled) throw new FundingException("FundingDisabled");
        if (!EthAddress.IsValid(address)) throw new FundingException("InvalidAddress");
        if (asset == FundingAsset.Badge) throw new FundingException("UnknownAsset"); // badges are minted with MintBadgeAsync
        var limit = asset == FundingAsset.Eth ? settings.MaxFundEth : settings.MaxFundChat;
        if (amount <= 0 || amount > limit) throw new FundingException("AmountOutOfRange");

        var to = EthAddress.ToChecksum(address);
        var amountWei = Web3.Convert.ToWei(amount); // ETH and CHAT both have 18 decimals
        var web3 = new Web3(new Account(settings.FunderPrivateKey, chainOptions.Value.ChainId), chainOptions.Value.RpcUrls[0]);

        string txHash;
        await Gate.WaitAsync(ct);
        try
        {
            if (asset == FundingAsset.Eth)
            {
                var receipt = await web3.Eth.GetEtherTransferService().TransferEtherAndWaitForReceiptAsync(to, amount, cancellationToken: ct);
                txHash = receipt.TransactionHash;
            }
            else
            {
                if (!deployments.TryGet(ContractDeployments.ChatToken, out var token)) throw new FundingException("TokenNotDeployed");
                var receipt = await web3.Eth.GetContractTransactionHandler<MintFunction>()
                    .SendRequestAndWaitForReceiptAsync(token.Address, new MintFunction { To = to, Amount = amountWei }, ct);
                if (receipt.Status?.Value != 1) throw new FundingException("TransactionReverted");
                txHash = receipt.TransactionHash;
            }
        }
        finally
        {
            Gate.Release();
        }

        var funding = new AdminFunding
        {
            Address = EthAddress.Normalize(address),
            Asset = asset,
            Amount = amountWei,
            TxHash = txHash,
            Admin = EthAddress.Normalize(admin),
            CreatedAt = time.GetUtcNow(),
        };
        db.AdminFundings.Add(funding);
        admins.Audit(admin, "FundAccount", funding.Address, $"{amount} {asset.ToString().ToUpperInvariant()} · {txHash}");
        await db.SaveChangesAsync(CancellationToken.None);

        logger.LogInformation("Admin {Admin} funded {Address} with {Amount} {Asset}: {TxHash}", funding.Admin, funding.Address, amount, asset, txHash);
        return funding;
    }
}
