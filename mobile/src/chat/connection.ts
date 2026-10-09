import { HubConnectionState, type HubConnection } from '@microsoft/signalr';
import type { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

import { conversationsQueryKey, messagesQueryKey, type MessageDto } from '@/api/conversations';
import { createHubConnection } from '@/api/realtime';

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
