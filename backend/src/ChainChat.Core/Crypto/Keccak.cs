using Nethereum.Util;

namespace ChainChat.Core.Crypto;

/// <summary>Ethereum's Keccak-256 (not NIST SHA3-256).</summary>
public static class Keccak
{
    public static byte[] Hash(ReadOnlySpan<byte> data) => Sha3Keccack.Current.CalculateHash(data.ToArray());

    public static byte[] Hash(params byte[][] parts)
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
