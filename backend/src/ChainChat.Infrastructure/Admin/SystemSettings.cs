using System.Globalization;
using ChainChat.Core.Crypto;
using ChainChat.Core.Domain;
using ChainChat.Infrastructure.Messaging;
using ChainChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ChainChat.Infrastructure.Admin;

/// <summary>The current values of the settings admins can change at runtime.</summary>
public sealed record SettingsSnapshot(bool MessagingPaused, bool GroupCreationEnabled, int GroupMaxMembers, bool GasDripEnabled);

/// <summary>
/// Runtime settings changed from the admin dashboard, stored in the database and cached in memory (the MVP runs a
/// single API instance, SDD §3.2). Keys that were never changed use their defaults.
/// </summary>
public sealed class SystemSettings(IServiceScopeFactory scopes, TimeProvider time)
{
    public const string MessagingPaused = "messaging.paused";
    public const string GroupCreationEnabled = "groups.creationEnabled";
    public const string GroupMaxMembers = "groups.maxMembers";
    public const string GasDripEnabled = "gasDrip.enabled";

    public static readonly IReadOnlyList<string> Keys = [MessagingPaused, GroupCreationEnabled, GroupMaxMembers, GasDripEnabled];

    private volatile SettingsSnapshot? _cache;

    public async ValueTask<SettingsSnapshot> GetAsync(CancellationToken ct = default)
    {
        if (_cache is { } cached) return cached;

        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ChainChatDbContext>();
        var rows = await db.SystemSettings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value, ct);

        return _cache = new SettingsSnapshot(
            MessagingPaused: Bool(rows, MessagingPaused, false),
            GroupCreationEnabled: Bool(rows, GroupCreationEnabled, true),
            GroupMaxMembers: rows.TryGetValue(GroupMaxMembers, out var max) && int.TryParse(max, CultureInfo.InvariantCulture, out var n) ? n : GroupService.MaxMembers,
            GasDripEnabled: Bool(rows, GasDripEnabled, true));
    }

    /// <summary>Null if the value is acceptable for the key, otherwise why not.</summary>
    public static string? Validate(string key, string value) => key switch
    {
        MessagingPaused or GroupCreationEnabled or GasDripEnabled => value is "true" or "false" ? null : "Must be true or false.",
        GroupMaxMembers => int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var n) && n is >= 2 and <= GroupService.MaxMembers
            ? null
            : $"Must be a number from 2 to {GroupService.MaxMembers}.",
        _ => "Unknown setting.",
    };

    /// <summary>Stores already validated values and refreshes the cache.</summary>
    public async Task<SettingsSnapshot> UpdateAsync(IReadOnlyDictionary<string, string> changes, string admin, CancellationToken ct)
    {
        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ChainChatDbContext>();
            var now = time.GetUtcNow();
            foreach (var (key, value) in changes)
            {
                var row = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == key, ct);
                if (row is null) db.SystemSettings.Add(new SystemSetting { Key = key, Value = value, UpdatedBy = EthAddress.Normalize(admin), UpdatedAt = now });
                else (row.Value, row.UpdatedBy, row.UpdatedAt) = (value, EthAddress.Normalize(admin), now);
            }
            await db.SaveChangesAsync(ct);
        }

        _cache = null;
        return await GetAsync(ct);
    }

    private static bool Bool(Dictionary<string, string> rows, string key, bool fallback) => rows.TryGetValue(key, out var value) ? value == "true" : fallback;
}
