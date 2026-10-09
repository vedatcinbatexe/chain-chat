import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toEventSignature, toFunctionSignature, type Abi, type Hex } from 'viem';

import { anchorAbi, isIncludedInRoot } from '../anchor';

const read = (path: string) => JSON.parse(readFileSync(join(__dirname, '../../../../shared', path), 'utf8'));
const deployedAbi: Abi = read('deployments/abi/Anchor.json');
const merkle = read('test-vectors/vectors/merkle.json');

const signatures = (abi: Abi, type: 'function' | 'event' | 'error') =>
  abi.filter((item) => item.type === type).map((item) => (type === 'event' ? toEventSignature(item as never) : toFunctionSignature(item as never)));

describe('anchorAbi', () => {
  it.each(['function', 'event', 'error'] as const)('every %s used by the app exists in the deployed contract', (type) => {
    const deployed = signatures(deployedAbi, type);
    for (const signature of signatures(anchorAbi, type)) expect(deployed).toContain(signature);
  });
});

describe('isIncludedInRoot', () => {
  it.each((merkle.cases as any[]).map((c) => [c.name as string, c] as [string, any]))('every message of "%s" is included', (_name, c: any) => {
    (c.input.messageHashes as Hex[]).forEach((hash, i) => {
      expect(isIncludedInRoot(hash, c.expected.proofs[i], c.expected.root)).toBe(true);
    });
  });

  it('rejects a message hash that was changed after anchoring', () => {
    const c = merkle.cases.find((x: any) => x.name === '7 leaves');
    const otherHash = c.input.messageHashes[1] as Hex;
    expect(isIncludedInRoot(otherHash, c.expected.proofs[0], c.expected.root)).toBe(false);
  });
});
