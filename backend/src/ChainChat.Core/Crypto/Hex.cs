namespace ChainChat.Core.Crypto;

/// <summary>Converts between byte arrays and 0x-prefixed lowercase hex strings.</summary>
public static class Hex
{
    public static byte[] ToBytes(string hex)
    {
        ArgumentNullException.ThrowIfNull(hex);
        var digits = hex.StartsWith("0x", StringComparison.OrdinalIgnoreCase) ? hex[2..] : hex;
        if (digits.Length % 2 != 0) throw new FormatException($"Hex string has an odd number of digits: {hex}");
        return Convert.FromHexString(digits);
    }

    public static string FromBytes(ReadOnlySpan<byte> bytes) => "0x" + Convert.ToHexStringLower(bytes);
}
