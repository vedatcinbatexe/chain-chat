using ChainChat.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace ChainChat.Infrastructure.Persistence;

public class ChainChatDbContext(DbContextOptions<ChainChatDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Group> Groups => Set<Group>();
    public DbSet<Participant> Participants => Set<Participant>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<MessageReaction> MessageReactions => Set<MessageReaction>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<AnchorBatch> AnchorBatches => Set<AnchorBatch>();
    public DbSet<ChainSyncState> ChainSyncStates => Set<ChainSyncState>();
    public DbSet<ProcessedChainEvent> ProcessedChainEvents => Set<ProcessedChainEvent>();
    public DbSet<GasDrip> GasDrips => Set<GasDrip>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) =>
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ChainChatDbContext).Assembly);

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // Enums are stored by name so the database stays readable.
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(32);
    }
}
