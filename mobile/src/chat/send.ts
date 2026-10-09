import type { Address, Hex } from 'viem';

import type { MessageDto } from '@/api/conversations';
import { directConversationId } from '@/crypto';
import { getAccount, getEncryptionKeyPair } from '@/wallet/walletStore';
import { loadChainHead, rebuildChainHead, saveChainHead, type ChainHead } from './chainHead';
import { composeMessage } from './compose';
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

/** Encrypts, signs and sends a text message; resolves with the server's acknowledgement. */
export function sendTextMessage(peer: Peer, text: string): Promise<MessageDto> {
  const conversationId = directConversationId(getAccount().address, peer.address);
  const previous = queues.get(conversationId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => send(conversationId, peer, text));
  queues.set(conversationId, next);
  return next;
}

async function send(conversationId: string, peer: Peer, text: string): Promise<MessageDto> {
  const account = getAccount();
  const head = await loadChainHead(conversationId, account.address);
  try {
    return await attempt(conversationId, peer, text, head);
  } catch (error) {
    if (!(error instanceof ChatRejectedError) || !STALE_HEAD.has(error.code)) throw error;
    return attempt(conversationId, peer, text, await rebuildChainHead(conversationId, account.address));
  }
}

async function attempt(conversationId: string, peer: Peer, text: string, head: ChainHead): Promise<MessageDto> {
  const { command, messageHash, nextHead } = await composeMessage({
    account: getAccount(),
    encryptionSecretKey: getEncryptionKeyPair().secretKey,
    peer,
    head,
    text,
  });

  const stored = await invokeChat<MessageDto>('SendMessage', command);
  if (stored.messageHash.toLowerCase() !== messageHash.toLowerCase()) {
    throw new Error('The server acknowledged a different message.');
  }

  await saveChainHead(conversationId, nextHead);
  return stored;
}
