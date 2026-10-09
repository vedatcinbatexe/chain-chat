import type { Address, Hex } from 'viem';

import { apiRequest } from './client';

/** Matches POST /api/v1/auth/nonce. */
export interface NonceResponse {
  nonce: string;
  domain: string;
  uri: string;
  chainId: number;
  statement: string;
  expiresAt: string;
}

/** Matches POST /api/v1/auth/verify. */
export interface SessionResponse {
  token: string;
  expiresAt: string;
  address: Address;
}

export const requestNonce = (address: Address) =>
  apiRequest<NonceResponse>('/api/v1/auth/nonce', { method: 'POST', body: JSON.stringify({ address }) });

export const verifySignIn = (message: string, signature: Hex) =>
  apiRequest<SessionResponse>('/api/v1/auth/verify', { method: 'POST', body: JSON.stringify({ message, signature }) });
