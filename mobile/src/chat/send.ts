import type { Address, Hex } from 'viem';

import type { MessageDto } from '@/api/conversations';
import { isBanned } from '@/api/errors';
import { useSessionStore } from '@/auth/sessionStore';
import { directConversationId, type GroupRecipient } from '@/crypto';
import { getAccount, getEncryptionKeyPair } from '@/wallet/walletStore';
import { loadChainHead, rebuildChainHead, saveChainHead, type ChainHead } from './chainHead';
import { composeGroupMessage, composeMessage, type SendMessageCommand } from './compose';
import { ChatRejectedError, invokeChat } from './connection';

/** Rejections that mean our local chain head is out of date (e.g. after a reinstall) — resync and retry once. */
const STALE_HEAD = new Set(['SeqGap', 'BrokenLink', 'BadGenesis', 'SeqConflict']);

/** One send at a time per conversation, so two quick taps never claim the same seq. */
const queues = new Map<string, Promise<unknown>>();

export interface Peer {
  address: Address;
  /** The peer's X25519 key as read from the Registry contract — never from the backend. */
  encryptionKey: Hex;
}

type Compose = (head: ChainHead) => Promise<{ command: SendMessageCommand; messageHash: Hex; nextHead: ChainHead }>;

/** Encrypts, signs and sends a 1:1 message; resolves with the server's acknowledgement. */
export function sendTextMessage(peer: Peer, text: string, paymentTxHash?: Hex): Promise<MessageDto> {
  const conversationId = directConversationId(getAccount().address, peer.address);
  return enqueue(conversationId, (head) =>
    composeMessage({ account: getAccount(), encryptionSecretKey: getEncryptionKeyPair().secretKey, peer, head, text, paymentTxHash }),
  );
}

/** Encrypts for every member, signs and sends a group message (SDD §6.5). */
export function sendGroupMessage(groupId: Hex, members: GroupRecipient[], text: string): Promise<MessageDto> {
  return enqueue(groupId, (head) =>
    composeGroupMessage({ account: getAccount(), encryptionSecretKey: getEncryptionKeyPair().secretKey, groupId, members, head, text }),
  );
}

function enqueue(conversationId: string, compose: Compose): Promise<MessageDto> {
  const previous = queues.get(conversationId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => send(conversationId, compose))
    .catch((error) => {
      // Blocked while already signed in: show the blocked screen instead of failing message by message.
      if (isBanned(error)) useSessionStore.getState().setBanned(true);
      throw error;
    });
  queues.set(conversationId, next);
  return next;
}

async function send(conversationId: string, compose: Compose): Promise<MessageDto> {
  const account = getAccount();
  const head = await loadChainHead(conversationId, account.address);
  try {
    return await attempt(conversationId, compose, head);
  } catch (error) {
    if (!(error instanceof ChatRejectedError) || !STALE_HEAD.has(error.code)) throw error;
    return attempt(conversationId, compose, await rebuildChainHead(conversationId, account.address));
  }
}

async function attempt(conversationId: string, compose: Compose, head: ChainHead): Promise<MessageDto> {
  const { command, messageHash, nextHead } = await compose(head);

  const stored = await invokeChat<MessageDto>('SendMessage', command);
  if (stored.messageHash.toLowerCase() !== messageHash.toLowerCase()) {
    throw new Error('The server acknowledged a different message.');
  }

  await saveChainHead(conversationId, nextHead);
  return stored;
}
