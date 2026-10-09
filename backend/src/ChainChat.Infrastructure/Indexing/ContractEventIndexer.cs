using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Chain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nethereum.ABI.FunctionEncoding.Attributes;
using Nethereum.Contracts;
using Nethereum.RPC.Eth.DTOs;

namespace ChainChat.Infrastructure.Indexing;

/// <summary>A decoded on-chain event and how to apply it to the database.</summary>
public sealed record IndexedEvent(FilterLog Log, Func<ChainChatDbContext, CancellationToken, Task> Apply);

/// <summary>
/// Mirrors one contract's events into PostgreSQL (SDD §4.2, §10). Subclasses say which events to read and what
/// they mean; this base class makes it reliable:
/// <list type="bullet">
/// <item>Resumable — the last processed block is stored per contract in <see cref="ChainSyncState"/>.</item>
/// <item>Idempotent — each event is identified by tx hash + log index and applied once.</item>
/// <item>Reorg-safe — only blocks <c>Confirmations</c> behind the head are read.</item>
/// <item>Atomic — a batch of events and the new progress marker are saved in one transaction.</item>
/// </list>
/// The tables are a cache: clients still read keys and roots from the chain itself.
/// </summary>
public abstract class ContractEventIndexer(
    IServiceScopeFactory scopes,
    ChainClient chain,
    ContractDeployments deployments,
    IOptions<IndexerOptions> options,
    TimeProvider time,
    ILogger logger) : BackgroundService
{
    /// <summary>Name in shared/deployments, also used as the progress key.</summary>
    protected abstract string ContractName { get; }

    /// <summary>Decoded events of this contract in the block range, in any order.</summary>
    protected abstract Task<IEnumerable<IndexedEvent>> FetchEventsAsync(string contract, BlockParameter from, BlockParameter to, CancellationToken ct);

    protected TimeProvider Time => time;
    protected ILogger Logger => logger;

    /// <summary>Reads all events of type <typeparamref name="T"/> emitted by <paramref name="contract"/> in the range.</summary>
    protected Task<List<EventLog<T>>> GetEventsAsync<T>(string contract, BlockParameter from, BlockParameter to, CancellationToken ct)
        where T : IEventDTO, new() =>
        chain.ExecuteAsync(web3 =>
        {
            var e = web3.Eth.GetEvent<T>(contract);
            return e.GetAllChangesAsync(e.CreateFilterInput(from, to));
        }, ct);

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var settings = options.Value;
        if (!settings.Enabled) return;

        if (!deployments.TryGet(ContractName, out var contract))
        {
            logger.LogWarning("{Contract} is not deployed; its indexer is idle", ContractName);
            return;
        }

        logger.LogInformation("Indexing {Contract} {Address} from block {Block}", ContractName, contract.Address, contract.DeployBlock);
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await IndexAvailableBlocksAsync(contract, settings, ct);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                logger.LogWarning(ex, "{Contract} indexing failed; retrying in {Seconds}s", ContractName, settings.PollIntervalSeconds);
            }

            await Task.Delay(TimeSpan.FromSeconds(settings.PollIntervalSeconds), time, ct);
        }
    }

    private async Task IndexAvailableBlocksAsync(ContractDeployment contract, IndexerOptions settings, CancellationToken ct)
    {
        var head = await chain.GetBlockNumberAsync(ct);
        var safeBlock = head - settings.Confirmations;

        while (!ct.IsCancellationRequested)
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ChainChatDbContext>();

            var state = await db.ChainSyncStates.FindAsync([ContractName], ct);
            if (state is null)
            {
                state = new ChainSyncState { ContractName = ContractName, LastProcessedBlock = Math.Max(contract.DeployBlock - 1, -1) };
                db.ChainSyncStates.Add(state);
            }
            else if (state.LastProcessedBlock > head)
            {
                // The chain is behind our progress marker: a local Anvil was reset. Start over from the deployment.
                logger.LogWarning("Chain head {Head} is behind indexed block {Indexed} for {Contract}; re-indexing from the deployment",
                    head, state.LastProcessedBlock, ContractName);
                state.LastProcessedBlock = Math.Max(contract.DeployBlock - 1, -1);
            }

            var from = state.LastProcessedBlock + 1;
            if (from > safeBlock) return;
            var to = Math.Min(safeBlock, from + settings.BatchSize - 1);

            var events = await FetchEventsAsync(contract.Address, new BlockParameter((ulong)from), new BlockParameter((ulong)to), ct);

            // Apply in chain order, so e.g. a registration always comes before a key update of the same user.
            var applied = 0;
            foreach (var (log, apply) in events.OrderBy(e => e.Log.BlockNumber.Value).ThenBy(e => e.Log.LogIndex.Value))
            {
                var txHash = log.TransactionHash.ToLowerInvariant();
                var logIndex = (int)log.LogIndex.Value;
                if (await db.ProcessedChainEvents.FindAsync([txHash, logIndex], ct) is not null) continue;

                await apply(db, ct);
                db.ProcessedChainEvents.Add(new ProcessedChainEvent
                {
                    TxHash = txHash,
                    LogIndex = logIndex,
                    BlockNumber = (long)log.BlockNumber.Value,
                    BlockHash = log.BlockHash.ToLowerInvariant(),
                    ProcessedAt = time.GetUtcNow(),
                });
                applied++;
            }

            state.LastProcessedBlock = to;
            state.UpdatedAt = time.GetUtcNow();
            await db.SaveChangesAsync(ct);

            if (applied > 0) logger.LogInformation("Indexed {Count} {Contract} event(s) in blocks {From}–{To}", applied, ContractName, from, to);
        }
    }
}
