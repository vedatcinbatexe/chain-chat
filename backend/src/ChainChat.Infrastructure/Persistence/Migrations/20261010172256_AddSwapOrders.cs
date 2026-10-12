using System;
using System.Numerics;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChainChat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSwapOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "swap_orders",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false),
                    maker = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    taker = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: true),
                    sell_asset = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    sell_amount = table.Column<BigInteger>(type: "numeric(78,0)", nullable: false),
                    buy_asset = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    buy_amount = table.Column<BigInteger>(type: "numeric(78,0)", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    create_tx_hash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    close_tx_hash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    closed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_swap_orders", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_swap_orders_maker",
                table: "swap_orders",
                column: "maker");

            migrationBuilder.CreateIndex(
                name: "ix_swap_orders_status",
                table: "swap_orders",
                column: "status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "swap_orders");
        }
    }
}
