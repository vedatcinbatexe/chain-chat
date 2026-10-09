using ChainChat.Api.Auth;
using ChainChat.Api.Common;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Anchoring;
using ChainChat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace ChainChat.Api.Endpoints;

/// <summary>Merkle proofs for anchored messages (SDD §6.6). Apps check them against the root read from the chain.</summary>
public static class AnchoringEndpoints
{
    public sealed record AnchoredBatch(long ChainBatchId, string Root, long FromMessageId, long ToMessageId, string TxHash, long BlockNumber);

    /// <param name="Status">NotAnchored (waiting for the next batch) · Pending (batch sent, not confirmed) · Anchored.</param>
    public sealed record MessageProofResponse(
        long MessageId,
        string Status,
        string MessageHash,
        int? LeafIndex,
        string[]? Proof,
        AnchoredBatch? Batch,
        int AnchorIntervalSeconds);

    public static void MapAnchoringEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/messages/{id:long}/proof", GetProof)
            .RequireAuthorization()
            .WithTags("Anchoring")
            .WithSummary("Merkle proof that a message is included in an on-chain anchor batch");

        app.MapPost("/api/v1/anchoring/run", (AnchoringJob job) =>
            {
                job.RequestRun();
                return TypedResults.Accepted((string?)null, new { requested = true });
            })
            .RequireAuthorization()
            .RequireRateLimiting(RateLimiting.AnchorPolicy)
            .WithTags("Anchoring")
            .WithSummary("Anchor pending messages now instead of at the next interval (demo helper)");
    }

    private static async Task<Results<Ok<MessageProofResponse>, NotFound>> GetProof(
        long id, HttpContext context, ChainChatDbContext db, AnchoringJob job, CancellationToken ct)
    {
        var me = EthAddress.Normalize(context.User.WalletAddress());

        var message = await db.Messages.AsNoTracking()
            .Where(m => m.Id == id && db.Participants.Any(p => p.ConversationId == m.ConversationId && p.Address == me))
            .Select(m => new { m.Id, m.MessageHash, m.LeafIndex, m.MerkleProof, m.AnchorBatchId })
            .FirstOrDefaultAsync(ct);
        if (message is null) return TypedResults.NotFound(); // also when not a participant, so ids cannot be probed

        var batch = message.AnchorBatchId is null ? null : await db.AnchorBatches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == message.AnchorBatchId, ct);

        var response = batch switch
        {
            null => new MessageProofResponse(message.Id, "NotAnchored", message.MessageHash, null, null, null, job.IntervalSeconds),
            { Status: AnchorBatchStatus.Confirmed, ChainBatchId: not null, TxHash: not null, BlockNumber: not null } => new MessageProofResponse(
                message.Id, "Anchored", message.MessageHash, message.LeafIndex, message.MerkleProof,
                new AnchoredBatch(batch.ChainBatchId.Value, batch.Root, batch.FromMessageId, batch.ToMessageId, batch.TxHash, batch.BlockNumber.Value),
                job.IntervalSeconds),
            _ => new MessageProofResponse(message.Id, "Pending", message.MessageHash, null, null, null, job.IntervalSeconds),
        };

        return TypedResults.Ok(response);
    }
}
