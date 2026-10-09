import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toFunctionSignature, toEventSignature, type Abi } from 'viem';

import { registryAbi, USERNAME_PATTERN } from '../registry';

/** The ABI exported by contracts/deploy.sh from the real contract. */
const deployedAbi: Abi = JSON.parse(
  readFileSync(join(__dirname, '../../../../shared/deployments/abi/Registry.json'), 'utf8'),
);

const signatures = (abi: Abi, type: 'function' | 'event' | 'error') =>
  abi
    .filter((item) => item.type === type)
    .map((item) => (type === 'event' ? toEventSignature(item as never) : toFunctionSignature(item as never)));

describe('registryAbi', () => {
  it.each(['function', 'event', 'error'] as const)('every %s used by the app exists in the deployed contract', (type) => {
    const deployed = signatures(deployedAbi, type);
    for (const signature of signatures(registryAbi, type)) {
      expect(deployed).toContain(signature);
    }
  });
});

describe('USERNAME_PATTERN', () => {
  it('matches Registry.isValidUsername', () => {
    for (const valid of ['abc', 'vedat_cinbat', 'a1234567890123456789']) expect(USERNAME_PATTERN.test(valid)).toBe(true);
    for (const invalid of ['ab', 'Alice', 'al-ice', 'al ice', 'a12345678901234567890']) expect(USERNAME_PATTERN.test(invalid)).toBe(false);
  });
});
