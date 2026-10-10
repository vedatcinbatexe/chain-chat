using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ChainChat.Infrastructure.Admin;

/// <summary>Who may use the admin dashboard, and the audit log of what admins did there.</summary>
public sealed class AdminService(ChainChatDbContext db, IOptions<AdminOptions> options, TimeProvider time)
{
    /// <summary>Root admins come from configuration; they can add and remove the other admins.</summary>
    public bool IsRoot(string address) => options.Value.Addresses.Any(a => EthAddress.IsValid(a) && EthAddress.AreEqual(a, address));

    public async Task<bool> IsAdminAsync(string address, CancellationToken ct = default)
    {
        if (!EthAddress.IsValid(address)) return false;
        var normalized = EthAddress.Normalize(address);
        return IsRoot(normalized) || await db.Admins.AnyAsync(a => a.Address == normalized, ct);
    }

    /// <summary>Adds an audit entry to the current unit of work; it is saved with the caller's SaveChanges.</summary>
    public void Audit(string admin, string action, string? target = null, string? details = null) =>
        db.AdminAuditEntries.Add(new AdminAuditEntry
        {
            Admin = EthAddress.Normalize(admin),
            Action = action,
            Target = target,
            Details = details is { Length: > 500 } ? details[..500] : details,
            CreatedAt = time.GetUtcNow(),
        });
}
