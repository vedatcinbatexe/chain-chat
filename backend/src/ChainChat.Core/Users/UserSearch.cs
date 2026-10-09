using System.Text.RegularExpressions;
using ChainChat.Core.Crypto;

namespace ChainChat.Core.Users;

/// <summary>What a search query means: an exact wallet address, or a username prefix.</summary>
public abstract record UserSearchQuery
{
    public sealed record ByAddress(string Address) : UserSearchQuery;

    /// <param name="LikePattern">SQL LIKE pattern with '\' as the escape character.</param>
    public sealed record ByUsernamePrefix(string Prefix, string LikePattern) : UserSearchQuery;
}

public static partial class UserSearch
{
    public const int MaxQueryLength = 42;

    [GeneratedRegex("^[a-z0-9_]{1,20}$")]
    private static partial Regex UsernamePrefix();

    /// <summary>Parses a search box value; returns null for input that can never match a user.</summary>
    public static UserSearchQuery? Parse(string? query)
    {
        var q = query?.Trim().TrimStart('@').ToLowerInvariant() ?? "";
        if (q.Length == 0 || q.Length > MaxQueryLength) return null;

        if (EthAddress.IsValid(q)) return new UserSearchQuery.ByAddress(EthAddress.Normalize(q));
        if (!UsernamePrefix().IsMatch(q)) return null;

        // '_' is a LIKE wildcard ("any character"); escape it so "ved_" matches only a literal underscore.
        return new UserSearchQuery.ByUsernamePrefix(q, q.Replace("_", "\\_") + "%");
    }
}
