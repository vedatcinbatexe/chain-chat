using System.ComponentModel.DataAnnotations;
using ChainChat.Core.Anchoring;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Chain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nethereum.ABI.FunctionEncoding.Attributes;
using Nethereum.Contracts;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;

namespace ChainChat.Infrastructure.Anchoring;

/// <summary>Anchoring job settings (configuration section "Anchoring", SDD §6.6).</summary>
public sealed class AnchoringOptions
{
    public const string SectionName = "Anchoring";

    public bool Enabled { get; set; }

    /// <summary>How often new messages are anchored (an admin can also trigger a run).</summary>
    [Range(5, 86_400)]
    public int IntervalSeconds { get; set; } = 300;

    /// <summary>Only anchor messages older than this, so a message still being saved is never skipped.</summary>
    [Range(0, 300)]
    public int SettleSeconds { get; set; } = 5;

    [Range(1, 100_000)]
    public int MaxBatchSize { get; set; } = 1_000;

    [Range(10, 3_600)]
    public int ReceiptTimeoutSeconds { get; set; } = 120;

    /// <summary>Key of the Anchor contract owner. Local default: the public Anvil deployer key. Never a real key in git.</summary>
    public string PrivateKey { get; set; } = "";
}

[Function("anchorRoot", "uint256")]
public sealed class AnchorRootFunction : FunctionMessage
{
    [Parameter("bytes32", "root", 1)]
    public byte[] Root { get; set; } = [];

    [Parameter("uint64", "fromMessageId", 2)]
    public ulong FromMessageId { get; set; }

    [Parameter("uint64", "toMessageId", 3)]
    public ulong ToMessageId { get; set; }
}

[Function("lastAnchoredMessageId", "uint64")]
public sealed class LastAnchoredMessageIdFunction : FunctionMessage;

