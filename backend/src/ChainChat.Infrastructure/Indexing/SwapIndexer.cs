using System.Numerics;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Assets;
using ChainChat.Infrastructure.Chain;
using ChainChat.Infrastructure.Notifications;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nethereum.ABI.FunctionEncoding.Attributes;
using Nethereum.RPC.Eth.DTOs;

namespace ChainChat.Infrastructure.Indexing;

/// <summary>SwapDesk.OrderCreated(uint256 indexed id, address indexed maker, address sellToken, uint256 sellAmount, address buyToken, uint256 buyAmount, uint64 expiry)</summary>
[Event("OrderCreated")]
public sealed class SwapOrderCreatedEvent : IEventDTO
{
    [Parameter("uint256", "id", 1, true)]
    public BigInteger Id { get; set; }

    [Parameter("address", "maker", 2, true)]
    public string Maker { get; set; } = "";

    [Parameter("address", "sellToken", 3, false)]
    public string SellToken { get; set; } = "";

    [Parameter("uint256", "sellAmount", 4, false)]
    public BigInteger SellAmount { get; set; }

    [Parameter("address", "buyToken", 5, false)]
    public string BuyToken { get; set; } = "";

    [Parameter("uint256", "buyAmount", 6, false)]
    public BigInteger BuyAmount { get; set; }

    [Parameter("uint64", "expiry", 7, false)]
    public ulong Expiry { get; set; }
}

/// <summary>SwapDesk.OrderFilled(uint256 indexed id, address indexed maker, address indexed taker)</summary>
[Event("OrderFilled")]
public sealed class SwapOrderFilledEvent : IEventDTO
{
    [Parameter("uint256", "id", 1, true)]
    public BigInteger Id { get; set; }

    [Parameter("address", "maker", 2, true)]
    public string Maker { get; set; } = "";

    [Parameter("address", "taker", 3, true)]
    public string Taker { get; set; } = "";
}

/// <summary>SwapDesk.OrderCancelled(uint256 indexed id, address indexed maker)</summary>
[Event("OrderCancelled")]
public sealed class SwapOrderCancelledEvent : IEventDTO
{
    [Parameter("uint256", "id", 1, true)]
    public BigInteger Id { get; set; }

    [Parameter("address", "maker", 2, true)]
    public string Maker { get; set; } = "";
}

/// <summary>
/// Mirrors the SwapDesk contract's orders (SDD §6.9) for the dashboard, and tells a maker when their offer was
/// taken. The contract settles swaps by itself; this copy decides nothing, and apps read an order's state from
/// the chain.
/// </summary>
public sealed class SwapIndexer(
    IServiceScopeFactory scopes,
    ChainClient chain,
    ContractDeployments deployments,
    AssetCatalog catalog,
    IUserNotifier users,
    IOptions<IndexerOptions> options,
    TimeProvider time,
    ILogger<SwapIndexer> logger) : ContractEventIndexer(scopes, chain, deployments, options, time, logger)
{
    private const string ZeroAddress = "0x0000000000000000000000000000000000000000";

    protected override string ContractName => ContractDeployments.SwapDesk;

    protected override async Task<IEnumerable<IndexedEvent>> FetchEventsAsync(string contract, BlockParameter from, BlockParameter to, CancellationToken ct)
    {
        var created = await GetEventsAsync<SwapOrderCreatedEvent>(contract, from, to, ct);
        var filled = await GetEventsAsync<SwapOrderFilledEvent>(contract, from, to, ct);
        var cancelled = await GetEventsAsync<SwapOrderCancelledEvent>(contract, from, to, ct);

        return created.Select(e => new IndexedEvent(e.Log, (db, token) => OnCreatedAsync(db, e.Event, e.Log, token)))
            .Concat(filled.Select(e => new IndexedEvent(e.Log, (db, token) => OnFilledAsync(db, e.Event, e.Log, token))))
            .Concat(cancelled.Select(e => new IndexedEvent(e.Log, (db, token) => OnCancelledAsync(db, e.Event, e.Log, token))));
    }

    /// <summary>ETH for the zero address, a known token's symbol, or the contract address of an unknown token.</summary>
    private string SymbolOf(string token) =>
        EthAddress.Normalize(token) == ZeroAddress ? "ETH" : catalog.FindByAddress(token)?.Symbol ?? EthAddress.Normalize(token);

    private async Task OnCreatedAsync(ChainChatDbContext db, SwapOrderCreatedEvent e, FilterLog log, CancellationToken ct)
    {
        var id = (long)e.Id;
        if (await db.SwapOrders.AnyAsync(o => o.Id == id, ct)) return;

        db.SwapOrders.Add(new SwapOrder
        {
            Id = id,
            Maker = EthAddress.Normalize(e.Maker),
            SellAsset = SymbolOf(e.SellToken),
            SellAmount = e.SellAmount,
            BuyAsset = SymbolOf(e.BuyToken),
            BuyAmount = e.BuyAmount,
            ExpiresAt = DateTimeOffset.FromUnixTimeSeconds((long)Math.Min(e.Expiry, (ulong)DateTimeOffset.MaxValue.ToUnixTimeSeconds())),
            Status = SwapOrderStatus.Open,
            CreateTxHash = log.TransactionHash.ToLowerInvariant(),
            CreatedAt = Time.GetUtcNow(),
        });
    }

    private async Task OnFilledAsync(ChainChatDbContext db, SwapOrderFilledEvent e, FilterLog log, CancellationToken ct)
    {
        var id = (long)e.Id;
        // Created in the same batch and not saved yet, or in the database from an earlier one.
        var order = db.SwapOrders.Local.FirstOrDefault(o => o.Id == id) ?? await db.SwapOrders.FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null || order.Status != SwapOrderStatus.Open) return;

        order.Status = SwapOrderStatus.Filled;
        order.Taker = EthAddress.Normalize(e.Taker);
        order.CloseTxHash = log.TransactionHash.ToLowerInvariant();
        order.ClosedAt = Time.GetUtcNow();

        var taker = await db.Users.AsNoTracking().Where(u => u.Address == order.Taker).Select(u => u.Username).FirstOrDefaultAsync(ct);
        var received = Format(order.BuyAmount, order.BuyAsset);
        var gave = Format(order.SellAmount, order.SellAsset);
        await users.NotifyAsync(order.Maker, new UserNotification(
            "SwapFilled", "Your swap offer was accepted", $"{(taker is null ? "Someone" : $"@{taker}")} took it: you received {received} for {gave}."), ct);
        Logger.LogInformation("Swap order {Id} filled: {Maker} gave {Gave}, {Taker} gave {Received}", id, order.Maker, gave, order.Taker, received);
    }

    private async Task OnCancelledAsync(ChainChatDbContext db, SwapOrderCancelledEvent e, FilterLog log, CancellationToken ct)
    {
        var id = (long)e.Id;
        var order = db.SwapOrders.Local.FirstOrDefault(o => o.Id == id) ?? await db.SwapOrders.FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null || order.Status != SwapOrderStatus.Open) return;

        order.Status = SwapOrderStatus.Cancelled;
        order.CloseTxHash = log.TransactionHash.ToLowerInvariant();
        order.ClosedAt = Time.GetUtcNow();
    }

    private string Format(BigInteger wei, string symbol) => catalog.Find(symbol) is { } asset ? AssetTransferService.Format(wei, asset) : $"{wei} of {symbol}";
}
