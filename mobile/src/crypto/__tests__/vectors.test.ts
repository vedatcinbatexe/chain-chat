import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Address, Hex } from 'viem';

import { checkChainLink } from '../hashChain';
import { directConversationId } from '../conversationId';
import { ciphertextHash, encodeMessage, messageHash } from '../messageHash';
import { leafHash, merkleProof, merkleRoot, verifyProof } from '../merkle';
import { signingDigest, signMessageHash, verifyMessageSignature } from '../signature';

/** The shared Phase 3 answer key — the same files the C# and Solidity tests read. */
const VECTORS_DIR = join(__dirname, '../../../../shared/test-vectors/vectors');
const load = (file: string) => JSON.parse(readFileSync(join(VECTORS_DIR, file), 'utf8'));

const conversationIds = load('conversation-id.json');
const messageHashes = load('message-hash.json');
const hashChains = load('hash-chain.json');
const signatures = load('signatures.json');
const merkle = load('merkle.json');

/** [name, case] pairs for it.each, so every vector case is reported by name. */
const named = (cases: any[]) => cases.map((c) => [c.name as string, c] as [string, any]);

describe('conversation-id.json', () => {
  it.each(named(conversationIds.cases))('%s', (_name, c: any) => {
    expect(directConversationId(c.input.a, c.input.b)).toBe(c.expected.conversationId);
  });
});

describe('message-hash.json', () => {
  it.each(named(messageHashes.cases))('%s', (_name, c: any) => {
    const header = { ...c.input, seq: BigInt(c.input.seq), clientTimestamp: BigInt(c.input.clientTimestamp) };
    expect(ciphertextHash(header.ciphertext)).toBe(c.expected.ciphertextHash);
    expect(encodeMessage(header)).toBe(c.expected.encoded);
    expect(messageHash(header)).toBe(c.expected.messageHash);
  });
});

describe('hash-chain.json', () => {
  it.each(named(hashChains.cases))('%s', (_name, c: any) => {
    const previous = c.input.previous && { seq: BigInt(c.input.previous.seq), messageHash: c.input.previous.messageHash };
    const next = { seq: BigInt(c.input.next.seq), prevHash: c.input.next.prevHash };
    expect(checkChainLink(previous, next)).toEqual(c.expected);
  });
});

describe('signatures.json', () => {
  it.each(named(signatures.valid))('valid: %s', async (_name, c: any) => {
    expect(signingDigest(c.input.messageHash)).toBe(c.expected.digest);
    expect(await signMessageHash(c.input.privateKey, c.input.messageHash)).toBe(c.expected.signature);
    expect(await verifyMessageSignature(c.input.sender, c.input.messageHash, c.expected.signature)).toEqual(c.expected.check);
  });

  it.each(named(signatures.invalid))('invalid: %s', async (_name, c: any) => {
    const check = await verifyMessageSignature(c.input.sender as Address, c.input.messageHash as Hex, c.input.signature as Hex);
    expect(check).toEqual(c.expected.check);
  });
});

describe('merkle.json', () => {
  it.each(named(merkle.cases))('%s', (_name, c: any) => {
    const leaves = (c.input.messageHashes as Hex[]).map(leafHash);
    expect(leaves).toEqual(c.expected.leaves);
    expect(merkleRoot(leaves)).toBe(c.expected.root);
    leaves.forEach((leaf, i) => {
      expect(merkleProof(leaves, i)).toEqual(c.expected.proofs[i]);
      expect(verifyProof(leaf, c.expected.proofs[i], c.expected.root)).toBe(true);
    });
  });

  it.each(named(merkle.negative))('rejects: %s', (_name, c: any) => {
    expect(verifyProof(c.leaf, c.proof, c.root)).toBe(false);
  });
});
