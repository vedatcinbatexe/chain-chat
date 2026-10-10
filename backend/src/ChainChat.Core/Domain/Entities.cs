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

/// <summary>Settings of a group conversation. Members join with the invite code (SDD §6.5).</summary>
public class Group
{
    public required string ConversationId { get; set; }
    public required string Name { get; set; }
    /// <summary>Secret code in the invite link (chainchat://join/{code}); anyone with the link can join.</summary>
    public required string InviteCode { get; set; }
    /// <summary>Optional ERC-721 contract (lowercase address) whose badge is required to join and stay a member (SDD §6.5).</summary>
    public string? RequiredBadgeContract { get; set; }
    /// <summary>Badge type ids (in <see cref="RequiredBadgeContract"/>) a member must hold — all of them. Empty for open groups.</summary>
    public int[] RequiredBadgeTypes { get; set; } = [];
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

/// <summary>An emoji reaction to a message. Metadata, visible to the server (unlike message content).</summary>
public class MessageReaction
{
    public long MessageId { get; set; }
    public required string Address { get; set; }
    public required string Emoji { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
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
    /// <summary>Why a payment failed: TransactionNotFound, TransactionReverted or NoMatchingTransfer.</summary>
    public string? FailureReason { get; set; }
    public long? BlockNumber { get; set; }
    public long? MessageId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }
}

public enum AnchorBatchStatus
{
    /// <summary>Built and stored with its proofs; transaction not sent yet.</summary>
    Pending,
    /// <summary>anchorRoot transaction sent; waiting to be mined and indexed.</summary>
    Submitted,
    /// <summary>RootAnchored event seen on-chain with enough confirmations.</summary>
    Confirmed,
    /// <summary>The transaction failed; the batch's messages were released to be anchored again.</summary>
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
    /// <summary>The batch index in the Anchor contract (from the RootAnchored event); set once confirmed.</summary>
    public long? ChainBatchId { get; set; }
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

// ---- Admin dashboard (SDD §4.4) ----

/// <summary>A wallet allowed into the admin dashboard, added by another admin. Root admins come from configuration.</summary>
public class AdminAccount
{
    public required string Address { get; set; }
    public string? Note { get; set; }
    public required string AddedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>A wallet blocked from signing in, sending messages and joining groups. Its on-chain identity is untouched.</summary>
public class BannedUser
{
    public required string Address { get; set; }
    public string? Reason { get; set; }
    public required string BannedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public enum FundingAsset
{
    Eth,
    Chat,
    /// <summary>A ClassBadge (ERC-721) minted to the address; the amount is 1.</summary>
    Badge,
}

/// <summary>Test ETH sent, or CHAT or a ClassBadge minted, to an address by an admin from the dashboard.</summary>
public class AdminFunding
{
    public long Id { get; set; }
    public required string Address { get; set; }
    public FundingAsset Asset { get; set; }
    /// <summary>Amount in the smallest unit (wei).</summary>
    public BigInteger Amount { get; set; }
    public required string TxHash { get; set; }
    public required string Admin { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>What an admin changed, and when (append-only).</summary>
public class AdminAuditEntry
{
    public long Id { get; set; }
    public required string Admin { get; set; }
    public required string Action { get; set; }
    public string? Target { get; set; }
    public string? Details { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>A runtime setting changed from the dashboard; missing keys use their default.</summary>
public class SystemSetting
{
    public required string Key { get; set; }
    public required string Value { get; set; }
    public required string UpdatedBy { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
