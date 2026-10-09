using System.Buffers.Binary;

namespace ChainChat.Core.Crypto;

/// <summary>
/// The subset of Solidity's <c>abi.encode</c> ChainChat needs: static types only,
/// each left-padded to one 32-byte word, big-endian (SPEC.md §1).
/// </summary>
public static class Abi
{
    public const int WordSize = 32;

    public static byte[] Bytes32(ReadOnlySpan<byte> value)
    {
        if (value.Length != WordSize) throw new ArgumentException("bytes32 values must be exactly 32 bytes", nameof(value));
        return value.ToArray();
    }

    public static byte[] Address(string address) => LeftPad(EthAddress.ToBytes(address));

    public static byte[] UInt64(ulong value)
    {
        var word = new byte[WordSize];
        BinaryPrimitives.WriteUInt64BigEndian(word.AsSpan(WordSize - sizeof(ulong)), value);
        return word;
    }

    public static byte[] UInt256(System.Numerics.BigInteger value)
    {
        if (value.Sign < 0) throw new ArgumentOutOfRangeException(nameof(value), "uint256 cannot be negative");
        var bytes = value.ToByteArray(isUnsigned: true, isBigEndian: true);
        if (bytes.Length > WordSize) throw new ArgumentOutOfRangeException(nameof(value), "Value does not fit in 256 bits");
        return LeftPad(bytes);
    }

    /// <summary>Concatenates already-encoded 32-byte words.</summary>
    public static byte[] Encode(params byte[][] words)
    {
        if (words.Any(word => word.Length != WordSize)) throw new ArgumentException("Every encoded value must be one 32-byte word");
        return words.SelectMany(word => word).ToArray();
    }

    private static byte[] LeftPad(ReadOnlySpan<byte> value)
    {
        var word = new byte[WordSize];
        value.CopyTo(word.AsSpan(WordSize - value.Length));
        return word;
    }
}
