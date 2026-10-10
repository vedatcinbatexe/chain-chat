using System;
using System.Numerics;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChainChat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAssetsAndExchange : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "asset_transfers",
                columns: table => new
                {
                    tx_hash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    from = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    to = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    asset = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    amount = table.Column<BigInteger>(type: "numeric(78,0)", nullable: false),
                    kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_asset_transfers", x => x.tx_hash);
                });

            migrationBuilder.CreateTable(
                name: "exchange_wallets",
                columns: table => new
                {
                    address = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    owner = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    label = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    private_key = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_exchange_wallets", x => x.address);
                });

            migrationBuilder.CreateIndex(
                name: "ix_asset_transfers_from",
                table: "asset_transfers",
                column: "from");

            migrationBuilder.CreateIndex(
                name: "ix_asset_transfers_to",
                table: "asset_transfers",
                column: "to");

            migrationBuilder.CreateIndex(
                name: "ix_exchange_wallets_owner",
                table: "exchange_wallets",
                column: "owner");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "asset_transfers");

            migrationBuilder.DropTable(
                name: "exchange_wallets");
        }
    }
}
