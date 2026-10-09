import type { Hex } from 'viem';

import { authedRequest } from './authed';

/** Matches POST /api/v1/drip. */
export interface DripResponse {
  status: 'Sent' | 'AlreadyFunded' | 'AlreadyDripped';
  txHash: Hex | null;
  amountEth: number | null;
}

/** One-time test ETH for the signed-in wallet, so a new wallet can pay for its registration (SDD §6.1). */
export const requestGasDrip = () => authedRequest<DripResponse>('/api/v1/drip', { method: 'POST' });
