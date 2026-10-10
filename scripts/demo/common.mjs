// Shared setup for the local demo scripts. LOCAL DEMO ONLY: the keys below are Anvil's public development keys
// (printed by every Anvil instance) — never send real funds to these accounts and never use them on a real network.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
// The scripts reuse the mobile app's dependencies (run `npm install` in mobile/ first).
const require = createRequire(join(REPO, 'mobile/package.json'));
export const viem = require('viem');
export const { privateKeyToAccount } = require('viem/accounts');
export const { anvil } = require('viem/chains');
export const nacl = require('tweetnacl');
export const signalR = require('@microsoft/signalr');

export const API = process.env.CHAINCHAT_API ?? 'http://localhost:5080';
export const RPC = process.env.CHAINCHAT_RPC ?? 'http://localhost:8545';

/** Demo users = Anvil accounts #0–#2. */
const KEYS = {
  alice: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  bob: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  carol: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
};
export const DEMO_USERS = Object.keys(KEYS);

/** The wallet account and the X25519 encryption key pair of a demo user (the secret is derived from the name). */
export function demoUser(name) {
  if (!KEYS[name]) throw new Error(`Unknown demo user "${name}" — use one of: ${DEMO_USERS.join(', ')}`);
  const encSecret = new Uint8Array(createHash('sha256').update(`chainchat-local-demo-${name}`).digest());
  return { name, account: privateKeyToAccount(KEYS[name]), encSecret, encPublic: nacl.box.keyPair.fromSecretKey(encSecret).publicKey };
}

export const deployment = JSON.parse(readFileSync(join(REPO, 'shared/deployments/anvil.json'), 'utf8')).contracts;
export const chain = viem.createPublicClient({ chain: anvil, transport: viem.http(RPC) });
export const registryAbi = viem.parseAbi([
  'function register(string username, bytes32 encryptionKey)',
  'function resolveByAddress(address user) view returns ((string username, bytes32 encryptionKey, uint64 registeredAt))',
]);
/** Username and encryption key of an address, read from the Registry contract. */
export const resolveUser = (address) => chain.readContract({ address: deployment.Registry.address, abi: registryAbi, functionName: 'resolveByAddress', args: [address] });

// Message hash and 1:1 conversation id, as specified in shared/test-vectors/SPEC.md.
const MESSAGE_ABI = ['bytes32', 'address', 'uint64', 'bytes32', 'bytes32', 'uint64'].map((type) => ({ type }));
export const hashMessage = (m) =>
  viem.keccak256(viem.encodeAbiParameters(MESSAGE_ABI, [m.conversationId, m.sender, BigInt(m.seq), m.prevHash, viem.keccak256(m.ciphertext), BigInt(m.clientTimestamp)]));
export const conversationIdFor = (a, b) => {
  const [low, high] = [viem.getAddress(a), viem.getAddress(b)].sort((x, y) => (BigInt(x) < BigInt(y) ? -1 : 1));
  return viem.keccak256(viem.encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [low, high]));
};
