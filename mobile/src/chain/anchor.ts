import { parseAbi, type Hex } from 'viem';

import type { SystemInfo } from '@/api/system';
import { leafHash, verifyProof } from '@/crypto';
import { getPublicClient } from './publicClient';

/**
 * The parts of the Anchor contract the app uses (contracts/src/Anchor.sol).
 * A test compares this with shared/deployments/abi/Anchor.json so they cannot drift apart.
 */
export const anchorAbi = parseAbi([
  'function getBatch(uint256 batchId) view returns ((bytes32 root, uint64 fromMessageId, uint64 toMessageId, uint64 anchoredAt))',
  'function verifyMessage(uint256 batchId, bytes32 messageHash, bytes32[] proof) view returns (bool)',
  'function lastAnchoredMessageId() view returns (uint64)',
  'event RootAnchored(uint256 indexed batchId, bytes32 indexed root, uint64 fromMessageId, uint64 toMessageId)',
  'error UnknownBatch(uint256 batchId)',
]);

type System = Pick<SystemInfo, 'chainId' | 'network' | 'contracts'>;

export interface OnChainBatch {
  root: Hex;
  fromMessageId: bigint;
  toMessageId: bigint;
  anchoredAt: Date;
}

function anchorAddress(system: System) {
  const address = system.contracts.Anchor;
  if (!address) throw new Error(`The Anchor contract is not deployed on ${system.network}.`);
  return address;
}

/** Reads an anchored batch directly from the Anchor contract — the root the server cannot change. */
export async function readOnChainBatch(system: System, batchId: number): Promise<OnChainBatch> {
  const batch = await getPublicClient(system).readContract({
    address: anchorAddress(system),
    abi: anchorAbi,
    functionName: 'getBatch',
    args: [BigInt(batchId)],
  });
  return { root: batch.root, fromMessageId: batch.fromMessageId, toMessageId: batch.toMessageId, anchoredAt: new Date(Number(batch.anchoredAt) * 1000) };
}

/** Asks the Anchor contract itself to check the proof (its on-chain `verifyMessage`). */
export function contractVerifiesMessage(system: System, batchId: number, messageHash: Hex, proof: Hex[]): Promise<boolean> {
  return getPublicClient(system).readContract({
    address: anchorAddress(system),
    abi: anchorAbi,
    functionName: 'verifyMessage',
    args: [BigInt(batchId), messageHash, proof],
  });
}

/**
 * Checks on the phone that `messageHash` is in the tree whose root is `onChainRoot` (SPEC.md §6).
 * `messageHash` must be the hash recomputed on this phone — never the value claimed by the server.
 */
export function isIncludedInRoot(messageHash: Hex, proof: Hex[], onChainRoot: Hex): boolean {
  return verifyProof(leafHash(messageHash), proof, onChainRoot);
}