/// <summary>
/// Periodically anchors new messages on-chain (SDD §6.6): collect un-anchored messages → Merkle tree → store each
/// message's proof → anchorRoot(root, fromId, toId). The AnchorIndexer confirms the batch from the RootAnchored event.
/// <para>
/// Crash-safe state machine, one batch in flight: Pending (built, not sent) → Submitted (tx sent) → Confirmed
/// (by the indexer) or Failed (reverted → messages released for the next batch).
/// </para>
/// </summary>
public sealed class AnchoringJob(
    IServiceScopeFactory scopes,
    ChainClient chain,
    ContractDeployments deployments,
    IOptions<AnchoringOptions> options,
    IOptions<ChainOptions> chainOptions,
    TimeProvider time,
    ILogger<AnchoringJob> logger) : BackgroundService
{
    private readonly SemaphoreSlim _trigger = new(0, 1);

    public int IntervalSeconds => options.Value.IntervalSeconds;

    /// <summary>Runs the job now instead of waiting for the next interval (e.g. for a live demo).</summary>
    public void RequestRun()
    {
        if (_trigger.CurrentCount == 0) _trigger.Release();
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var settings = options.Value;
        if (!settings.Enabled) return;
        if (!deployments.TryGet(ContractDeployments.Anchor, out var anchor))
        {
            logger.LogWarning("Anchor is not deployed; the anchoring job is idle");
            return;
        }

        logger.LogInformation("Anchoring new messages every {Seconds}s to {Address}", settings.IntervalSeconds, anchor.Address);
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(anchor.Address, settings, ct);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                logger.LogWarning(ex, "Anchoring run failed; retrying at the next interval");
            }

            await _trigger.WaitAsync(TimeSpan.FromSeconds(settings.IntervalSeconds), ct);
        }
    }

    private async Task RunOnceAsync(string anchor, AnchoringOptions settings, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ChainChatDbContext>();

        // 1. Finish the batch in flight first (also after a crash or restart).
        var inFlight = await db.AnchorBatches
            .Where(b => b.Status == AnchorBatchStatus.Pending || b.Status == AnchorBatchStatus.Submitted)
            .OrderBy(b => b.Id)
            .FirstOrDefaultAsync(ct);
        if (inFlight is not null)
        {
            await ContinueAsync(db, anchor, inFlight, settings, ct);
            return;
        }

        // 2. Build a new batch. The contract only accepts ids above the last anchored one, so ask the chain itself.
        var lastAnchored = (long)await chain.ExecuteAsync(web3 =>
            web3.Eth.GetContractQueryHandler<LastAnchoredMessageIdFunction>().QueryAsync<ulong>(anchor, new LastAnchoredMessageIdFunction()), ct);
        var settledBefore = time.GetUtcNow().AddSeconds(-settings.SettleSeconds);

        var candidates = await db.Messages
            .Where(m => m.AnchorBatchId == null && m.Id > lastAnchored && m.ServerReceivedAt <= settledBefore)
            .OrderBy(m => m.Id)
            .Take(settings.MaxBatchSize)
            .Select(m => new { m.Id, m.MessageHash })
            .ToListAsync(ct);
        if (candidates.Count == 0) return; // empty batches are never anchored

        var plan = AnchorBatchBuilder.Build(candidates.Select(c => new AnchorCandidate(c.Id, Hex.ToBytes(c.MessageHash))).ToList());
        var batch = await StoreBatchAsync(db, plan, ct);
        logger.LogInformation("Built anchor batch {Id}: {Count} message(s) #{From}–#{To}, root {Root}", batch.Id, batch.LeafCount, batch.FromMessageId, batch.ToMessageId, batch.Root);

        await ContinueAsync(db, anchor, batch, settings, ct);
    }

    /// <summary>Saves the batch and every message's leaf index and proof in one transaction (state: Pending).</summary>
    private async Task<AnchorBatch> StoreBatchAsync(ChainChatDbContext db, AnchorBatchPlan plan, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var batch = new AnchorBatch
        {
            Root = Hex.FromBytes(plan.Root),
            FromMessageId = plan.FromMessageId,
            ToMessageId = plan.ToMessageId,
            LeafCount = plan.Proofs.Count,
            Status = AnchorBatchStatus.Pending,
            CreatedAt = time.GetUtcNow(),
        };
        db.AnchorBatches.Add(batch);
        await db.SaveChangesAsync(ct);

        var ids = plan.Proofs.Select(p => p.MessageId).ToList();
        var messages = await db.Messages.Where(m => ids.Contains(m.Id)).ToDictionaryAsync(m => m.Id, ct);
        foreach (var proof in plan.Proofs)
        {
            var message = messages[proof.MessageId];
            message.AnchorBatchId = batch.Id;
            message.LeafIndex = proof.LeafIndex;
            message.MerkleProof = proof.Proof.Select(p => Hex.FromBytes(p)).ToArray();
        }
        await db.SaveChangesAsync(ct);

        await transaction.CommitAsync(ct);
        return batch;
    }

    private async Task ContinueAsync(ChainChatDbContext db, string anchor, AnchorBatch batch, AnchoringOptions settings, CancellationToken ct)
    {
        var web3 = new Web3(new Account(settings.PrivateKey, chainOptions.Value.ChainId), chainOptions.Value.RpcUrls[0]);

        if (batch.Status == AnchorBatchStatus.Pending)
        {
            try
            {
                batch.TxHash = await web3.Eth.GetContractTransactionHandler<AnchorRootFunction>().SendRequestAsync(anchor, new AnchorRootFunction
                {
                    Root = Hex.ToBytes(batch.Root),
                    FromMessageId = (ulong)batch.FromMessageId,
                    ToMessageId = (ulong)batch.ToMessageId,
                });
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Rejected before it was sent (e.g. the contract would revert): release the messages for the next batch.
                logger.LogWarning(ex, "Could not send anchor batch {Id}", batch.Id);
                await FailAsync(db, batch, ct);
                return;
            }

            batch.Status = AnchorBatchStatus.Submitted;
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Anchor batch {Id} submitted: {TxHash}", batch.Id, batch.TxHash);
        }

        // Submitted: wait for the receipt. Success is confirmed by the AnchorIndexer from the RootAnchored event.
        var deadline = time.GetUtcNow().AddSeconds(settings.ReceiptTimeoutSeconds);
        while (time.GetUtcNow() < deadline)
        {
            var receipt = await web3.Eth.Transactions.GetTransactionReceipt.SendRequestAsync(batch.TxHash);
            if (receipt is not null)
            {
                if (receipt.Status?.Value == 1) logger.LogInformation("Anchor batch {Id} mined in block {Block}", batch.Id, receipt.BlockNumber.Value);
                else await FailAsync(db, batch, ct);
                return;
            }
            await Task.Delay(TimeSpan.FromSeconds(1), time, ct);
        }
        logger.LogWarning("Anchor batch {Id} not mined within {Seconds}s; will check again", batch.Id, settings.ReceiptTimeoutSeconds);
    }

    private async Task FailAsync(ChainChatDbContext db, AnchorBatch batch, CancellationToken ct)
    {
        batch.Status = AnchorBatchStatus.Failed;
        await db.SaveChangesAsync(ct);
        await db.Messages.Where(m => m.AnchorBatchId == batch.Id).ExecuteUpdateAsync(set => set
            .SetProperty(m => m.AnchorBatchId, (long?)null)
            .SetProperty(m => m.LeafIndex, (int?)null)
            .SetProperty(m => m.MerkleProof, (string[]?)null), ct);
        logger.LogWarning("Anchor batch {Id} failed; its messages will be included in the next batch", batch.Id);
    }
}
