using System.ComponentModel.DataAnnotations;

namespace ChainChat.Infrastructure.Indexing;

/// <summary>Chain indexer settings (configuration section "Indexer", SDD §10).</summary>
public sealed class IndexerOptions
{
    public const string SectionName = "Indexer";

    public bool Enabled { get; set; } = true;

    [Range(1, 300)]
    public int PollIntervalSeconds { get; set; } = 2;

    /// <summary>Blocks to wait before an event is treated as final; protects against short reorgs.</summary>
    [Range(0, 100)]
    public int Confirmations { get; set; } = 2;

    /// <summary>Maximum block range per eth_getLogs request (RPC providers limit this).</summary>
    [Range(1, 100_000)]
    public int BatchSize { get; set; } = 2_000;
}
