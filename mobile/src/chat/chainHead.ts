import * as SecureStore from 'expo-secure-store';
import type { Address, Hex } from 'viem';

import { fetchMessages } from '@/api/conversations';
import { ZERO_HASH } from '@/crypto';

/** The last message this device sent in a conversation — the link for the next one (SPEC.md §4, SDD §7.1). */
export interface ChainHead {
  seq: bigint;
  messageHash: Hex;
}

const storageKey = (conversationId: string) => `chainchat.chain.${conversationId.toLowerCase()}`;

export const GENESIS: ChainHead = { seq: 0n, messageHash: ZERO_HASH };

/**
 * The device's own chain head for a conversation. Stored locally so the next message links correctly without
 * trusting the server; rebuilt from the server's history only when missing (first message, reinstall).
 */
export async function loadChainHead(conversationId: string, me: Address): Promise<ChainHead> {
  const stored = await SecureStore.getItemAsync(storageKey(conversationId));
  if (stored) {
    const { seq, messageHash } = JSON.parse(stored) as { seq: string; messageHash: Hex };
    return { seq: BigInt(seq), messageHash };
  }
  return rebuildChainHead(conversationId, me);
}

/** Rebuilds the head from the server's history (the messages carry my signature, so they are verifiably mine). */
export async function rebuildChainHead(conversationId: string, me: Address): Promise<ChainHead> {
  const mine = (await fetchMessages(conversationId, 200)).filter((m) => m.sender.toLowerCase() === me.toLowerCase());
  const last = mine.reduce<(typeof mine)[number] | null>((best, m) => (!best || BigInt(m.seq) > BigInt(best.seq) ? m : best), null);
  const head = last ? { seq: BigInt(last.seq), messageHash: last.messageHash } : GENESIS;
  await saveChainHead(conversationId, head);
  return head;
}

export async function saveChainHead(conversationId: string, head: ChainHead): Promise<void> {
  await SecureStore.setItemAsync(storageKey(conversationId), JSON.stringify({ seq: head.seq.toString(), messageHash: head.messageHash }));
}
