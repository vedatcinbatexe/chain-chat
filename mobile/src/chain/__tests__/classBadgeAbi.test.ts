import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toEventSignature, toFunctionSignature, type Abi } from 'viem';

import { classBadgeAbi } from '../classBadge';

/** The ABI exported by contracts/deploy.sh from the real contract. */
const deployedAbi: Abi = JSON.parse(readFileSync(join(__dirname, '../../../../shared/deployments/abi/ClassBadge.json'), 'utf8'));

const signatures = (abi: Abi, type: 'function' | 'event') =>
  abi.filter((item) => item.type === type).map((item) => (type === 'event' ? toEventSignature(item as never) : toFunctionSignature(item as never)));

describe('classBadgeAbi', () => {
  it.each(['function', 'event'] as const)('every %s used by the app exists in the deployed contract', (type) => {
    const deployed = signatures(deployedAbi, type);
    for (const signature of signatures(classBadgeAbi, type)) {
      expect(deployed).toContain(signature);
    }
  });
});
