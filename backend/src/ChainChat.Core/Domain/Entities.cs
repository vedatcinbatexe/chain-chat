using System.Numerics;

namespace ChainChat.Core.Domain;

// Conventions:
// - Addresses are stored lowercase (EthAddress.Normalize); hashes and ids are 0x-prefixed lowercase hex.
// - Rows mirrored from the chain (User, Payment, ...) are a cache: the blockchain stays the source of truth (SDD §4.3).

/// <summary>A registered user, mirrored from the Registry contract's UserRegistered / KeyUpdated events.</summary>
public class User
{
    public required string Address { get; set; }
    public required string Username { get; set; }
    /// <summary>X25519 public key (32 bytes, hex) used for end-to-end encryption.</summary>
    public required string EncryptionPublicKey { get; set; }
    public required string RegistrationTxHash { get; set; }
    public long RegisteredAtBlock { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public enum ConversationType
{
    Direct,
    Group,
}

/// <summary>A 1:1 or group conversation. <see cref="Id"/> is the bytes32 conversation id (SPEC.md §2).</summary>
public class Conversation
{
    public required string Id { get; set; }
    public ConversationType Type { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Group? Group { get; set; }
    public List<Participant> Participants { get; set; } = [];
}

/// <summary>NFT-gated group settings for a group conversation (SDD §6.5).</summary>
public class Group
{
    public required string ConversationId { get; set; }
    public required string Name { get; set; }
    /// <summary>ERC-721 contract whose badge is required to join.</summary>
    public required string RequiredBadgeContract { get; set; }
    public int MaxMembers { get; set; } = 20;
    public required string CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Membership of an address in a conversation. <see cref="RemovedAt"/> is set when a badge is transferred away.</summary>
public class Participant
{
    public required string ConversationId { get; set; }
    public required string Address { get; set; }
    public DateTimeOffset JoinedAt { get; set; }
    public DateTimeOffset? RemovedAt { get; set; }
}

public enum MessageType
{
    Text,
    Payment,
}

/// <summary>A signed, hash-chained, encrypted message (SDD §6.3). The server never sees plaintext.</summary>
public class Message
{
    public long Id { get; set; }
    public required string ConversationId { get; set; }
    public required string Sender { get; set; }
    public ulong Seq { get; set; }
    public required string PrevHash { get; set; }
    public required string MessageHash { get; set; }
    /// <summary>Encrypted payload exactly as sent; for groups, the per-member encrypted bundle.</summary>
    public required byte[] Ciphertext { get; set; }
    /// <summary>65-byte EIP-191 signature over <see cref="MessageHash"/>.</summary>
    public required byte[] Signature { get; set; }
    public ulong ClientTimestamp { get; set; }
    public DateTimeOffset ServerReceivedAt { get; set; }
    public MessageType Type { get; set; }
    public string? PaymentTxHash { get; set; }

    // Anchoring (SDD §6.6) — set once the message is included in a confirmed batch.
    public long? AnchorBatchId { get; set; }
    public int? LeafIndex { get; set; }
    public string[]? MerkleProof { get; set; }
}

public enum PaymentStatus
{
    Pending,
    Confirmed,
    Failed,
}

/// <summary>An in-chat ERC-20 payment. Status comes only from the on-chain receipt (SDD §6.4).</summary>
public class Payment
{
    public required string TxHash { get; set; }
    public required string From { get; set; }
    public required string To { get; set; }
    /// <summary>Token amount in the smallest unit (uint256).</summary>
    public BigInteger Amount { get; set; }
    public PaymentStatus Status { get; set; }
    public long? BlockNumber { get; set; }
    public long? MessageId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }
}

public enum AnchorBatchStatus
{
    Pending,
    Submitted,
    Confirmed,
    Failed,
}

/// <summary>A batch of messages whose Merkle root was anchored on-chain (SDD §6.6).</summary>
public class AnchorBatch
{
    public long Id { get; set; }
    public required string Root { get; set; }
    public long FromMessageId { get; set; }
    public long ToMessageId { get; set; }
    public int LeafCount { get; set; }
    public AnchorBatchStatus Status { get; set; }
    public string? TxHash { get; set; }
    public long? BlockNumber { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? AnchoredAt { get; set; }
}

/// <summary>Indexer progress per contract, so it resumes after a restart (SDD §10).</summary>
public class ChainSyncState
{
    public required string ContractName { get; set; }
    public long LastProcessedBlock { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>An event the indexer has already applied, identified by tx hash + log index (idempotency, SDD §10).</summary>
public class ProcessedChainEvent
{
    public required string TxHash { get; set; }
    public int LogIndex { get; set; }
    public long BlockNumber { get; set; }
    /// <summary>Kept so a reorg can be detected by comparing with the canonical block hash.</summary>
    public required string BlockHash { get; set; }
    public DateTimeOffset ProcessedAt { get; set; }
}

/// <summary>A one-time test-ETH drip to a new address (demo only, SDD §4.2).</summary>
public class GasDrip
{
    public required string Address { get; set; }
    public required string TxHash { get; set; }
    public BigInteger AmountWei { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
