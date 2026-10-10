using System.Security.Cryptography;
using ChainChat.Api.Auth;
using ChainChat.Api.Common;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ChainChat.Api.Endpoints;

/// <summary>
/// Storage for encrypted message attachments — voice messages and images (SDD §6.8). The app encrypts the audio on the phone
/// and uploads only ciphertext; the key and the fingerprint (hash) of that ciphertext travel inside the signed,
/// end-to-end encrypted chat message. The server therefore cannot listen to a recording, and if it changed or
/// swapped the stored bytes the receiving app would notice, because the fingerprint would no longer match.
/// </summary>
public static class AttachmentEndpoints
{
    /// <summary>A voice message is a few hundred kilobytes, a resized photo less; this leaves room for GIFs and still bounds storage.</summary>
    public const int MaxBytes = 8 * 1024 * 1024;

    public sealed record UploadedAttachment(string Id, int Size);

    public static void MapAttachmentEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/attachments").WithTags("Attachments").RequireAuthorization();

        group.MapPost("/", Upload)
            .RequireRateLimiting(RateLimiting.UploadPolicy)
            .Accepts<byte[]>("application/octet-stream")
            .WithSummary("Stores an encrypted attachment and returns its id");

        group.MapGet("/{id}", Download)
            .WithSummary("The encrypted bytes of an attachment");
    }

    private static async Task<IResult> Upload(HttpContext context, ChainChatDbContext db, TimeProvider time, CancellationToken ct)
    {
        var me = EthAddress.Normalize(context.User.WalletAddress());
        if (await db.BannedUsers.AnyAsync(b => b.Address == me, ct)) return Problem(StatusCodes.Status403Forbidden, "Banned");
        if (context.Request.ContentLength > MaxBytes) return Problem(StatusCodes.Status413PayloadTooLarge, "AttachmentTooLarge");

        // Read at most MaxBytes + 1, so an oversized body without a Content-Length header is refused as well.
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await context.Request.Body.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + read > MaxBytes) return Problem(StatusCodes.Status413PayloadTooLarge, "AttachmentTooLarge");
            buffer.Write(chunk, 0, read);
        }
        if (buffer.Length == 0) return Problem(StatusCodes.Status400BadRequest, "AttachmentEmpty");

        var attachment = new Attachment
        {
            Id = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16)),
            Uploader = me,
            Size = (int)buffer.Length,
            Content = buffer.ToArray(),
            CreatedAt = time.GetUtcNow(),
        };
        db.Attachments.Add(attachment);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new UploadedAttachment(attachment.Id, attachment.Size));
    }

    private static async Task<IResult> Download(string id, ChainChatDbContext db, CancellationToken ct)
    {
        // Any signed-in wallet that knows the id may fetch the ciphertext: the id is unguessable, and without the
        // key from the chat message the bytes are useless.
        var content = id.Length == 32 ? await db.Attachments.AsNoTracking().Where(a => a.Id == id).Select(a => a.Content).FirstOrDefaultAsync(ct) : null;
        return content is null ? Problem(StatusCodes.Status404NotFound, "AttachmentNotFound") : Results.Bytes(content, "application/octet-stream");
    }

    private static IResult Problem(int status, string code) => Results.Problem(statusCode: status, title: "Attachment request failed", detail: code);
}
