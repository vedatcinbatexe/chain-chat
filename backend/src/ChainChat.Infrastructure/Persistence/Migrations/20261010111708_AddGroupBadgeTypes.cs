using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChainChat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupBadgeTypes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int[]>(
                name: "required_badge_types",
                table: "groups",
                type: "integer[]",
                nullable: false,
                defaultValue: new int[0]);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "required_badge_types",
                table: "groups");
        }
    }
}
