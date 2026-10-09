using System.Globalization;
using System.Text.RegularExpressions;
using ChainChat.Core.Crypto;

namespace ChainChat.Core.Auth;

/// <summary>
/// A Sign-In with Ethereum (EIP-4361) message in ChainChat's strict subset (SPEC.md §7):
/// statement and expiration time are required; Not Before, Request ID and Resources are not supported.
/// </summary>
public sealed partial record SiweMessage(
    string Domain,
    string Address,
    string Statement,
    string Uri,
    long ChainId,
    string Nonce,
    DateTimeOffset IssuedAt,
    DateTimeOffset ExpirationTime)
{
    private const string Header = " wants you to sign in with your Ethereum account:";

    [GeneratedRegex("^[a-zA-Z0-9]{8,}$")]
    private static partial Regex NoncePattern();

    /// <summary>
    /// Parses the exact text that was signed. Throws <see cref="FormatException"/> if it does not follow the
    /// format line by line — the signature only proves anything if every field is unambiguous.
    /// </summary>
    public static SiweMessage Parse(string text)
    {
        ArgumentNullException.ThrowIfNull(text);
        var lines = text.Split('\n');
        if (lines.Length != 11) throw new FormatException($"Expected 11 lines, got {lines.Length}");

        if (!lines[0].EndsWith(Header, StringComparison.Ordinal)) throw new FormatException("Missing EIP-4361 header line");
        var domain = lines[0][..^Header.Length];
        if (domain.Length == 0 || domain.Any(char.IsWhiteSpace)) throw new FormatException("Invalid domain");

        var address = lines[1];
        if (!EthAddress.IsValid(address) || EthAddress.ToChecksum(address) != address)
        {
            throw new FormatException("Address must be EIP-55 checksummed");
        }

        if (lines[2].Length != 0 || lines[4].Length != 0) throw new FormatException("Statement must be surrounded by blank lines");
        var statement = lines[3];
        if (statement.Length == 0) throw new FormatException("Statement is required");

        var uri = Field(lines[5], "URI");
        if (!System.Uri.TryCreate(uri, UriKind.Absolute, out _)) throw new FormatException("URI must be absolute");

        if (Field(lines[6], "Version") != "1") throw new FormatException("Only version 1 is supported");

        if (!long.TryParse(Field(lines[7], "Chain ID"), NumberStyles.None, CultureInfo.InvariantCulture, out var chainId) || chainId <= 0)
        {
            throw new FormatException("Invalid chain id");
        }

        var nonce = Field(lines[8], "Nonce");
        if (!NoncePattern().IsMatch(nonce)) throw new FormatException("Nonce must be at least 8 alphanumeric characters");

        return new SiweMessage(domain, address, statement, uri, chainId, nonce,
            Timestamp(Field(lines[9], "Issued At")), Timestamp(Field(lines[10], "Expiration Time")));
    }

    private static string Field(string line, string name)
    {
        var prefix = $"{name}: ";
        if (!line.StartsWith(prefix, StringComparison.Ordinal)) throw new FormatException($"Expected '{prefix}…'");
        return line[prefix.Length..];
    }

    private static DateTimeOffset Timestamp(string value) =>
        DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var timestamp) && value.Contains('T')
            ? timestamp
            : throw new FormatException($"Not an RFC 3339 timestamp: {value}");
}
