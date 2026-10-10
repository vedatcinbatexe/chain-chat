import type { QueryClient } from '@tanstack/react-query';
import { formatUnits, type Address } from 'viem';

import { authedRequest } from '@/api/authed';
import { conversationsQueryKey, type ConversationSummary, type MessageDto } from '@/api/conversations';
import { groupQueryKey, type GroupInfo } from '@/api/groups';
import type { SystemInfo } from '@/api/system';
import { useSessionStore } from '@/auth/sessionStore';
import { readRegistration } from '@/chain/registry';
import { parsePaymentPayload } from '@/chat/payment';
import { describeMedia } from '@/chat/image';
import { decrypt, decryptGroupMessage, directConversationId } from '@/crypto';
import { getEncryptionKeyPair, useWalletStore } from '@/wallet/walletStore';
import { notify, useNotificationStore, type NotificationKind } from './store';

/** The server's in-app notification (NotificationDto in the backend's ChatHub). */
export interface ServerNotification {
  kind: 'FundsReceived' | 'BadgeReceived' | 'RemovedFromGroup' | 'AccountBlocked' | 'AccountUnblocked' | 'Announcement' | string;
  title: string;
  body: string;
  conversationId: string | null;
  createdAt: string;
}

const MAX_PREVIEW_LENGTH = 120;

/** What a decrypted message says in a notification: the text, or a line for a payment. */
export function previewOf(text: string | null): { body: string; payment: boolean } {
  if (text === null) return { body: 'New encrypted message', payment: false };
  const payment = parsePaymentPayload(text);
  if (payment) {
    const amount = Number(formatUnits(BigInt(payment.amount), 18)).toLocaleString(undefined, { maximumFractionDigits: 4 });
    return { body: `💸 Sent you ${amount} ${payment.token}${payment.note ? ` — ${payment.note}` : ''}`, payment: true };
  }
  const media = describeMedia(text);
  if (media) return { body: media, payment: false };
  return { body: text.length > MAX_PREVIEW_LENGTH ? `${text.slice(0, MAX_PREVIEW_LENGTH)}…` : text, payment: false };
}

/**
 * Shows a banner for a message that just arrived — unless it is the user's own, or they are already looking at
 * that conversation. The text is decrypted on the phone with the sender's on-chain key; the server never knows
 * what the banner says.
 */
export async function notifyIncomingMessage(queryClient: QueryClient, message: MessageDto): Promise<void> {
  const me = useWalletStore.getState().address;
  if (!me || message.sender.toLowerCase() === me.toLowerCase()) return;
  if (useNotificationStore.getState().activeConversationId === message.conversationId.toLowerCase()) return;

  const isGroup = message.conversationId.toLowerCase() !== directConversationId(me, message.sender).toLowerCase();
  const route = isGroup
    ? ({ pathname: '/group/[id]', params: { id: message.conversationId } } as const)
    : ({ pathname: '/chat/[address]', params: { address: message.sender } } as const);

  try {
    const system = queryClient.getQueryData<SystemInfo>(['system-info']);
    if (!system) throw new Error('System info is not loaded yet');
    const sender = await queryClient.fetchQuery({
      queryKey: ['registration', system.chainId, message.sender.toLowerCase()],
      queryFn: () => readRegistration(system, message.sender as Address),
      staleTime: 60_000,
    });
    const name = sender.username ? `@${sender.username}` : 'Someone';
    const secret = getEncryptionKeyPair().secretKey;

    if (isGroup) {
      const groupName =
        queryClient.getQueryData<ConversationSummary[]>(conversationsQueryKey)?.find((c) => c.id.toLowerCase() === message.conversationId.toLowerCase())?.group?.name ??
        (await queryClient.fetchQuery({ queryKey: groupQueryKey(message.conversationId), queryFn: () => authedRequest<GroupInfo>(`/api/v1/groups/${message.conversationId}`) })).name;
      const text = sender.encryptionKey ? decryptGroupMessage(message.ciphertext, me, sender.encryptionKey, secret) : null;
      notify({ kind: 'message', title: groupName, body: `${name}: ${previewOf(text).body}`, route });
    } else {
      const preview = previewOf(sender.encryptionKey ? decrypt(message.ciphertext, sender.encryptionKey, secret) : null);
      notify({ kind: preview.payment ? 'payment' : 'message', title: name, body: preview.body, route });
    }
  } catch (error) {
    // The chain or the server could not be asked: still tell the user that something arrived.
    console.warn('Could not build the message notification', error);
    notify({ kind: 'message', title: 'New message', body: 'Open the chat to read it.', route });
  }
}

const KINDS: Record<string, NotificationKind> = {
  FundsReceived: 'funds',
  BadgeReceived: 'badge',
  RemovedFromGroup: 'group',
  AccountBlocked: 'account',
  AccountUnblocked: 'account',
  Announcement: 'announcement',
};

/** Shows a server notification and refreshes what it is about (balances, badges, groups). */
export function handleServerNotification(queryClient: QueryClient, notification: ServerNotification): void {
  switch (notification.kind) {
    case 'FundsReceived':
      queryClient.invalidateQueries({ queryKey: ['balances'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      break;
    case 'BadgeReceived':
      queryClient.invalidateQueries({ queryKey: ['balances'] });
      queryClient.invalidateQueries({ queryKey: ['badge'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      break;
    case 'RemovedFromGroup':
      queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
      if (notification.conversationId) queryClient.invalidateQueries({ queryKey: groupQueryKey(notification.conversationId) });
      break;
    case 'AccountBlocked':
      useSessionStore.getState().setBanned(true); // show the blocked screen right away
      break;
  }

  notify({
    kind: KINDS[notification.kind] ?? 'announcement',
    title: notification.title,
    body: notification.body,
    createdAt: Date.parse(notification.createdAt) || undefined,
    route: notification.kind === 'FundsReceived' || notification.kind === 'BadgeReceived' ? '/activity' : undefined,
  });
}
