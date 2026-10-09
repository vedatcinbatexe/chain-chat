# Contract Deployments

One JSON file per network, written by the Foundry deploy script (Phase 2) and read by the backend and the mobile app.

| File | Network | Chain id |
|---|---|---|
| `anvil.json` | Local Anvil (Docker Compose) | 31337 |
| `base-sepolia.json` | Base Sepolia testnet | 84532 |

The backend loads `{Chain:Network}.json` from `Chain:DeploymentsPath` and refuses to start if the file's `chainId` differs from `Chain:ChainId`. If the file does not exist yet, the backend starts with a warning and contract features are unavailable.

## Format

```json
{
  "network": "anvil",
  "chainId": 31337,
  "contracts": {
    "Registry":   { "address": "0x…", "deployBlock": 1, "abi": [ … ] },
    "ChatToken":  { "address": "0x…", "deployBlock": 1, "abi": [ … ] },
    "ClassBadge": { "address": "0x…", "deployBlock": 1, "abi": [ … ] },
    "Anchor":     { "address": "0x…", "deployBlock": 1, "abi": [ … ] }
  }
}
```

- `deployBlock` — the block the contract was deployed in; the chain indexer starts reading events from here.
- `abi` — the contract ABI, so clients don't need the Solidity build output.
