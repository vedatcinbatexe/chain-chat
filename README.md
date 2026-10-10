# ChainChat

A mobile messenger where **your wallet is your identity**. No phone numbers or passwords: users sign in with their wallet, register a username on-chain, and exchange end-to-end encrypted messages. They can also send tokens inside chats and chat in end-to-end encrypted groups that are joined through invite links and can be gated by NFT ownership. Message history is anchored on-chain with Merkle roots, so anyone can prove it hasn't been altered.

> **Principle:** the blockchain holds trust, the server holds data.

Course project for **BLM3730 Blockchain Basics** at Yıldız Technical University. Runs only on test networks with test wallets and synthetic data.

📄 Full design: [ChainChat-SDD.md](ChainChat-SDD.md)

## Tech Stack

| Layer | Technologies |
|---|---|
| Mobile | React Native, Expo, TypeScript, viem, tweetnacl, SignalR client |
| Backend | ASP.NET Core, SignalR, EF Core, PostgreSQL, Nethereum |
| Blockchain | Solidity, Foundry, OpenZeppelin, Base Sepolia (Anvil locally) |
| Infrastructure | Docker, Docker Compose, Terraform (AWS), GitHub Actions |

## Repository Structure

```
chain-chat/
├── contracts/              # Foundry project (Solidity contracts, tests, deploy scripts) + Dockerfile (deploy job)
├── backend/                # ASP.NET Core solution (API, SignalR hub, chain indexer, anchoring job) + Dockerfile
│   ├── src/
│   └── tests/
├── mobile/                 # Expo (React Native + TypeScript) app — runs on phones via Expo Go
├── web-dashboard/          # Admin panel (React + TypeScript + Tailwind CSS) + Dockerfile
├── shared/
│   ├── deployments/        # Contract addresses + ABIs per network (generated)
│   └── test-vectors/       # Shared hash / Merkle test vectors (C# ⇄ TypeScript ⇄ Solidity)
├── scripts/
│   └── demo/               # Local demo tools: seed users, chat bot, stolen-key attack
├── infra/
│   ├── local/              # Docker Compose: the complete local environment
│   └── terraform/
│       ├── modules/        # Reusable AWS modules (network, ECS, RDS, ALB, S3, ECR, DNS)
│       └── envs/dev/       # AWS dev environment (not required for the demo)
└── ChainChat-SDD.md        # Software design document
```

## Environments

| Environment | Where | Chain | Used for |
|---|---|---|---|
| **local** | Your laptop, Docker Compose | Anvil | Day-to-day development and tests |
| **local (demo mode)** | Your laptop, Docker Compose | Base Sepolia | The class presentation — phones connect to the laptop via Expo Go |
| **dev** | AWS via Terraform | Base Sepolia | Optional cloud environment; scripts provided, not deployed for the demo |

## Getting Started

### Prerequisites
- Docker Desktop
- .NET SDK 10
- Node.js + npm
- Foundry (for contracts)
- Expo Go on a phone (for the mobile app)

### Local environment

```bash
cd infra/local
docker compose up -d --build
```

| Service | Port | Notes |
|---|---|---|
| API | 5080 | `/health`, `/api/v1/system/info`, `/api/v1/auth/*` (Sign-In with Ethereum), `/api/v1/drip`, `/api/v1/users/*` (search, profiles), `/api/v1/conversations/*`, `/api/v1/messages/{id}/proof`, real-time hub `/hubs/chat`, API docs at `/scalar` |
| Contracts deployer | — | One-off job: deploys the contracts to Anvil, writes `shared/deployments/anvil.json` |
| Admin dashboard | 5173 | React admin panel — see [web-dashboard/README.md](web-dashboard/README.md) |
| PostgreSQL 17 | 5432 | user / password / db: `chainchat` — migrations are applied by the API on startup |
| Anvil (local EVM chain) | 8545 | chain id `31337`, 2 s blocks, 20 funded test accounts |
| Redis *(optional)* | 6379 | `docker compose --profile extras up -d` |
| RabbitMQ *(optional)* | 5672, UI 15672 | `docker compose --profile extras up -d` |

Ports and credentials can be changed by copying `infra/local/.env.example` to `infra/local/.env`.

Stop everything with `docker compose down`, or add `-v` to also delete all data.

The seed job will be added to the same Compose file in Phase 15. Contract development is described in [contracts/README.md](contracts/README.md).

### Mobile app

Runs on your phone through Expo Go, served from your computer — see [mobile/README.md](mobile/README.md).

```bash
cd mobile
npm install
npm start    # scan the QR code with your phone
``` The Expo dev server runs directly on the laptop (`npx expo start`) so phones on the same network can scan its QR code.

### Admin dashboard

A web admin panel at <http://localhost:5173> for the people who run ChainChat: users (ban, add balance), groups, message metadata, transactions, admins, audit log and system settings. Only admin wallets can sign in, with Sign-In with Ethereum; locally, "Use the local dev account" signs in as the root admin. Details in [web-dashboard/README.md](web-dashboard/README.md).

### Demo tools

With the local environment running, [scripts/demo](scripts/demo/README.md) gives the phone someone to talk to: it registers the demo users, runs a bot that answers messages (1:1 and in groups), and can stage the "stolen key" tampering attack that on-chain anchoring detects.

```bash
node scripts/demo/seed-users.mjs
node scripts/demo/chat-bot.mjs bob
```

### Backend development

To run the API from your IDE or with hot reload instead of in Docker:

```bash
cd infra/local && docker compose stop api
cd ../../backend
dotnet run --project src/ChainChat.Api      # http://localhost:5080
dotnet test                                  # includes the shared crypto test vectors
```

Database migrations (EF Core, installed as a local tool):

```bash
cd backend
dotnet tool restore
dotnet ef migrations add <Name> -p src/ChainChat.Infrastructure -s src/ChainChat.Api -o Persistence/Migrations
```

## Development Workflow

- Work happens on feature branches (`feature/…`, `fix/…`, `chore/…`, `docs/…`).
- Every change goes into `main` through a pull request and is reviewed before merging.

## Status

🚧 In development. Done: local environment, shared crypto spec and test vectors, backend foundation, smart contracts, mobile foundation, wallet sign-in and on-chain onboarding, Registry indexer with user search and profiles, end-to-end encrypted 1:1 messaging, on-chain message anchoring with in-app verification, in-chat CHAT payments verified from on-chain receipts, group chat with invite links, typing indicators, online status and reactions, NFT-gated groups (the creator chooses which ERC-721 badges members must hold), web admin dashboard. Next: CI, testnet deployment.
