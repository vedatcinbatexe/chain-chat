# Contract Deployments

Written by `contracts/deploy.sh` (Foundry), read by the backend and the mobile app.

| File | Network | Chain id | In git? |
|---|---|---|---|
| `anvil.json` | Local Anvil (Docker Compose) | 31337 | No — generated on each machine |
| `base-sepolia.json` | Base Sepolia testnet | 84532 | Yes (Phase 15) |
| `abi/<Contract>.json` | ABIs of the contracts | — | Yes |

The backend loads `{Chain:Network}.json` from `Chain:DeploymentsPath` at startup and refuses to start if the file's `chainId` differs from `Chain:ChainId`. If the file does not exist yet, the backend starts with a warning and contract features are unavailable. Restart the API after a new deployment.

## Deployment file format

```json
{
  "network": "anvil",
  "chainId": 31337,
  "contracts": {
    "Registry":   { "address": "0x…", "deployBlock": 1 },
    "ChatToken":  { "address": "0x…", "deployBlock": 1 },
    "ClassBadge": { "address": "0x…", "deployBlock": 1 },
    "Anchor":     { "address": "0x…", "deployBlock": 1 },
    "TestUSD":    { "address": "0x…", "deployBlock": 1 },
    "TestBTC":    { "address": "0x…", "deployBlock": 1 }
  }
}
```

- `deployBlock` — a block **at or before** the deployment; the chain indexer starts reading events from here.

## ABIs

`abi/Registry.json`, `abi/ChatToken.json`, `abi/ClassBadge.json`, `abi/Anchor.json`, `abi/TestToken.json` (shared by TestUSD and TestBTC) — exported with `forge inspect <Contract> abi --json` on every deploy, so clients don't need the Solidity build output.
