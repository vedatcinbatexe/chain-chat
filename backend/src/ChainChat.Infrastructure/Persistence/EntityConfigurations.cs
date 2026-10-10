using ChainChat.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ChainChat.Infrastructure.Persistence;

/// <summary>Column lengths shared by all configurations.</summary>
internal static class Len
{
    public const int Address = 42;   // 0x + 40 hex
    public const int Hash = 66;      // 0x + 64 hex
    public const int Username = 32;
}

internal sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> b)
    {
        b.HasKey(u => u.Address);
        b.Property(u => u.Address).HasMaxLength(Len.Address);
        b.Property(u => u.Username).HasMaxLength(Len.Username);
        b.Property(u => u.EncryptionPublicKey).HasMaxLength(Len.Hash);
        b.Property(u => u.RegistrationTxHash).HasMaxLength(Len.Hash);
        b.HasIndex(u => u.Username).IsUnique();
    }
}

internal sealed class ConversationConfiguration : IEntityTypeConfiguration<Conversation>
{
    public void Configure(EntityTypeBuilder<Conversation> b)
    {
        b.HasKey(c => c.Id);
        b.Property(c => c.Id).HasMaxLength(Len.Hash);
        b.HasOne(c => c.Group).WithOne().HasForeignKey<Group>(g => g.ConversationId);
        b.HasMany(c => c.Participants).WithOne().HasForeignKey(p => p.ConversationId);
    }
}

internal sealed class GroupConfiguration : IEntityTypeConfiguration<Group>
{
    public void Configure(EntityTypeBuilder<Group> b)
    {
        b.HasKey(g => g.ConversationId);
        b.Property(g => g.ConversationId).HasMaxLength(Len.Hash);
        b.Property(g => g.Name).HasMaxLength(64);
        b.Property(g => g.InviteCode).HasMaxLength(32);
        b.HasIndex(g => g.InviteCode).IsUnique();
        b.Property(g => g.RequiredBadgeContract).HasMaxLength(Len.Address);
        b.Property(g => g.CreatedBy).HasMaxLength(Len.Address);
    }
}

internal sealed class ParticipantConfiguration : IEntityTypeConfiguration<Participant>
{
    public void Configure(EntityTypeBuilder<Participant> b)
    {
        b.HasKey(p => new { p.ConversationId, p.Address });
        b.Property(p => p.ConversationId).HasMaxLength(Len.Hash);
        b.Property(p => p.Address).HasMaxLength(Len.Address);
        b.HasIndex(p => p.Address); // "my conversations"
    }
}

internal sealed class MessageConfiguration : IEntityTypeConfiguration<Message>
{
    public void Configure(EntityTypeBuilder<Message> b)
    {
        b.HasKey(m => m.Id);
        b.Property(m => m.ConversationId).HasMaxLength(Len.Hash);
        b.Property(m => m.Sender).HasMaxLength(Len.Address);
        b.Property(m => m.PrevHash).HasMaxLength(Len.Hash);
        b.Property(m => m.MessageHash).HasMaxLength(Len.Hash);
        b.Property(m => m.PaymentTxHash).HasMaxLength(Len.Hash);

        b.HasOne<Conversation>().WithMany().HasForeignKey(m => m.ConversationId);
        b.HasOne<AnchorBatch>().WithMany().HasForeignKey(m => m.AnchorBatchId);

        // One chain per sender per conversation: each seq exists once (SPEC.md §4).
        b.HasIndex(m => new { m.ConversationId, m.Sender, m.Seq }).IsUnique();
        b.HasIndex(m => m.MessageHash).IsUnique();
        // Paged history.
        b.HasIndex(m => new { m.ConversationId, m.Id });
        // Anchoring job: un-anchored messages.
        b.HasIndex(m => m.AnchorBatchId);
    }
}

internal sealed class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> b)
    {
        b.HasKey(p => p.TxHash);
        b.Property(p => p.TxHash).HasMaxLength(Len.Hash);
        b.Property(p => p.From).HasMaxLength(Len.Address);
        b.Property(p => p.To).HasMaxLength(Len.Address);
        b.Property(p => p.Amount).HasColumnType("numeric(78,0)"); // uint256
        b.Property(p => p.FailureReason).HasMaxLength(64);
        b.HasIndex(p => p.From);
        b.HasIndex(p => p.To);
        b.HasIndex(p => p.MessageId).IsUnique();
        b.HasIndex(p => p.Status);
    }
}

internal sealed class AnchorBatchConfiguration : IEntityTypeConfiguration<AnchorBatch>
{
    public void Configure(EntityTypeBuilder<AnchorBatch> b)
    {
        b.HasKey(a => a.Id);
        b.Property(a => a.Root).HasMaxLength(Len.Hash);
        b.Property(a => a.TxHash).HasMaxLength(Len.Hash);
        b.HasIndex(a => a.Root).IsUnique();
        b.HasIndex(a => a.Status);
    }
}

internal sealed class ChainSyncStateConfiguration : IEntityTypeConfiguration<ChainSyncState>
{
    public void Configure(EntityTypeBuilder<ChainSyncState> b)
    {
        b.HasKey(s => s.ContractName);
        b.Property(s => s.ContractName).HasMaxLength(64);
    }
}

