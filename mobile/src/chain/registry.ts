import { createWalletClient, http, parseAbi, zeroAddress, type Address, type Hex } from 'viem';

import type { SystemInfo } from '@/api/system';
import { env } from '@/config/env';
import { getAccount } from '@/wallet/walletStore';
import { getPublicClient } from './publicClient';

/**
 * The parts of the Registry contract the app uses (contracts/src/Registry.sol).
 * A test compares this with shared/deployments/abi/Registry.json so they cannot drift apart.
 */
export const registryAbi = parseAbi([
  'function register(string username, bytes32 encryptionKey)',
  'function updateKey(bytes32 encryptionKey)',
  'function resolveByName(string username) view returns (address user, bytes32 encryptionKey)',
  'function resolveByAddress(address user) view returns ((string username, bytes32 encryptionKey, uint64 registeredAt))',
  'event UserRegistered(address indexed user, string username, bytes32 encryptionKey)',
  'event KeyUpdated(address indexed user, bytes32 encryptionKey)',
  'error AlreadyRegistered()',
  'error NotRegistered()',
  'error UsernameTaken()',
  'error InvalidUsername()',
  'error InvalidEncryptionKey()',
]);

/** Same rule as Registry.isValidUsername: 3–20 characters of [a-z0-9_]. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export interface Registration {
  registered: boolean;
  username: string | null;
  encryptionKey: Hex | null;
}

type System = Pick<SystemInfo, 'chainId' | 'network' | 'contracts'>;

function registryAddress(system: System): Address {
  const address = system.contracts.Registry;
  if (!address) throw new Error(`The Registry contract is not deployed on ${system.network}.`);
  return address;
}

/** Reads `address`'s registration directly from the chain — never from the backend (SDD §4.2). */
export async function readRegistration(system: System, address: Address): Promise<Registration> {
  const user = await getPublicClient(system).readContract({
    address: registryAddress(system),
    abi: registryAbi,
    functionName: 'resolveByAddress',
    args: [address],
  });
  return user.registeredAt === 0n
    ? { registered: false, username: null, encryptionKey: null }
    : { registered: true, username: user.username, encryptionKey: user.encryptionKey };
}

export async function isUsernameAvailable(system: System, username: string): Promise<boolean> {
  const [owner] = await getPublicClient(system).readContract({
    address: registryAddress(system),
    abi: registryAbi,
    functionName: 'resolveByName',
    args: [username],
  });
  return owner === zeroAddress;
}

/** Registers the signed-in wallet on-chain and waits for the transaction to be mined. */
export function register(system: System, username: string, encryptionKey: Hex, onSubmitted?: (txHash: Hex) => void) {
  return send(system, 'register', [username, encryptionKey], onSubmitted);
}

/** Rotates the on-chain encryption key to this device's key (e.g. after importing a wallet). */
export function updateEncryptionKey(system: System, encryptionKey: Hex, onSubmitted?: (txHash: Hex) => void) {
  return send(system, 'updateKey', [encryptionKey], onSubmitted);
}

async function send(
  system: System,
  functionName: 'register' | 'updateKey',
  args: readonly [string, Hex] | readonly [Hex],
  onSubmitted?: (txHash: Hex) => void,
): Promise<Hex> {
  const publicClient = getPublicClient(system);
  const account = getAccount();

  // Simulate first: reverts come back as readable contract errors (e.g. UsernameTaken) before any gas is spent.
  const { request } = await publicClient.simulateContract({
    account,
    address: registryAddress(system),
    abi: registryAbi,
    functionName,
    args: args as never,
  });

  const walletClient = createWalletClient({ account, chain: publicClient.chain, transport: http(env.rpcUrl) });
  const hash = await walletClient.writeContract(request);
  onSubmitted?.(hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`Transaction ${hash} reverted.`);
  return hash;
}
