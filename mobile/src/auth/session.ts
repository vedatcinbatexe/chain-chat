import { requestNonce, verifySignIn } from '@/api/auth';
import { formatSiweMessage } from '@/crypto';
import { getAccount } from '@/wallet/walletStore';
import { useSessionStore, type Session } from './sessionStore';

/** Messages are valid for 5 minutes; the server allows at most 10 (SPEC.md §7). */
const MESSAGE_LIFETIME_MS = 5 * 60 * 1000;
/** Sign in again a minute before the token expires. */
const REFRESH_MARGIN_MS = 60 * 1000;

let pending: Promise<Session> | null = null;

/**
 * Sign-In with Ethereum (SDD §6.2): ask for a nonce, sign the EIP-4361 message with the wallet key,
 * exchange the signature for a JWT. No password, no gas.
 */
export async function signIn(): Promise<Session> {
  const account = getAccount();
  const challenge = await requestNonce(account.address);
  const issuedAt = new Date();

  const message = formatSiweMessage({
    domain: challenge.domain,
    address: account.address,
    statement: challenge.statement,
    uri: challenge.uri,
    chainId: challenge.chainId,
    nonce: challenge.nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime: new Date(issuedAt.getTime() + MESSAGE_LIFETIME_MS).toISOString(),
  });

  const response = await verifySignIn(message, await account.signMessage({ message }));
  const session: Session = { token: response.token, expiresAt: Date.parse(response.expiresAt), address: response.address };
  useSessionStore.getState().setSession(session);
  return session;
}

/** Returns a valid session for the current wallet, signing in if there is none or it is about to expire. */
export function ensureSession(): Promise<Session> {
  const current = useSessionStore.getState().session;
  const address = getAccount().address;
  if (current && current.address === address && current.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return Promise.resolve(current);
  }

  // Concurrent callers share one sign-in instead of each requesting a nonce.
  pending ??= signIn().finally(() => {
    pending = null;
  });
  return pending;
}

export function signOut(): void {
  useSessionStore.getState().setSession(null);
}
