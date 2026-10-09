using System.Numerics;
using Nethereum.Util;

namespace ChainChat.Core.Crypto;

/// <summary>Helpers for 20-byte Ethereum addresses. Addresses are compared case-insensitively (SPEC.md §1).</summary>
public static class EthAddress
{
    public const int Length = 20;

    public static bool IsValid(string? address) =>
        address is { Length: 42 } && address.StartsWith("0x", StringComparison.OrdinalIgnoreCase) &&
        address.Skip(2).All(Uri.IsHexDigit);

    public static byte[] ToBytes(string address)
    {
        if (!IsValid(address)) throw new FormatException($"Not a valid address: {address}");
        return Hex.ToBytes(address);
    }

    /// <summary>Lowercase form, used as the canonical value in storage and comparisons.</summary>
    public static string Normalize(string address) => Hex.FromBytes(ToBytes(address));

    /// <summary>EIP-55 mixed-case checksum form, used for display and API responses.</summary>
    public static string ToChecksum(string address) => AddressUtil.Current.ConvertToChecksumAddress(Normalize(address));

    public static bool AreEqual(string a, string b) => Normalize(a) == Normalize(b);

    public static BigInteger ToNumber(string address) => new(ToBytes(address), isUnsigned: true, isBigEndian: true);
}
