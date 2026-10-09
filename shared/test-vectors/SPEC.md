# ChainChat Crypto Specification

**Status:** v1.1 — implements SDD §6.2, §6.3 and §6.7
**Applies to:** mobile app (TypeScript), backend (C#), contracts (Solidity)

This document defines, byte by byte, how ChainChat computes conversation ids, message hashes, hash chains, signatures and Merkle trees. Every implementation **must** reproduce the test vectors in [`vectors/`](vectors/) exactly. If an implementation disagrees with a vector, the implementation is wrong.

---

## 1. Conventions

| Item | Rule |
|---|---|
| Hash function | `keccak256` (Ethereum's Keccak-256, **not** NIST SHA3-256) |
| Encoding | Solidity `abi.encode`: every static value is padded to 32 bytes, big-endian |
| `bytes32` | 32 bytes, written in JSON as `0x` + 64 lowercase hex characters |
| `address` | 20 bytes, left-padded with zeros to 32 bytes when encoded; compared case-insensitively; written in JSON with EIP-55 checksum casing |
| `uint64` | Unsigned 64-bit integer, left-padded to 32 bytes when encoded; written in JSON as a **decimal string** so no language loses precision |
| Bytes | Written in JSON as `0x`-prefixed lowercase hex |
| `‖` | Byte concatenation |

> `abi.encodePacked` is never used: it concatenates values without padding, which makes different inputs produce the same bytes (e.g. `"ab" ‖ "c"` = `"a" ‖ "bc"`).

---

## 2. Conversation id

A `bytes32` value that identifies a conversation.

**1:1 conversation** — computed locally by both participants, no server needed:

```
(low, high)    = the two addresses sorted by numeric value
conversationId = keccak256(abi.encode(address low, address high))
```

Sorting makes the id independent of who starts the chat. An address cannot have a conversation with itself.

**Group conversation** — 32 random bytes chosen when the group is created.

Vectors: [`conversation-id.json`](vectors/conversation-id.json)

---

## 3. Message hash

Every message has a header. The sender computes its hash and signs it (§5).

| Field | Type | Meaning |
|---|---|---|
| `conversationId` | `bytes32` | §2 |
| `sender` | `address` | The sender's wallet address |
| `seq` | `uint64` | The sender's message counter **in this conversation**, starting at `1` |
| `prevHash` | `bytes32` | `messageHash` of the sender's previous message in this conversation; 32 zero bytes when `seq = 1` |
| `ciphertext` | bytes | The encrypted payload exactly as sent (opaque, at least 1 byte) |
| `clientTimestamp` | `uint64` | Milliseconds since the Unix epoch, from the sender's device |

```
ciphertextHash = keccak256(ciphertext)

encoded = abi.encode(
    bytes32 conversationId,
    address sender,
    uint64  seq,
    bytes32 prevHash,
    bytes32 ciphertextHash,
    uint64  clientTimestamp
)                                   // always exactly 192 bytes (6 × 32)

messageHash = keccak256(encoded)
```

**Validity rules**
- `1 ≤ seq ≤ 2^64 − 1`
- `seq = 1` ⇔ `prevHash = 0x00…00`
- `ciphertext` is not empty

**Why each field is hashed**
- `conversationId` — a message cannot be replayed into another conversation.
- `sender` — the hash is bound to one identity.
- `seq`, `prevHash` — form the hash chain (§4).
- `ciphertextHash` — commits to the content without revealing it.
- `clientTimestamp` — the sender's claimed send time is covered by the signature.

Vectors: [`message-hash.json`](vectors/message-hash.json) — each case includes the intermediate `ciphertextHash` and `encoded` bytes, so a failing implementation can see exactly which step differs.

---

## 4. Per-sender hash chain

Within one conversation, each sender's messages form their own chain (like blocks linking to the previous block). Chains are **per sender**, so two participants sending at the same moment never conflict.

When a message arrives, compare it with the **last accepted message from the same sender in the same conversation** (`previous`, or none):

| Situation | Result |
|---|---|
| No previous message, `seq = 1` and `prevHash = 0x00…00` | valid |
| No previous message, anything else | `bad-genesis` |
| `seq ≠ previous.seq + 1` | `seq-gap` (a message is missing, or one is replayed) |
| `prevHash ≠ previous.messageHash` | `broken-link` |
| Otherwise | valid |

Checks are applied in the order above. The backend rejects invalid messages; the receiving app shows a warning such as "a message from this sender is missing".

Vectors: [`hash-chain.json`](vectors/hash-chain.json)

---

## 5. Message signature

The sender signs `messageHash` with their wallet key (secp256k1) using **EIP-191** (`personal_sign`):

```
digest    = keccak256("\x19Ethereum Signed Message:\n32" ‖ messageHash)
signature = r ‖ s ‖ v              // 65 bytes; v ∈ {27, 28}
```

The prefix guarantees that a signed chat message can never be valid as a signed transaction.

Signing uses deterministic ECDSA nonces (RFC 6979), so the same key and hash always produce the same signature — this makes the vectors reproducible.

**Verification** — a signature is valid only if all checks pass, in this order:

| Check | Failure reason |
|---|---|
| Signature is exactly 65 bytes | `bad-length` |
| `v` is 27 or 28 | `bad-v` |
| `s ≤ n / 2`, where `n` = secp256k1 group order `0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141` | `high-s` |
| An address can be recovered from `(digest, signature)` | `unrecoverable` |
| The recovered address equals `sender` | `wrong-signer` |

> **Why reject high-s?** ECDSA is malleable: if `(r, s)` is valid, so is `(r, n − s)` with `v` flipped. Accepting both would let anyone create a second, different-looking valid signature for the same message. Bitcoin (BIP-62/BIP-146) and Ethereum (EIP-2) both require low-s.

Vectors: [`signatures.json`](vectors/signatures.json) — signed with **Anvil's public development keys**, which must never hold real funds.

---

## 6. Merkle tree

Used to anchor batches of messages on-chain (SDD §6.6). Compatible with OpenZeppelin `MerkleProof.verify`.

### 6.1 Leaves

```
leaf = keccak256(keccak256(abi.encode(bytes32 messageHash)))
```

`abi.encode` of one `bytes32` is the 32 bytes themselves, so this is `keccak256(keccak256(messageHash))`.

Hashing twice separates leaves from internal nodes. Without it, an attacker could present an internal node's 64-byte input as if it were a leaf (**second-preimage attack**).

Leaf order within a batch is chosen by the backend (server receive time, then message id) and stored with the batch.

### 6.2 Internal nodes

```
node = keccak256(min(a, b) ‖ max(a, b))      // a, b compared as unsigned 256-bit integers
```

Sorting the pair means a proof does not need left/right flags.

### 6.3 Building the tree

1. Level 0 is the list of leaves (at least one; an empty batch is never anchored).
2. Each next level hashes neighbours in pairs: `(0,1), (2,3), …`.
3. If a level has an odd number of nodes, the **last node is promoted unchanged** to the next level.
4. Repeat until one node remains: the **root**.

```
3 leaves:            ROOT = node(node(L0, L1), L2)
                      /                 \
               node(L0, L1)              L2   ← promoted
                /        \
              L0          L1
```

> **Why promote instead of duplicating?** Bitcoin duplicates the last node on odd levels. That allowed two different transaction lists to produce the same Merkle root (**CVE-2012-2459**). Promotion avoids this.

### 6.4 Proofs

A proof is the list of sibling hashes from the leaf up to the root. At a level where the node was promoted, there is no sibling and nothing is added.

```
verify(leaf, proof, root):
    computed = leaf
    for sibling in proof:
        computed = node(computed, sibling)
    return computed == root
```

A single-leaf tree has `root = leaf` and an empty proof.

Vectors: [`merkle.json`](vectors/merkle.json) — trees of 1, 2, 3, 4, 5, 7, 8 and 100 leaves with every proof, plus negative cases that must fail. Test message hashes are `keccak256(abi.encode(uint256 i))` for `i = 0 … n−1`.

---

## 7. Sign-In with Ethereum (login)

The app signs in to the backend by signing an **EIP-4361** message with the wallet key; the backend returns a JWT. No password is involved.

ChainChat uses a strict subset: **statement and expiration time are required**; `Not Before`, `Request ID` and `Resources` are not used. Lines are joined with `\n`:

```
{domain} wants you to sign in with your Ethereum account:
{address}

{statement}

URI: {uri}
Version: 1
Chain ID: {chainId}
Nonce: {nonce}
Issued At: {issuedAt}
Expiration Time: {expirationTime}
```

| Field | Rule |
|---|---|
| `domain` | The backend's configured domain (e.g. `chainchat.local`) |
| `address` | **EIP-55 checksummed** |
| `statement` | One line |
| `uri` | The backend's configured URI (e.g. `chainchat://app`) |
| `chainId` | The backend's chain id |
| `nonce` | Issued by the backend, single use, ≥ 8 alphanumeric characters |
| `issuedAt`, `expirationTime` | RFC 3339 timestamps (`2026-01-01T00:00:00.000Z`) |

The message is signed with **personal_sign** (EIP-191 with the message's byte length):

```
digest    = keccak256("\x19Ethereum Signed Message:\n" ‖ len(message) ‖ message)
signature = r ‖ s ‖ v              // same 65-byte format and checks as §5, including low-s
```

The backend additionally enforces: matching domain, URI and chain id; the nonce exists, belongs to this address and is consumed; `issuedAt` is not in the future and `expirationTime` is not in the past (small clock-skew allowance); and the message lifetime is short.

Vectors: [`siwe.json`](vectors/siwe.json) — the formatted message, digest and signature for each case.

---

## 8. Using the vectors

| Implementation | Where | How |
|---|---|---|
| TypeScript reference | [`generator/`](generator/) | Generates the vectors; `npm test` also fails if the committed files are out of date |
| Mobile app | `mobile/` (Phase 8) | Jest tests load every JSON file and compare; `siwe.json` checks the login message format |
| Backend | `backend/tests/` (Phase 4) | xUnit tests load every JSON file and compare; `siwe.json` checks login message parsing |
| Contracts | `contracts/test/` (Phase 2) | Foundry test checks every `merkle.json` proof with OpenZeppelin `MerkleProof.verify` |

**Changing the spec:** update this document and the reference implementation together, run `npm run generate`, and commit the regenerated vectors in the same change. Every other implementation must then be updated until its tests pass again.

### Running the generator

```bash
cd shared/test-vectors/generator
npm install
npm test            # unit tests + check that vectors are up to date
npm run generate    # rewrite vectors/*.json
```
