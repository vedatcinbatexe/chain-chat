# ChainChat Mobile

React Native app (Expo SDK 57, Expo Router, TypeScript) that runs in **Expo Go** — no development build needed (verified on an iPhone 16 in the Phase 1.2 spike).

## Run on your phone

1. Start the local stack: `cd ../infra/local && docker compose up -d --build`
2. Sign in to the same Expo account on the computer (`npx expo login`) and in the Expo Go app.
3. Start the dev server:
   ```bash
   npm install
   npm start          # expo start --lan
   ```
4. Scan the QR code with the iPhone Camera (or Expo Go on Android). Phone and computer must be on the same Wi-Fi; allow Local Network access when iOS asks.

The app finds the API (`:5080`) and Anvil (`:8545`) on the computer that serves it. To point it elsewhere (e.g. Base Sepolia demo mode), set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_RPC_URL` and `EXPO_PUBLIC_EXPLORER_URL` in `mobile/.env`. Network, chain id and contract addresses always come from the backend (`/api/v1/system/info`).

## Checks

```bash
npm test             # crypto module against shared/test-vectors (Phase 3) + encryption tests
npm run typecheck
npm run lint
npx expo-doctor
```

## Structure

```
index.ts               entry: crypto polyfill first, then Expo Router
src/
├── app/               routes (Expo Router)
│   ├── _layout.tsx    providers (Paper theme, TanStack Query), loads the wallet
│   ├── (onboarding)/  welcome, import — only without a wallet
│   └── (tabs)/        chats, groups, activity, settings — only with a wallet
├── crypto/            Phase 3 spec in TypeScript + X25519/XSalsa20-Poly1305 encryption
├── wallet/            key generation/import, secure storage (Keychain/Keystore), wallet store
├── api/               REST client (JWT, ProblemDetails), SignalR connection factory, system info
├── chain/             viem public client, balances
├── auth/              session (JWT) store
├── components/        shared UI
├── config/env.ts      API / RPC / explorer URLs
└── theme/             React Native Paper + navigation themes
```

## Security notes

- The wallet key (secp256k1) and the encryption key (X25519) are generated on the phone and stored only in secure storage with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (no iCloud backup).
- Unlocked keys are held outside the UI state store, so they never reach components or dev tools.
- Public keys and contract state are read from the chain directly, not trusted from the backend (SDD §4.2).
