using System.Numerics;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Chain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nethereum.ABI.FunctionEncoding.Attributes;
using Nethereum.RPC.Eth.DTOs;

namespace ChainChat.Infrastructure.Indexing;

/// <summary>Anchor.RootAnchored(uint256 indexed batchId, bytes32 indexed root, uint64 fromMessageId, uint64 toMessageId)</summary>
[Event("RootAnchored")]
public sealed class RootAnchoredEvent : IEventDTO
{
    [Parameter("uint256", "batchId", 1, true)]
    public BigInteger BatchId { get; set; }

    [Parameter("bytes32", "root", 2, true)]
    public byte[] Root { get; set; } = [];

    [Parameter("uint64", "fromMessageId", 3, false)]
    public ulong FromMessageId { get; set; }

    [Parameter("uint64", "toMessageId", 4, false)]
    public ulong ToMessageId { get; set; }
}

/// <summary>
/// Confirms anchor batches once their RootAnchored event is on-chain with enough confirmations (SDD §6.6).
/// Only then do apps get a proof, so "anchored" always means "the chain says so".
/// </summary>
public sealed class AnchorIndexer(
    IServiceScopeFactory scopes,
    ChainClient chain,
    ContractDeployments deployments,
    IOptions<IndexerOptions> options,
    TimeProvider time,
    ILogger<AnchorIndexer> logger) : ContractEventIndexer(scopes, chain, deployments, options, time, logger)
{
    protected override string ContractName => ContractDeployments.Anchor;

    protected override async Task<IEnumerable<IndexedEvent>> FetchEventsAsync(string contract, BlockParameter from, BlockParameter to, CancellationToken ct) =>
        (await GetEventsAsync<RootAnchoredEvent>(contract, from, to, ct))
            .Select(e => new IndexedEvent(e.Log, (db, token) => OnRootAnchoredAsync(db, e.Event, e.Log, token)));

    private async Task OnRootAnchoredAsync(ChainChatDbContext db, RootAnchoredEvent e, FilterLog log, CancellationToken ct)
    {
        var root = Hex.FromBytes(e.Root);
        var batch = await db.AnchorBatches.FirstOrDefaultAsync(b => b.Root == root, ct);
        if (batch is null)
        {
            Logger.LogWarning("RootAnchored batch {BatchId} ({Root}) was not created by this server", e.BatchId, root);
            return;
        }

        batch.Status = AnchorBatchStatus.Confirmed;
        batch.ChainBatchId = (long)e.BatchId;
        batch.TxHash = log.TransactionHash.ToLowerInvariant();
        batch.BlockNumber = (long)log.BlockNumber.Value;
        batch.AnchoredAt = Time.GetUtcNow();
        Logger.LogInformation("Anchor batch {Id} confirmed on-chain as batch {ChainBatchId} in block {Block}", batch.Id, e.BatchId, batch.BlockNumber);
    }
}
