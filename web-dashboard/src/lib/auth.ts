import { getAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { post } from './api';
import { useSession } from './session';

interface Nonce {
  nonce: string;
  domain: string;
  uri: string;
  chainId: number;
  statement: string;
}

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

const injected = () => (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
export const hasInjectedWallet = () => !!injected();

/**
 * LOCAL DEMO ONLY: Anvil's public development account #0 (the contract deployer), which the local backend lists
 * as root admin. Every Anvil instance prints this key — it protects nothing and must never be used on a real network.
 */
const ANVIL_DEV_KEY: Hex = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ANVIL_CHAIN_ID = 31337;
export const devLoginEnabled = import.meta.env.VITE_ENABLE_DEV_LOGIN !== 'false';

/** The EIP-4361 text the backend parses (shared/test-vectors/SPEC.md §7). */
function siweMessage(address: Address, n: Nonce): string {
  const now = new Date();
  return [
    `${n.domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    n.statement,
    '',
    `URI: ${n.uri}`,
    'Version: 1',
    `Chain ID: ${n.chainId}`,
    `Nonce: ${n.nonce}`,
    `Issued At: ${now.toISOString()}`,
    `Expiration Time: ${new Date(now.getTime() + 5 * 60_000).toISOString()}`,
  ].join('\n');
}

async function signIn(address: Address, sign: (message: string) => Promise<Hex>, requireLocalChain = false) {
  const nonce = await post<Nonce>('/auth/nonce', { address });
  if (requireLocalChain && nonce.chainId !== ANVIL_CHAIN_ID) throw new Error('The dev account only works on the local Anvil chain.');

  const message = siweMessage(address, nonce);
  const signature = await sign(message);
  const session = await post<{ token: string; expiresAt: string; address: string }>('/auth/verify', { message, signature });
  useSession.getState().signIn(session);
}

/** Sign-In with Ethereum using the browser wallet (e.g. MetaMask). The wallet only signs a text; no transaction. */
export async function signInWithWallet() {
  const provider = injected();
  if (!provider) throw new Error('No browser wallet found. Install MetaMask, or use the local dev account.');
  const [account] = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  const address = getAddress(account);
  await signIn(address, (message) => provider.request({ method: 'personal_sign', params: [message, address] }) as Promise<Hex>);
}

/** Signs in as the local root admin without a browser wallet (local Anvil chain only). */
export async function signInWithDevAccount() {
  const account = privateKeyToAccount(ANVIL_DEV_KEY);
  await signIn(account.address, (message) => account.signMessage({ message }), true);
}
