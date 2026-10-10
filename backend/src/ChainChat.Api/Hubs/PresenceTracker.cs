using System.Collections.Concurrent;

namespace ChainChat.Api.Hubs;

/// <summary>
/// Who is online right now: a wallet is online while it has at least one open hub connection (several devices
/// count once). In memory, because the MVP runs a single API instance (SDD §3.2).
/// </summary>
public sealed class PresenceTracker
{
    private readonly ConcurrentDictionary<string, int> _connections = new();

    /// <returns>True if this connection made the user go from offline to online.</returns>
    public bool Connected(string address) => _connections.AddOrUpdate(address, 1, (_, count) => count + 1) == 1;

    /// <returns>True if this disconnection made the user go offline.</returns>
    public bool Disconnected(string address)
    {
        while (_connections.TryGetValue(address, out var count))
        {
            if (count <= 1)
            {
                if (_connections.TryRemove(new KeyValuePair<string, int>(address, count))) return true;
            }
            else if (_connections.TryUpdate(address, count - 1, count))
            {
                return false;
            }
        }
        return false;
    }

    public bool IsOnline(string address) => _connections.ContainsKey(address);

    public int OnlineCount => _connections.Count;
}
