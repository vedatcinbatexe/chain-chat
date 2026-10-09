using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChainChat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAnchorChainBatchId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "chain_batch_id",
                table: "anchor_batches",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_anchor_batches_status",
                table: "anchor_batches",
                column: "status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_anchor_batches_status",
                table: "anchor_batches");

            migrationBuilder.DropColumn(
                name: "chain_batch_id",
                table: "anchor_batches");
        }
    }
}
