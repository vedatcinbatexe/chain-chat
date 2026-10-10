using System.Collections.Concurrent;

namespace ChainChat.Core.Messaging;

/// <summary>
/// Allows each key (e.g. a wallet address) at most <c>limit</c> actions within any <c>window</c>. In memory,
/// because the MVP runs a single API instance (SDD §3.2).
/// </summary>
public sealed class SlidingWindowLimiter(int limit, TimeSpan window, TimeProvider time)
{
    private readonly ConcurrentDictionary<string, Queue<DateTimeOffset>> _recent = new();

    /// <returns>False if the key has used up its allowance; the attempt is then not counted.</returns>
    public bool TryAcquire(string key)
    {
        var now = time.GetUtcNow();
        var hits = _recent.GetOrAdd(key, _ => new Queue<DateTimeOffset>());
        lock (hits)
        {
            while (hits.Count > 0 && now - hits.Peek() >= window) hits.Dequeue();
            if (hits.Count >= limit) return false;
            hits.Enqueue(now);
            return true;
        }
    }
}
