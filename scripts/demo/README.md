# Demo tools

Small Node scripts for demonstrating ChainChat with a single phone. They talk to the **local** environment only
(API on `localhost:5080`, Anvil on `localhost:8545`) and act as independent clients: they implement the same
protocol as the app (SIWE sign-in, signatures, hash chain, encryption) without sharing its code.

> **Local demo only.** The demo users are Anvil's public development accounts #0–#2. Their private keys are known
> to everyone — never use them on a real network.

## Setup

The scripts reuse the mobile app's dependencies, and need the local environment to be running:

```bash
cd mobile && npm install
cd infra/local && docker compose up -d
```

Run every command below from the repository root.

## 1. Seed the demo users

Registers `@alice`, `@bob` and `@carol` in the Registry contract (skips users that already exist). Needed once
after the chain was created or reset (`docker compose down -v`).

```bash
node scripts/demo/seed-users.mjs
```

## 2. Chat bot

Signs in as a demo user and answers every message it receives. For each incoming message it recomputes the hash,
checks the signature, and decrypts with the sender's on-chain key. Then it shows "typing…" for a few seconds and
replies with its own signed, hash-chained, encrypted message.

```bash
node scripts/demo/chat-bot.mjs bob
```

- **Payments:** when it receives a CHAT payment message, it checks the transaction receipt on-chain before
  thanking the sender.
- **Groups:** pass an invite link or code as the second argument and the bot joins that group first. In groups it
  also reacts with 👍. It stays a member afterwards, so the link is only needed once.

```bash
node scripts/demo/chat-bot.mjs carol "chainchat://join/<code>"
```

Run one process per demo user; several bots can be in the same group (they do not answer each other).

The bot can stay running for a whole demo: it signs in again before its session expires (sessions last an hour),
reconnects by itself when the API restarts, and can be started before the API is up.

For an **NFT-gated group**, the bot's wallet needs every badge the group requires first: mint them to it in the
admin dashboard (Users → the demo user → Mint badge), then start the bot with the invite link. Like the apps, the bot checks every member's badges on the chain
before encrypting a group message to them.

## 3. Stolen-key attack

Shows why messages are anchored on-chain. The attacker ("Mallory") controls the database **and** has bob's
private key. She replaces bob's first message in his conversation with you and re-signs it and all of bob's later
messages, so every signature and the hash chain are still valid.

1. Chat with the bob bot, and wait until the messages are anchored (the Verify sheet shows the anchor).
2. Run the attack with your wallet address (Settings → your address):

   ```bash
   node scripts/demo/stolen-key-attack.mjs attack 0xYourAddress "You owe me 1000 CHAT."
   ```

3. Reopen the chat: bob's first message now shows the fake text, with a valid signature. Tap it → Verify: the
   message does not match the Merkle root stored on-chain.
4. Undo it:

   ```bash
   node scripts/demo/stolen-key-attack.mjs restore
   ```

The script changes the database through `docker exec chainchat-postgres psql`, and keeps the original rows in
`scripts/demo/.stolen-key-backup.json` (git-ignored) until they are restored.

## Settings

| Variable | Default |
|---|---|
| `CHAINCHAT_API` | `http://localhost:5080` |
| `CHAINCHAT_RPC` | `http://localhost:8545` |
