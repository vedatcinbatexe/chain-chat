import { createPublicClient, defineChain, http, type PublicClient } from 'viem';

import type { SystemInfo } from '@/api/system';
import { env } from '@/config/env';

const clients = new Map<number, PublicClient>();

/**
 * Read-only blockchain client for the backend's network. The chain id comes from /api/v1/system/info,
 * the RPC URL from env, so the same code works for local Anvil and Base Sepolia.
 * Clients read the chain directly — never through the backend (SDD §4.2).
 */
export function getPublicClient(system: Pick<SystemInfo, 'chainId' | 'network'>): PublicClient {
  let client = clients.get(system.chainId);
  if (!client) {
    const chain = defineChain({
      id: system.chainId,
      name: system.network,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [env.rpcUrl] } },
    });
    client = createPublicClient({ chain, transport: http(env.rpcUrl) }) as PublicClient;
    clients.set(system.chainId, client);
  }
  return client;
}
