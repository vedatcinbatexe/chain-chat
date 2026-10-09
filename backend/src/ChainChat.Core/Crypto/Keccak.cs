using Nethereum.Util;

namespace ChainChat.Core.Crypto;

/// <summary>Ethereum's Keccak-256 (not NIST SHA3-256).</summary>
/// <remarks>
/// The two operations have different names on purpose: an overload pair Hash(ReadOnlySpan&lt;byte&gt;) /
/// Hash(params byte[][]) let the compiler pick the params overload for a single byte[] and recurse forever.
/// </remarks>
public static class Keccak
{
    /// <summary>keccak256(data)</summary>
    public static byte[] Hash(byte[] data) => Sha3Keccack.Current.CalculateHash(data);

    /// <summary>keccak256(part₀ ‖ part₁ ‖ …)</summary>
    public static byte[] HashConcat(params byte[][] parts)
    {
        var buffer = new byte[parts.Sum(part => part.Length)];
        var offset = 0;
        foreach (var part in parts)
        {
            part.CopyTo(buffer, offset);
            offset += part.Length;
        }
        return Hash(buffer);
    }
}
