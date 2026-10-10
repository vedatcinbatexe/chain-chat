# ChainChat Web Dashboard

The admin panel for ChainChat: React 19, TypeScript, Tailwind CSS 4, Vite, TanStack Query, viem.

Only admin wallets can sign in. Like the mobile app there is no password: the admin signs a
Sign-In with Ethereum message, and the backend checks that the wallet is on its admin list.

## Run

With the local stack running (`cd ../infra/local && docker compose up -d --build`):

```bash
npm install
npm run dev        # http://localhost:5173
```

The dev server forwards `/api` to the backend on `localhost:5080` (change with `API_TARGET`, see `.env.example`).

The dashboard is also part of the Compose stack (`dashboard` service, same address). Stop it with
`docker compose stop dashboard` before using `npm run dev`, because both use port 5173.

> The port matters: the sign-in message is bound to the dashboard's address (`Admin:Domain` and `Admin:Uri` on the
> API, `localhost:5173` by default). If you serve the dashboard somewhere else, change those two settings as well.

## Signing in

| Option | When |
|---|---|
| **Browser wallet** (MetaMask, …) | Any admin wallet. The wallet only signs a text; it sends no transaction. |
| **Local dev account** | Local development only. Signs in as Anvil account #0, the root admin of the local stack. The button is only offered on the local chain (id 31337) and can be removed with `VITE_ENABLE_DEV_LOGIN=false`. |

**Root admins** are listed in the backend configuration (`Admin:Addresses`). They can add other wallets as admins
on the Admins page; those admins can do everything except manage admins.

## Pages

| Page | What it does |
|---|---|
| Overview | Live counts (users, online, groups, messages, payments, anchor batches), messages per day, block height |
| Users | Search users; open one to see on-chain identity, ETH, CHAT and badge balances, groups; **add balance**; **mint badge**; **ban / unban** |
| Badges | Badge types in the ClassBadge contract; **create a badge type**; **mint a badge** to any wallet |
| Groups | Groups with member and message counts, and which badges they require; **remove a member**; **replace the invite link** |
| Messages | Message metadata (sender, size, hash, anchoring state) with filters |
| Transactions | In-chat payments, admin funding, gas drips, anchor batches; **add balance** to any address |
| Announcements | **Send a notification** to every user who has the app open; history of sent announcements |
| Admins | Who can sign in here; root admins add and remove admins |
| Audit log | Every change made from the dashboard, with the admin who made it |
| System | **Runtime settings** (pause messaging, group creation, group size, gas drip), **anchor now**, chain and indexer status, contracts, funder wallet, read-only server configuration |

### What admins cannot do — by design

- **Read messages.** Content is end-to-end encrypted; the server only stores ciphertext.
- **Edit or delete messages.** Every message is signed, hash-chained and anchored on-chain, so a change would be
  detected by the apps. The dashboard therefore offers no such action.
- **Take away a username or funds.** Those live on the blockchain. A ban only blocks the wallet on this server
  (sign-in, sending messages, joining groups).

"Add balance" is a real transaction: test ETH is sent from the funder wallet, and CHAT is minted by the token's
owner (`Admin:FunderPrivateKey`). "Mint badge" mints one badge (ERC-721) of a chosen type with the same key, which lets
the wallet join groups that require that badge. All of them are recorded under Transactions → Admin funding and in the audit log.

## Checks

```bash
npm run typecheck
npm run build
```

## Structure

```
src/
  lib/          api client, sign-in (SIWE), session, formatting, response types
  components/   layout, shared UI (tables, dialogs, badges), add-balance dialog
  pages/        one file per page
```
