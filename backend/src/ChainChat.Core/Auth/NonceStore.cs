using System.Collections.Concurrent;
using System.Security.Cryptography;
using ChainChat.Core.Crypto;

namespace ChainChat.Core.Auth;

/// <summary>
/// Single-use login nonces (SDD §6.2): issued for one address, valid for a few minutes, consumed atomically.
/// In memory, because the MVP runs a single API instance (SDD §3.2).
/// </summary>
public sealed class NonceStore(TimeSpan lifetime, TimeProvider time)
{
    private const string Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    private const int NonceLength = 16; // 62^16 ≈ 2^95 possibilities

    private readonly ConcurrentDictionary<string, (string Address, DateTimeOffset ExpiresAt)> _nonces = new();

    public (string Nonce, DateTimeOffset ExpiresAt) Issue(string address)
    {
        RemoveExpired();

        var nonce = RandomNumberGenerator.GetString(Alphabet, NonceLength);
        var expiresAt = time.GetUtcNow() + lifetime;
        _nonces[nonce] = (EthAddress.Normalize(address), expiresAt);
        return (nonce, expiresAt);
    }

    /// <summary>
    /// True if the nonce exists, has not expired and was issued for <paramref name="address"/>.
    /// The nonce is removed either way, so it can never be used twice (replay protection).
    /// </summary>
    public bool TryConsume(string nonce, string address) =>
        _nonces.TryRemove(nonce, out var entry) &&
        entry.ExpiresAt > time.GetUtcNow() &&
        entry.Address == EthAddress.Normalize(address);

    private void RemoveExpired()
    {
        var now = time.GetUtcNow();
        foreach (var (nonce, entry) in _nonces)
        {
            if (entry.ExpiresAt <= now) _nonces.TryRemove(nonce, out _);
        }
    }
}
