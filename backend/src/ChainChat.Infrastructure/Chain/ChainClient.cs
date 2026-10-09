using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nethereum.JsonRpc.Client;
using Nethereum.Web3;

namespace ChainChat.Infrastructure.Chain;

/// <summary>
/// Read access to the blockchain with retries and RPC failover (SDD §10):
/// each endpoint is retried with exponential backoff, then the next endpoint is tried.
/// </summary>
public sealed class ChainClient
{
    private readonly IReadOnlyList<(string Url, IWeb3 Web3)> _endpoints;
    private readonly ChainOptions _options;
    private readonly ILogger<ChainClient> _logger;

    public ChainClient(IOptions<ChainOptions> options, ILogger<ChainClient> logger)
    {
        _options = options.Value;
        _logger = logger;
        // Nethereum's request timeout is process-wide.
        ClientBase.ConnectionTimeout = TimeSpan.FromSeconds(_options.RequestTimeoutSeconds);
        _endpoints = _options.RpcUrls.Select(url => (url, (IWeb3)new Web3(url))).ToList();

        if (_endpoints.Count == 0) throw new InvalidOperationException("Chain:RpcUrls must contain at least one RPC endpoint");
    }

    public async Task<long> GetBlockNumberAsync(CancellationToken ct = default) =>
        (long)(await ExecuteAsync(web3 => web3.Eth.Blocks.GetBlockNumber.SendRequestAsync(), ct)).Value;

    public async Task<long> GetChainIdAsync(CancellationToken ct = default) =>
        (long)(await ExecuteAsync(web3 => web3.Eth.ChainId.SendRequestAsync(), ct)).Value;

    /// <summary>Runs an RPC operation against the primary endpoint, falling back to the others on failure.</summary>
    public async Task<T> ExecuteAsync<T>(Func<IWeb3, Task<T>> operation, CancellationToken ct = default)
    {
        Exception? lastError = null;

        foreach (var (url, web3) in _endpoints)
        {
            for (var attempt = 0; attempt <= _options.MaxRetriesPerEndpoint; attempt++)
            {
                ct.ThrowIfCancellationRequested();
                try
                {
                    return await operation(web3);
                }
                catch (Exception ex) when (ex is RpcClientUnknownException or RpcClientTimeoutException or HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
                {
                    lastError = ex;
                    _logger.LogWarning("RPC call to {Url} failed (attempt {Attempt}): {Error}", url, attempt + 1, ex.Message);
                    if (attempt < _options.MaxRetriesPerEndpoint)
                    {
                        await Task.Delay(TimeSpan.FromMilliseconds(200 * Math.Pow(2, attempt)), ct);
                    }
                }
            }
        }

        throw new InvalidOperationException("All RPC endpoints failed", lastError);
    }
}
