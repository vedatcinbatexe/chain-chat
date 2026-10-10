using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChainChat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupsAndReactions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "required_badge_contract",
                table: "groups",
                type: "character varying(42)",
                maxLength: 42,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(42)",
                oldMaxLength: 42);

            migrationBuilder.AddColumn<string>(
                name: "invite_code",
                table: "groups",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "message_reactions",
                columns: table => new
                {
                    message_id = table.Column<long>(type: "bigint", nullable: false),
                    address = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    emoji = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_message_reactions", x => new { x.message_id, x.address, x.emoji });
                    table.ForeignKey(
                        name: "fk_message_reactions_messages_message_id",
                        column: x => x.message_id,
                        principalTable: "messages",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_groups_invite_code",
                table: "groups",
                column: "invite_code",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "message_reactions");

            migrationBuilder.DropIndex(
                name: "ix_groups_invite_code",
                table: "groups");

            migrationBuilder.DropColumn(
                name: "invite_code",
                table: "groups");

            migrationBuilder.AlterColumn<string>(
                name: "required_badge_contract",
                table: "groups",
                type: "character varying(42)",
                maxLength: 42,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(42)",
                oldMaxLength: 42,
                oldNullable: true);
        }
    }
}
