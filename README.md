# ChainChat

A mobile messenger where **your wallet is your identity**. No phone numbers or passwords: users sign in with their wallet, register a username on-chain, and exchange end-to-end encrypted messages. They can also send tokens inside chats and join groups gated by NFT ownership. Message history is anchored on-chain with Merkle roots, so anyone can prove it hasn't been altered.

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
├── shared/
│   ├── deployments/        # Contract addresses + ABIs per network (generated)
│   └── test-vectors/       # Shared hash / Merkle test vectors (C# ⇄ TypeScript ⇄ Solidity)
├── scripts/                # TypeScript seed and utility scripts + Dockerfile (seed job)
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
| API | 5080 | `/health`, `/api/v1/system/info`, API docs at `/scalar` |
| Contracts deployer | — | One-off job: deploys the contracts to Anvil, writes `shared/deployments/anvil.json` |
| PostgreSQL 17 | 5432 | user / password / db: `chainchat` — migrations are applied by the API on startup |
| Anvil (local EVM chain) | 8545 | chain id `31337`, 2 s blocks, 20 funded test accounts |
| Redis *(optional)* | 6379 | `docker compose --profile extras up -d` |
| RabbitMQ *(optional)* | 5672, UI 15672 | `docker compose --profile extras up -d` |

Ports and credentials can be changed by copying `infra/local/.env.example` to `infra/local/.env`.

Stop everything with `docker compose down`, or add `-v` to also delete all data.

The seed job will be added to the same Compose file in Phase 15. Contract development is described in [contracts/README.md](contracts/README.md). The Expo dev server runs directly on the laptop (`npx expo start`) so phones on the same network can scan its QR code.

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

🚧 In development. Done: local environment, shared crypto spec and test vectors, backend foundation, smart contracts. Next: authentication, mobile app.
