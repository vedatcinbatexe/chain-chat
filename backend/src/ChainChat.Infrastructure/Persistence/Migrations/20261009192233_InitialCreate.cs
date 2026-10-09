using System;
using System.Numerics;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ChainChat.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "anchor_batches",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    root = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    from_message_id = table.Column<long>(type: "bigint", nullable: false),
                    to_message_id = table.Column<long>(type: "bigint", nullable: false),
                    leaf_count = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    tx_hash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: true),
                    block_number = table.Column<long>(type: "bigint", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    anchored_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_anchor_batches", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "chain_sync_states",
                columns: table => new
                {
                    contract_name = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    last_processed_block = table.Column<long>(type: "bigint", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_chain_sync_states", x => x.contract_name);
                });

            migrationBuilder.CreateTable(
                name: "conversations",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_conversations", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "gas_drips",
                columns: table => new
                {
                    address = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    tx_hash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    amount_wei = table.Column<BigInteger>(type: "numeric(78,0)", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_gas_drips", x => x.address);
                });

            migrationBuilder.CreateTable(
                name: "payments",
                columns: table => new
                {
                    tx_hash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    from = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    to = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    amount = table.Column<BigInteger>(type: "numeric(78,0)", nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    block_number = table.Column<long>(type: "bigint", nullable: true),
                    message_id = table.Column<long>(type: "bigint", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    confirmed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_payments", x => x.tx_hash);
                });

            migrationBuilder.CreateTable(
                name: "processed_chain_events",
                columns: table => new
                {
                    tx_hash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    log_index = table.Column<int>(type: "integer", nullable: false),
                    block_number = table.Column<long>(type: "bigint", nullable: false),
                    block_hash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    processed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_processed_chain_events", x => new { x.tx_hash, x.log_index });
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    address = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    username = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    encryption_public_key = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    registration_tx_hash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    registered_at_block = table.Column<long>(type: "bigint", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_users", x => x.address);
                });

            migrationBuilder.CreateTable(
                name: "groups",
                columns: table => new
                {
                    conversation_id = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    name = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    required_badge_contract = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    max_members = table.Column<int>(type: "integer", nullable: false),
                    created_by = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_groups", x => x.conversation_id);
                    table.ForeignKey(
                        name: "fk_groups_conversations_conversation_id",
                        column: x => x.conversation_id,
                        principalTable: "conversations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "messages",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    conversation_id = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    sender = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    seq = table.Column<decimal>(type: "numeric(20,0)", nullable: false),
                    prev_hash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    message_hash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    ciphertext = table.Column<byte[]>(type: "bytea", nullable: false),
                    signature = table.Column<byte[]>(type: "bytea", nullable: false),
                    client_timestamp = table.Column<decimal>(type: "numeric(20,0)", nullable: false),
                    server_received_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    payment_tx_hash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: true),
                    anchor_batch_id = table.Column<long>(type: "bigint", nullable: true),
                    leaf_index = table.Column<int>(type: "integer", nullable: true),
                    merkle_proof = table.Column<string[]>(type: "text[]", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_messages", x => x.id);
                    table.ForeignKey(
                        name: "fk_messages_anchor_batches_anchor_batch_id",
                        column: x => x.anchor_batch_id,
                        principalTable: "anchor_batches",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "fk_messages_conversations_conversation_id",
                        column: x => x.conversation_id,
                        principalTable: "conversations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "participants",
                columns: table => new
                {
                    conversation_id = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    address = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    joined_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    removed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_participants", x => new { x.conversation_id, x.address });
                    table.ForeignKey(
                        name: "fk_participants_conversations_conversation_id",
                        column: x => x.conversation_id,
                        principalTable: "conversations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_anchor_batches_root",
                table: "anchor_batches",
                column: "root",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_messages_anchor_batch_id",
                table: "messages",
                column: "anchor_batch_id");

            migrationBuilder.CreateIndex(
                name: "ix_messages_conversation_id_id",
                table: "messages",
                columns: new[] { "conversation_id", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_messages_conversation_id_sender_seq",
                table: "messages",
                columns: new[] { "conversation_id", "sender", "seq" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_messages_message_hash",
                table: "messages",
                column: "message_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_participants_address",
                table: "participants",
                column: "address");

            migrationBuilder.CreateIndex(
                name: "ix_payments_from",
                table: "payments",
                column: "from");

            migrationBuilder.CreateIndex(
                name: "ix_payments_to",
                table: "payments",
                column: "to");

            migrationBuilder.CreateIndex(
                name: "ix_processed_chain_events_block_number",
                table: "processed_chain_events",
                column: "block_number");

            migrationBuilder.CreateIndex(
                name: "ix_users_username",
                table: "users",
                column: "username",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "chain_sync_states");

            migrationBuilder.DropTable(
                name: "gas_drips");

            migrationBuilder.DropTable(
                name: "groups");

            migrationBuilder.DropTable(
                name: "messages");

            migrationBuilder.DropTable(
                name: "participants");

            migrationBuilder.DropTable(
                name: "payments");

            migrationBuilder.DropTable(
                name: "processed_chain_events");

            migrationBuilder.DropTable(
                name: "users");

            migrationBuilder.DropTable(
                name: "anchor_batches");

            migrationBuilder.DropTable(
                name: "conversations");
        }
    }
}
