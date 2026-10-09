using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Chain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nethereum.Contracts;
using Nethereum.RPC.Eth.DTOs;

namespace ChainChat.Infrastructure.Indexing;

/// <summary>
/// Mirrors the Registry contract's users into PostgreSQL so they can be searched (SDD §4.2, §10).
/// The table is a cache: clients still read encryption keys from the chain itself.
/// <list type="bullet">
/// <item>Resumable — the last processed block is stored in <see cref="ChainSyncState"/>.</item>
/// <item>Idempotent — each event is identified by tx hash + log index and applied once.</item>
/// <item>Reorg-safe — only blocks <c>Confirmations</c> behind the head are read.</item>
/// <item>Atomic — a batch of events and the new progress marker are saved in one transaction.</item>
/// </list>
/// </summary>
public sealed class RegistryIndexer(
    IServiceScopeFactory scopes,
    ChainClient chain,
    ContractDeployments deployments,
    IOptions<IndexerOptions> options,
    TimeProvider time,
    ILogger<RegistryIndexer> logger) : BackgroundService
{
    private const string SyncKey = ContractDeployments.Registry;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var settings = options.Value;
        if (!settings.Enabled) return;

        if (!deployments.TryGet(ContractDeployments.Registry, out var registry))
        {
            logger.LogWarning("Registry is not deployed; the user indexer is idle");
            return;
        }

        logger.LogInformation("Indexing Registry {Address} from block {Block}", registry.Address, registry.DeployBlock);
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await IndexAvailableBlocksAsync(registry, settings, ct);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                logger.LogWarning(ex, "Registry indexing failed; retrying in {Seconds}s", settings.PollIntervalSeconds);
            }

            await Task.Delay(TimeSpan.FromSeconds(settings.PollIntervalSeconds), time, ct);
        }
    }

    private async Task IndexAvailableBlocksAsync(ContractDeployment registry, IndexerOptions settings, CancellationToken ct)
    {
        var safeBlock = await chain.GetBlockNumberAsync(ct) - settings.Confirmations;

        while (!ct.IsCancellationRequested)
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ChainChatDbContext>();

            var state = await db.ChainSyncStates.FindAsync([SyncKey], ct);
            if (state is null)
            {
                state = new ChainSyncState { ContractName = SyncKey, LastProcessedBlock = Math.Max(registry.DeployBlock - 1, -1) };
                db.ChainSyncStates.Add(state);
            }
            else if (state.LastProcessedBlock > safeBlock + settings.Confirmations)
            {
                // The chain is behind our progress marker: a local Anvil was reset. Start over from the deployment.
                logger.LogWarning("Chain head {Head} is behind indexed block {Indexed}; re-indexing from the deployment",
                    safeBlock + settings.Confirmations, state.LastProcessedBlock);
                state.LastProcessedBlock = Math.Max(registry.DeployBlock - 1, -1);
            }

            var from = state.LastProcessedBlock + 1;
            if (from > safeBlock) return;
            var to = Math.Min(safeBlock, from + settings.BatchSize - 1);

            var applied = await ApplyEventsAsync(db, registry.Address, from, to, ct);
            state.LastProcessedBlock = to;
            state.UpdatedAt = time.GetUtcNow();
            await db.SaveChangesAsync(ct);

            if (applied > 0) logger.LogInformation("Indexed {Count} Registry event(s) in blocks {From}–{To}", applied, from, to);
        }
    }

    private async Task<int> ApplyEventsAsync(ChainChatDbContext db, string contract, long from, long to, CancellationToken ct)
    {
        var range = (From: new BlockParameter((ulong)from), To: new BlockParameter((ulong)to));

        var registered = await chain.ExecuteAsync(web3 =>
        {
            var e = web3.Eth.GetEvent<UserRegisteredEvent>(contract);
            return e.GetAllChangesAsync(e.CreateFilterInput(range.From, range.To));
        }, ct);
        var keyUpdates = await chain.ExecuteAsync(web3 =>
        {
            var e = web3.Eth.GetEvent<KeyUpdatedEvent>(contract);
            return e.GetAllChangesAsync(e.CreateFilterInput(range.From, range.To));
        }, ct);

        // Apply in chain order, so a registration always comes before a key update of the same user.
        var events = registered.Select(e => (e.Log, Apply: (Func<Task>)(() => OnRegisteredAsync(db, e.Event, e.Log, ct))))
            .Concat(keyUpdates.Select(e => (e.Log, Apply: (Func<Task>)(() => OnKeyUpdatedAsync(db, e.Event, ct)))))
            .OrderBy(e => e.Log.BlockNumber.Value)
            .ThenBy(e => e.Log.LogIndex.Value);

        var applied = 0;
        foreach (var (log, apply) in events)
        {
            var txHash = log.TransactionHash.ToLowerInvariant();
            var logIndex = (int)log.LogIndex.Value;
            if (await db.ProcessedChainEvents.FindAsync([txHash, logIndex], ct) is not null) continue;

            await apply();
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

        return applied;
    }

    private async Task OnRegisteredAsync(ChainChatDbContext db, UserRegisteredEvent e, FilterLog log, CancellationToken ct)
    {
        var address = EthAddress.Normalize(e.User);
        var now = time.GetUtcNow();
        var user = await db.Users.FindAsync([address], ct);
        if (user is null)
        {
            user = new User
            {
                Address = address,
                Username = e.Username,
                EncryptionPublicKey = Hex.FromBytes(e.EncryptionKey),
                RegistrationTxHash = log.TransactionHash.ToLowerInvariant(),
                CreatedAt = now,
            };
            db.Users.Add(user);
        }

        user.Username = e.Username;
        user.EncryptionPublicKey = Hex.FromBytes(e.EncryptionKey);
        user.RegistrationTxHash = log.TransactionHash.ToLowerInvariant();
        user.RegisteredAtBlock = (long)log.BlockNumber.Value;
        user.UpdatedAt = now;
    }

    private async Task OnKeyUpdatedAsync(ChainChatDbContext db, KeyUpdatedEvent e, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([EthAddress.Normalize(e.User)], ct);
        if (user is null)
        {
            logger.LogWarning("KeyUpdated for unknown user {Address}", e.User);
            return;
        }

        user.EncryptionPublicKey = Hex.FromBytes(e.EncryptionKey);
        user.UpdatedAt = time.GetUtcNow();
    }
}
