import { useQueries, useQuery, keepPreviousData } from '@tanstack/react-query';

import { fetchMessages, messagesQueryKey, useConversations, type ConversationSummary, type MessageDto } from '@/api/conversations';
import { decrypt, decryptGroupMessage } from '@/crypto';
import { getEncryptionKeyPair, useWalletStore } from '@/wallet/walletStore';
import { useMemberKeys } from './useMemberKeys';

export interface FoundMessage {
  conversation: ConversationSummary;
  dto: MessageDto;
  /** Decrypted on this phone. */
  text: string;
  mine: boolean;
  /** "@bob", or "You". */
  senderName: string;
}

/**
 * The recent messages of every conversation, decrypted on this phone, newest first — what the search across all
 * chats looks through. The server only stores ciphertext and cannot search it, so the phone loads each
 * conversation's latest messages and decrypts them with the senders' keys from the Registry contract. Messages
 * are not signature-checked here; opening the chat verifies them as usual.
 */
export function useAllMessages(enabled: boolean) {
  const me = useWalletStore((state) => state.address);
  const conversations = useConversations();
  const list = enabled ? (conversations.data ?? []) : [];

  const histories = useQueries({
    queries: list.map((conversation) => ({
      queryKey: messagesQueryKey(conversation.id),
      queryFn: () => fetchMessages(conversation.id),
      staleTime: 30_000,
    })),
  });

  const senders = histories.flatMap((history) => history.data?.map((message) => message.sender) ?? []);
  const { keys, ready: keysReady } = useMemberKeys([...list.flatMap((c) => (c.peer ? [c.peer.address] : [])), ...senders]);
  const loaded = histories.every((history) => !history.isPending);

  // Decrypt again only when a conversation's messages or the known keys change.
  const fingerprint = histories.map((history, index) => `${list[index].id}:${history.data?.map((m) => `${m.id}${m.deletedAt ? 'x' : ''}`).join(',') ?? ''}`).join('|');
  const decrypted = useQuery({
    queryKey: ['all-messages', me, fingerprint, Object.keys(keys).sort().join(',')],
    enabled: enabled && !!me && loaded && keysReady,
    placeholderData: keepPreviousData,
    queryFn: (): FoundMessage[] => {
      const secret = getEncryptionKeyPair().secretKey;
      const found: FoundMessage[] = [];
      histories.forEach((history, index) => {
        const conversation = list[index];
        for (const dto of history.data ?? []) {
          if (dto.deletedAt) continue;
          // 1:1 messages use one shared key for both directions (the peer's); group messages the sender's.
          const key = keys[(conversation.peer?.address ?? dto.sender).toLowerCase()];
          if (!key) continue;
          const text = conversation.peer ? decrypt(dto.ciphertext, key.encryptionKey, secret) : decryptGroupMessage(dto.ciphertext, me!, key.encryptionKey, secret);
          if (text === null) continue;
          const mine = dto.sender.toLowerCase() === me!.toLowerCase();
          const sender = keys[dto.sender.toLowerCase()]?.username;
          found.push({ conversation, dto, text, mine, senderName: mine ? 'You' : sender ? `@${sender}` : `${dto.sender.slice(0, 6)}…${dto.sender.slice(-4)}` });
        }
      });
      return found.sort((a, b) => Number(b.dto.clientTimestamp) - Number(a.dto.clientTimestamp));
    },
  });

  return {
    messages: decrypted.data ?? [],
    conversationCount: list.length,
    isLoading: enabled && (conversations.isPending || !decrypted.data),
    isError: conversations.isError || histories.some((history) => history.isError),
  };
}
