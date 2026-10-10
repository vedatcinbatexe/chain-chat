import { HubConnectionState, type HubConnection } from '@microsoft/signalr';
import type { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

import { conversationsQueryKey, messagesQueryKey, type MessageDto, type PaymentDto } from '@/api/conversations';
import { createHubConnection } from '@/api/realtime';
import { useLiveStore } from './liveStore';

export type ChatConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export const useChatConnectionStore = create<{ status: ChatConnectionStatus }>()(() => ({ status: 'disconnected' }));
const setStatus = (status: ChatConnectionStatus) => useChatConnectionStore.setState({ status });

let connection: HubConnection | null = null;

/** Adds a message to the cached conversation (if loaded), ignoring duplicates (the sender also receives its echo). */
export function addMessageToCache(queryClient: QueryClient, message: MessageDto) {
  queryClient.setQueryData<MessageDto[]>(messagesQueryKey(message.conversationId), (previous) =>
    previous && !previous.some((m) => m.id === message.id) ? [...previous, message].sort((a, b) => a.id - b.id) : previous,
  );
  queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
}

/** Opens the app's single real-time connection to /hubs/chat (SDD §9). Safe to call more than once. */
export async function startChatConnection(queryClient: QueryClient): Promise<void> {
  if (!connection) {
    connection = createHubConnection('/hubs/chat');
    connection.on('MessageReceived', (message: MessageDto) => addMessageToCache(queryClient, message));
    connection.on('PaymentUpdated', (update: { messageId: number; conversationId: string; payment: PaymentDto }) => {
      queryClient.setQueryData<MessageDto[]>(messagesQueryKey(update.conversationId), (previous) =>
        previous?.map((m) => (m.id === update.messageId ? { ...m, payment: update.payment } : m)),
      );
      // The server says the status changed — re-check the receipt on-chain ourselves.
      queryClient.invalidateQueries({ queryKey: ['payment-check', update.payment.txHash.toLowerCase()] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    });
    connection.on('TypingChanged', (typing: { conversationId: string; address: string; isTyping: boolean }) =>
      useLiveStore.getState().setTyping(typing.conversationId, typing.address, typing.isTyping),
    );
    connection.on('PresenceChanged', (presence: { address: string; online: boolean }) =>
      useLiveStore.getState().setOnline(presence.address, presence.online),
    );
    connection.on('ReactionChanged', (reaction: { messageId: number; conversationId: string; address: string; emoji: string; added: boolean }) => {
      queryClient.setQueryData<MessageDto[]>(messagesQueryKey(reaction.conversationId), (previous) =>
        previous?.map((m) => (m.id === reaction.messageId ? { ...m, reactions: applyReaction(m.reactions ?? [], reaction) } : m)),
      );
    });
    connection.on('ConversationUpdated', (update: { conversationId: string }) => {
      // e.g. a member joined: refetch so new messages are encrypted to the current member list.
      queryClient.invalidateQueries({ queryKey: ['group', update.conversationId.toLowerCase()] });
      queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
    });
    connection.onreconnecting(() => setStatus('reconnecting'));
    connection.onreconnected(() => {
      setStatus('connected');
      // Anything sent while we were offline is in the history: refetch it.
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
    });
    connection.onclose(() => setStatus('disconnected'));
  }

  if (connection.state === HubConnectionState.Disconnected) {
    setStatus('connecting');
    try {
      await connection.start();
      setStatus('connected');
    } catch (error) {
      setStatus('disconnected');
      throw error;
    }
  }
}

export async function stopChatConnection(): Promise<void> {
  const current = connection;
  connection = null;
  await current?.stop();
  setStatus('disconnected');
}

/** Invokes a hub method, connecting first if needed. Hub errors come back as their rejection code (e.g. "SeqGap"). */
export async function invokeChat<T>(method: string, ...args: unknown[]): Promise<T> {
  if (!connection || connection.state !== HubConnectionState.Connected) {
    throw new Error('Not connected to the chat server.');
  }
  try {
    return await connection.invoke<T>(method, ...args);
  } catch (error) {
    const code = error instanceof Error ? /HubException: (\w+)/.exec(error.message)?.[1] : undefined;
    throw code ? new ChatRejectedError(code) : error;
  }
}

/** The server refused a message; `code` is the backend's MessageRejection (SeqGap, InvalidSignature, …). */
export class ChatRejectedError extends Error {
  constructor(readonly code: string) {
    super(`The server rejected the message (${code}).`);
    this.name = 'ChatRejectedError';
  }
}

type Reaction = NonNullable<MessageDto['reactions']>[number];

/** Adds or removes one person's emoji in a message's reaction list, keeping the order emojis were first used. */
export function applyReaction(reactions: Reaction[], change: { address: string; emoji: string; added: boolean }): Reaction[] {
  const address = change.address.toLowerCase();
  const existing = reactions.find((r) => r.emoji === change.emoji);
  if (change.added) {
    if (!existing) return [...reactions, { emoji: change.emoji, addresses: [change.address as Reaction['addresses'][number]] }];
    if (existing.addresses.some((a) => a.toLowerCase() === address)) return reactions;
    return reactions.map((r) => (r === existing ? { ...r, addresses: [...r.addresses, change.address as Reaction['addresses'][number]] } : r));
  }
  if (!existing) return reactions;
  const remaining = existing.addresses.filter((a) => a.toLowerCase() !== address);
  return remaining.length === 0 ? reactions.filter((r) => r !== existing) : reactions.map((r) => (r === existing ? { ...r, addresses: remaining } : r));
}

/** Tells the other participants this user is (or stopped) typing. Fire-and-forget; ignored while offline. */
export function notifyTyping(conversationId: string, isTyping: boolean) {
  if (connection?.state === HubConnectionState.Connected) connection.invoke('Typing', conversationId, isTyping).catch(() => undefined);
}

/** Adds the emoji reaction, or removes it if this user already reacted with it. */
export const toggleReaction = (messageId: number, emoji: string) => invokeChat<void>('React', messageId, emoji);

/** Loads who of `addresses` is online now; later changes arrive as PresenceChanged events. */
export async function loadPresence(addresses: string[]) {
  if (addresses.length === 0 || connection?.state !== HubConnectionState.Connected) return;
  const online = await connection.invoke<string[]>('GetPresence', addresses).catch(() => [] as string[]);
  useLiveStore.getState().setOnlineMany(online);
}
