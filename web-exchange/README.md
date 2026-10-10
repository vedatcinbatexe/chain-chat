# ChainChat Exchange (simulated)

A small website that plays "the outside world" for the demo: a pretend exchange where anyone can create wallets
with test balances, **deposit** them into ChainChat, and receive **withdrawals** from the app. React 19,
TypeScript, Tailwind CSS 4, Vite.

> **Demo only.** There is no login — an account is just a name — and the API behind it can create test balances.
> It exists only when the backend runs with `Exchange:Enabled` (on in Development, off by default).

## What is real and what is not

| | |
|---|---|
| **Real** | Every wallet is an address on the local chain. Adding a balance mints test tokens (or sends test ETH); a deposit is an ERC-20 or ETH transfer signed with the wallet's key; a withdrawal is a transfer signed on the user's phone. **Balances are read from the chain** — the database stores none. |
| **Simulated** | The exchange itself. The server holds the exchange wallets' keys (as a real exchange holds its customers' wallets), and the tokens have no value. |

The database keeps two things: which exchange wallets exist (with their keys), and a history of the transfers. The
history is a log for the screens; it is never used to compute a balance.

## Run

With the local stack running (`cd ../infra/local && docker compose up -d --build`), the portal is already served
at <http://localhost:5174> by the `exchange` service. For development with hot reload:

```bash
docker compose -f ../infra/local/docker-compose.yml stop exchange   # frees port 5174
npm install
npm run dev        # http://localhost:5174
```

The dev server forwards `/api` to the backend on `localhost:5080` (change with `API_TARGET`).

## Using it

1. **Open an account** — type any name (2–32 characters). The same name always shows the same wallets.
2. **New wallet** — a key pair is generated and the wallet gets a little test ETH for gas.
3. **Add balance** — pick an asset (ETH, CHAT, tUSD, tBTC) and an amount.
4. **Deposit to ChainChat** — type a username (or an address), an asset and an amount. The user's app shows a
   notification, and the balance appears in Settings and in the Activity tab.
5. **Withdraw from ChainChat** — in the app: Settings → **Withdraw**. Enter your exchange account name once; the
   app then lists your exchange wallets, and you pick one, an asset and an amount. The portal shows the incoming
   transfer within a few seconds. (Settings → **Send** sends to any address or username instead.)

## Checks

```bash
npm run typecheck
npm run build
```
