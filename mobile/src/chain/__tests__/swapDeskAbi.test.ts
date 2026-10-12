import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toEventSignature, toFunctionSignature, type Abi } from 'viem';

import { swapDeskAbi } from '../swapDesk';

/** The ABI exported by contracts/deploy.sh from the real contract. */
const deployedAbi: Abi = JSON.parse(readFileSync(join(__dirname, '../../../../shared/deployments/abi/SwapDesk.json'), 'utf8'));

const signatures = (abi: Abi, type: 'function' | 'event' | 'error') =>
  abi.filter((item) => item.type === type).map((item) => (type === 'event' ? toEventSignature(item as never) : toFunctionSignature(item as never)));

describe('swapDeskAbi', () => {
  it.each(['function', 'event', 'error'] as const)('every %s used by the app exists in the deployed contract', (type) => {
    const deployed = signatures(deployedAbi, type);
    for (const signature of signatures(swapDeskAbi, type)) {
      expect(deployed).toContain(signature);
    }
  });
});
