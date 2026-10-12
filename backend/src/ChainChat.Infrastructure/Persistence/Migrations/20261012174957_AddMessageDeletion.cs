using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChainChat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMessageDeletion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ciphertext_hash",
                table: "messages",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "deleted_at",
                table: "messages",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ciphertext_hash",
                table: "messages");

            migrationBuilder.DropColumn(
                name: "deleted_at",
                table: "messages");
        }
    }
}
