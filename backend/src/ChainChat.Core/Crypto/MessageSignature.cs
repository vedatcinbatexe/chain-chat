using System.Numerics;
using System.Text;
using Nethereum.Signer;

namespace ChainChat.Core.Crypto;

public enum SignatureCheckResult
{
    Valid,
    BadLength,
    BadV,
    HighS,
    Unrecoverable,
    WrongSigner,
}

/// <summary>EIP-191 signatures over a messageHash (SPEC.md §5).</summary>
public static class MessageSignature
{
    public const int Length = 65;

    /// <summary>Order of the secp256k1 curve group.</summary>
    public static readonly BigInteger Secp256k1N =
        BigInteger.Parse("0FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141", System.Globalization.NumberStyles.HexNumber);

    private static readonly BigInteger HalfN = Secp256k1N / 2;
    private static readonly byte[] Prefix = Encoding.ASCII.GetBytes("\x19Ethereum Signed Message:\n32");

    /// <summary>digest = keccak256("\x19Ethereum Signed Message:\n32" ‖ messageHash)</summary>
    public static byte[] SigningDigest(byte[] messageHash)
    {
        if (messageHash.Length != 32) throw new ArgumentException("messageHash must be 32 bytes", nameof(messageHash));
        return Keccak.Hash(Prefix, messageHash);
    }

    /// <summary>Verifies that <paramref name="signature"/> over <paramref name="messageHash"/> was produced by <paramref name="sender"/>.</summary>
    public static SignatureCheckResult Verify(string sender, byte[] messageHash, byte[] signature)
    {
        if (signature.Length != Length) return SignatureCheckResult.BadLength;

        var r = signature[..32];
        var s = signature[32..64];
        var v = signature[64];

        if (v is not (27 or 28)) return SignatureCheckResult.BadV;
        if (new BigInteger(s, isUnsigned: true, isBigEndian: true) > HalfN) return SignatureCheckResult.HighS;

        string signer;
        try
        {
            var ecdsa = EthECDSASignatureFactory.FromComponents(r, s, v);
            signer = EthECKey.RecoverFromSignature(ecdsa, SigningDigest(messageHash)).GetPublicAddress();
        }
        catch (Exception)
        {
            return SignatureCheckResult.Unrecoverable;
        }

        return EthAddress.AreEqual(signer, sender) ? SignatureCheckResult.Valid : SignatureCheckResult.WrongSigner;
    }
}
