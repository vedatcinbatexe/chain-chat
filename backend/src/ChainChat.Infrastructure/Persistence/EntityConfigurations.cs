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
        b.HasIndex(p => p.From);
        b.HasIndex(p => p.To);
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
