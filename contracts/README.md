# ChainChat Contracts

Foundry project with the four ChainChat contracts (SDD §5.2). Dependencies are managed with Soldeer (no git submodules).

| Contract | Standard | Purpose |
|---|---|---|
| [`Registry`](src/Registry.sol) | Custom | username ↔ address ↔ X25519 encryption key; unique lowercase usernames; key rotation |
| [`ChatToken`](src/ChatToken.sol) | ERC-20 (CHAT) | Test currency for in-chat payments; faucet: 100 CHAT per address per day |
| [`ClassBadge`](src/ClassBadge.sol) | ERC-721 (CCB) | Badge that gates group chats; admin-minted, transferable (transfer = revoke access) |
| [`Anchor`](src/Anchor.sol) | Custom | Append-only Merkle roots of message batches; `verifyMessage` checks a proof on-chain |

Admin functions (`ChatToken.mint`, `ClassBadge.mint`, `Anchor.anchorRoot`) are `onlyOwner`; the owner is the deployer.

## Commands

```bash
forge soldeer install    # fetch dependencies (first time)
forge build
forge test               # unit, fuzz and shared Merkle vector tests
forge coverage --no-match-coverage "(test|script)"
slither .                # static analysis (config: slither.config.json)
```

Deploy to the local Anvil (also done automatically by `docker compose up` in `infra/local`):

```bash
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 ./deploy.sh
```

That key is Anvil's public development account #0 — **never use it on a real network**. The script writes `shared/deployments/anvil.json` and the ABIs, and skips deploying when the contracts in that file are already live (`FORCE_DEPLOY=true` to redeploy).

## Quality

- **Tests:** 37 (unit, fuzz with 1,000 runs, events, access control, shared Merkle vectors)
- **Coverage:** 100% lines, statements, branches and functions
- **Slither:** 0 findings; the only suppressed detectors are documented inline (`timestamp` false positives and the faucet's intended 1-day cooldown)
