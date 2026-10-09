# Spikes

Throwaway experiments that answer a technical question before real code depends on it. Spikes live on their own branches and are **not merged into `main`**.

## Phase 1.2 — Expo Go compatibility (`spike/expo-go`)

**Question:** do the libraries ChainChat depends on work inside Expo Go on a real phone, without a custom development build?

**Answer:** yes — **8 / 8 checks passed** on an iPhone 16 (Expo SDK 57, React Native 0.86, Expo Go), run twice on 2026-10-09.

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | `react-native-get-random-values` — secure randomness | ✅ | Must be the first import (`index.ts`) |
| 2 | viem — generate wallet, sign, verify | ✅ | First signature ~900 ms (lazy-loaded curve code in dev), then ~60 ms |
| 3 | Phase 3 vectors — `messageHash` + EIP-191 signature | ✅ | Byte-for-byte identical to `shared/test-vectors` |
| 4 | viem → Anvil on the Mac over Wi-Fi | ✅ | `http://<mac-ip>:8545` |
| 5 | tweetnacl — X25519 + XSalsa20-Poly1305 round trip, tamper detection | ✅ | |
| 6 | expo-secure-store — save / load / delete in the iOS Keychain | ✅ | |
| 7 | @microsoft/signalr → hub on the Mac | ✅ | Connected over WebSockets |
| 8 | ChainChat API (`/api/v1/system/info`) | ✅ | Saw all 4 deployed contracts |

**Decision:** the mobile app uses **Expo Go** (no development build). Classmates can join the demo by scanning a QR code.

**Learned:**
- Expo Go only opens a dev project when the **same Expo account** is signed in on the phone (Expo Go) and the computer (`npx expo login`).
- iOS asks for **Local Network** permission the first time; it must be allowed or the phone cannot reach the Mac.
- Metro warns that `@noble/hashes/crypto.js` is not in the package's `exports` and falls back to file resolution — harmless.
- Still to do: run the same checks on an **Android** device.

### Running it again

```bash
# 1. Local stack (Anvil, contracts, API)
cd infra/local && docker compose up -d --build

# 2. SignalR echo hub (port 5090)
cd spikes/signalr-echo && dotnet run

# 3. Expo dev server — scan the QR code with the iPhone Camera, then tap "Run checks"
cd spikes/expo-go-check && npm install && npx expo start --lan
```

Results also appear in the Expo terminal, prefixed with `[SPIKE]`.
