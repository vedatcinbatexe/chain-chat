import type { Hex } from 'viem';

import { authedRequest } from './authed';

/** Matches GET /api/v1/messages/{id}/proof. */
export interface MessageProof {
  messageId: number;
  status: 'NotAnchored' | 'Pending' | 'Anchored';
  messageHash: Hex;
  leafIndex: number | null;
  proof: Hex[] | null;
  batch: {
    chainBatchId: number;
    root: Hex;
    fromMessageId: number;
    toMessageId: number;
    txHash: Hex;
    blockNumber: number;
  } | null;
  anchorIntervalSeconds: number;
}

export const getMessageProof = (messageId: number) => authedRequest<MessageProof>(`/api/v1/messages/${messageId}/proof`);

/** Asks the server to anchor pending messages now (demo helper; rate-limited). */
export const requestAnchorRun = () => authedRequest<{ requested: boolean }>('/api/v1/anchoring/run', { method: 'POST' });
