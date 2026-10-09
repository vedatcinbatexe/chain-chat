using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Chain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nethereum.RPC.Eth.DTOs;

namespace ChainChat.Infrastructure.Indexing;

/// <summary>Mirrors the Registry contract's users into the <c>users</c> table so they can be searched.</summary>
public sealed class RegistryIndexer(
    IServiceScopeFactory scopes,
    ChainClient chain,
    ContractDeployments deployments,
    IOptions<IndexerOptions> options,
    TimeProvider time,
    ILogger<RegistryIndexer> logger) : ContractEventIndexer(scopes, chain, deployments, options, time, logger)
{
    protected override string ContractName => ContractDeployments.Registry;

    protected override async Task<IEnumerable<IndexedEvent>> FetchEventsAsync(string contract, BlockParameter from, BlockParameter to, CancellationToken ct)
    {
        var registered = await GetEventsAsync<UserRegisteredEvent>(contract, from, to, ct);
        var keyUpdates = await GetEventsAsync<KeyUpdatedEvent>(contract, from, to, ct);

        return registered.Select(e => new IndexedEvent(e.Log, (db, token) => OnRegisteredAsync(db, e.Event, e.Log, token)))
            .Concat(keyUpdates.Select(e => new IndexedEvent(e.Log, (db, token) => OnKeyUpdatedAsync(db, e.Event, token))));
    }

    private async Task OnRegisteredAsync(ChainChatDbContext db, UserRegisteredEvent e, FilterLog log, CancellationToken ct)
    {
        var address = EthAddress.Normalize(e.User);
        var now = Time.GetUtcNow();
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
            Logger.LogWarning("KeyUpdated for unknown user {Address}", e.User);
            return;
        }

        user.EncryptionPublicKey = Hex.FromBytes(e.EncryptionKey);
        user.UpdatedAt = Time.GetUtcNow();
    }
}