internal sealed class ProcessedChainEventConfiguration : IEntityTypeConfiguration<ProcessedChainEvent>
{
    public void Configure(EntityTypeBuilder<ProcessedChainEvent> b)
    {
        b.HasKey(e => new { e.TxHash, e.LogIndex });
        b.Property(e => e.TxHash).HasMaxLength(Len.Hash);
        b.Property(e => e.BlockHash).HasMaxLength(Len.Hash);
        b.HasIndex(e => e.BlockNumber); // reorg re-checks
    }
}

internal sealed class GasDripConfiguration : IEntityTypeConfiguration<GasDrip>
{
    public void Configure(EntityTypeBuilder<GasDrip> b)
    {
        b.HasKey(d => d.Address);
        b.Property(d => d.Address).HasMaxLength(Len.Address);
        b.Property(d => d.TxHash).HasMaxLength(Len.Hash);
        b.Property(d => d.AmountWei).HasColumnType("numeric(78,0)");
    }
}

internal sealed class MessageReactionConfiguration : IEntityTypeConfiguration<MessageReaction>
{
    public void Configure(EntityTypeBuilder<MessageReaction> b)
    {
        // One reaction per person per emoji per message.
        b.HasKey(r => new { r.MessageId, r.Address, r.Emoji });
        b.Property(r => r.Address).HasMaxLength(Len.Address);
        b.Property(r => r.Emoji).HasMaxLength(16);
        b.HasOne<Message>().WithMany().HasForeignKey(r => r.MessageId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class AdminAccountConfiguration : IEntityTypeConfiguration<AdminAccount>
{
    public void Configure(EntityTypeBuilder<AdminAccount> b)
    {
        b.ToTable("admins");
        b.HasKey(a => a.Address);
        b.Property(a => a.Address).HasMaxLength(Len.Address);
        b.Property(a => a.AddedBy).HasMaxLength(Len.Address);
        b.Property(a => a.Note).HasMaxLength(200);
    }
}

internal sealed class BannedUserConfiguration : IEntityTypeConfiguration<BannedUser>
{
    public void Configure(EntityTypeBuilder<BannedUser> b)
    {
        b.HasKey(u => u.Address);
        b.Property(u => u.Address).HasMaxLength(Len.Address);
        b.Property(u => u.BannedBy).HasMaxLength(Len.Address);
        b.Property(u => u.Reason).HasMaxLength(200);
    }
}

internal sealed class AdminFundingConfiguration : IEntityTypeConfiguration<AdminFunding>
{
    public void Configure(EntityTypeBuilder<AdminFunding> b)
    {
        b.HasKey(f => f.Id);
        b.Property(f => f.Address).HasMaxLength(Len.Address);
        b.Property(f => f.Admin).HasMaxLength(Len.Address);
        b.Property(f => f.TxHash).HasMaxLength(Len.Hash);
        b.Property(f => f.Amount).HasColumnType("numeric(78,0)");
        b.HasIndex(f => f.Address);
    }
}

internal sealed class AdminAuditEntryConfiguration : IEntityTypeConfiguration<AdminAuditEntry>
{
    public void Configure(EntityTypeBuilder<AdminAuditEntry> b)
    {
        b.ToTable("admin_audit_log");
        b.HasKey(e => e.Id);
        b.Property(e => e.Admin).HasMaxLength(Len.Address);
        b.Property(e => e.Action).HasMaxLength(64);
        b.Property(e => e.Target).HasMaxLength(128);
        b.Property(e => e.Details).HasMaxLength(500);
    }
}

internal sealed class SystemSettingConfiguration : IEntityTypeConfiguration<SystemSetting>
{
    public void Configure(EntityTypeBuilder<SystemSetting> b)
    {
        b.HasKey(s => s.Key);
        b.Property(s => s.Key).HasMaxLength(64);
        b.Property(s => s.Value).HasMaxLength(200);
        b.Property(s => s.UpdatedBy).HasMaxLength(Len.Address);
    }
}

internal sealed class AnnouncementConfiguration : IEntityTypeConfiguration<Announcement>
{
    public void Configure(EntityTypeBuilder<Announcement> b)
    {
        b.HasKey(a => a.Id);
        b.Property(a => a.Title).HasMaxLength(80);
        b.Property(a => a.Body).HasMaxLength(500);
        b.Property(a => a.Admin).HasMaxLength(Len.Address);
    }
}

internal sealed class AssetTransferConfiguration : IEntityTypeConfiguration<AssetTransfer>
{
    public void Configure(EntityTypeBuilder<AssetTransfer> b)
    {
        b.HasKey(t => t.TxHash);
        b.Property(t => t.TxHash).HasMaxLength(Len.Hash);
        b.Property(t => t.From).HasMaxLength(Len.Address);
        b.Property(t => t.To).HasMaxLength(Len.Address);
        b.Property(t => t.Asset).HasMaxLength(16);
        b.Property(t => t.Amount).HasColumnType("numeric(78,0)");
        b.HasIndex(t => t.From);
        b.HasIndex(t => t.To);
    }
}

internal sealed class ExchangeWalletConfiguration : IEntityTypeConfiguration<ExchangeWallet>
{
    public void Configure(EntityTypeBuilder<ExchangeWallet> b)
    {
        b.HasKey(w => w.Address);
        b.Property(w => w.Address).HasMaxLength(Len.Address);
        b.Property(w => w.Owner).HasMaxLength(32);
        b.Property(w => w.Label).HasMaxLength(40);
        b.Property(w => w.PrivateKey).HasMaxLength(66);
        b.HasIndex(w => w.Owner);
    }
}
