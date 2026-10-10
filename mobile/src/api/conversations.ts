import { useQuery } from '@tanstack/react-query';
import type { Address, Hex } from 'viem';

import { authedRequest } from './authed';

/** A stored message as returned by the backend (ChatHub / ConversationEndpoints). uint64 values are decimal strings. */
export interface MessageDto {
  id: number;
  conversationId: Hex;
  sender: Address;
  seq: string;
  prevHash: Hex;
  /** The server's claim — apps recompute it from the fields below and never trust this value alone. */
  messageHash: Hex;
  ciphertext: Hex;
  signature: Hex;
  clientTimestamp: string;
  serverReceivedAt: string;
  /** The server's view of a payment message (apps also check the receipt on-chain themselves). */
  payment?: PaymentDto | null;
  /** Emoji reactions (metadata visible to the server), grouped by emoji. */
  reactions?: ReactionSummary[];
}

export interface ReactionSummary {
  emoji: string;
  addresses: Address[];
}

export interface PaymentDto {
  txHash: Hex;
  status: 'Pending' | 'Confirmed' | 'Failed';
  /** The asset that was paid (ETH, CHAT, tUSD, …), once confirmed. */
  asset?: string | null;
  /** On-chain amount in wei (decimal string), once confirmed. */
  amount: string | null;
  blockNumber: number | null;
  failureReason: string | null;
}

export interface ConversationSummary {
  id: Hex;
  type: 'Direct' | 'Group';
  /** Set for 1:1 conversations. */
  peer: { address: Address; username: string } | null;
  /** Set for groups. */
  group: { name: string; memberCount: number } | null;
  lastMessage: MessageDto | null;
}

export const conversationsQueryKey = ['conversations'] as const;
export const messagesQueryKey = (conversationId: string) => ['messages', conversationId.toLowerCase()] as const;

export function useConversations() {
  return useQuery({
    queryKey: conversationsQueryKey,
    queryFn: () => authedRequest<ConversationSummary[]>('/api/v1/conversations'),
  });
}

/** The latest messages of a conversation, oldest first. Returns [] for a conversation that does not exist yet. */
export async function fetchMessages(conversationId: string, limit = 100): Promise<MessageDto[]> {
  try {
    return await authedRequest<MessageDto[]>(`/api/v1/conversations/${conversationId}/messages?limit=${limit}`);
  } catch (error) {
    if ((error as { status?: number }).status === 404) return [];
    throw error;
  }
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: messagesQueryKey(conversationId ?? ''),
    enabled: !!conversationId,
    queryFn: () => fetchMessages(conversationId!),
  });
}
