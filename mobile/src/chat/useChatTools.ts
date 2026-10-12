import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Alert, type FlatList } from 'react-native';

import { describeError } from '@/api/errors';
import { deleteMessage, replaceMessageInCache } from './connection';
import { isFiltering, messageBody, messageKind, passesFilter, type MessageFilter } from './content';
import { formatReplyPayload, parseReplyPayload } from './reply';
import { buildRows, type PendingMessage, type Row } from './ui/ChatParts';
import type { MessageAction } from './ui/ReactionPicker';
import type { VerifiedMessage } from './verify';

const NO_FILTER: MessageFilter = { query: '', kind: 'all' };
/** How long a message stays marked after jumping to it. */
const HIGHLIGHT_MS = 2500;

export interface Quote {
  /** Who wrote the quoted message. */
  name: string;
  /** What it said, in one line. */
  body: string;
  /** The quoted message, when it is among the loaded ones. */
  messageId: number | null;
}

interface Options {
  /** The screen's message list, so the tools can scroll it. */
  listRef: RefObject<FlatList<Row> | null>;
  /** Verified messages the user can read, oldest first. */
  messages: VerifiedMessage[];
  pending: PendingMessage[];
  /** "@bob" for an address; the user's own address should give "You". */
  nameOf: (address: string) => string;
  /** A message to scroll to when the chat opens (from the search across all chats). */
  focusId: number | null;
  onVerify: (message: VerifiedMessage) => void;
}

/**
 * What a chat screen needs beyond sending: replying to a message, deleting one's own, searching and filtering the
 * conversation, and jumping to a message. Shared by 1:1 chats and groups.
 */
export function useChatTools({ listRef, messages, pending, nameOf, focusId, onVerify }: Options) {
  const queryClient = useQueryClient();
  const rowsRef = useRef<Row[]>([]);
  const focusPending = useRef(focusId !== null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [replyTo, setReplyTo] = useState<VerifiedMessage | null>(null);
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState<MessageFilter>(NO_FILTER);
  const [highlightedId, setHighlightedId] = useState<number | null>(focusId);

  const filtering = searching && isFiltering(filter);
  const shown = filtering ? messages.filter((message) => passesFilter(message.text, filter)) : messages;
  const rows = buildRows(shown, filtering ? [] : pending);

  const scrollTo = (messageId: number) => {
    const index = rowsRef.current.findIndex((row) => row.kind === 'message' && row.message.dto.id === messageId);
    if (index >= 0) listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
    return index >= 0;
  };

  const clearHighlightLater = () => {
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
  };

  // Keep the rows where callbacks can read them, and scroll to the message the chat was opened for once it is loaded.
  useEffect(() => {
    rowsRef.current = rows;
    if (focusPending.current && focusId !== null && scrollTo(focusId)) {
      focusPending.current = false;
      clearHighlightLater();
    }
  });
  useEffect(() => () => clearTimeout(highlightTimer.current), []);

  /** Leaves the search and shows the message in its place in the conversation. */
  const jumpTo = (messageId: number) => {
    setSearching(false);
    setFilter(NO_FILTER);
    setHighlightedId(messageId);
    clearHighlightLater();
    // After the full list is back on screen.
    setTimeout(() => scrollTo(messageId), 80);
  };

  const byHash = new Map(messages.flatMap((message) => (message.recomputedHash ? [[message.recomputedHash.toLowerCase(), message] as const] : [])));

  /** The message a reply answers, as a quote; null if `message` is not a reply. */
  const quoteOf = (message: VerifiedMessage): Quote | null => {
    const reply = parseReplyPayload(message.text);
    if (!reply) return null;
    const original = byHash.get(reply.to.hash.toLowerCase());
    if (!original) return { name: nameOf(reply.to.sender), body: 'An earlier message', messageId: null };
    return { name: nameOf(original.dto.sender), body: original.deleted ? '🚫 Deleted message' : (messageBody(original.text) ?? '🔒 Encrypted message'), messageId: original.dto.id };
  };

  /** Turns typed text into what is sent: a reply payload while replying, otherwise the text itself. */
  const outgoing = (text: string) => {
    if (!replyTo?.recomputedHash) return text;
    setReplyTo(null);
    return formatReplyPayload({ hash: replyTo.recomputedHash, sender: replyTo.dto.sender }, text);
  };

  const remove = (message: VerifiedMessage) =>
    Alert.alert('Delete for everyone?', 'The content is erased from the server and cannot be brought back. Everyone still sees that a message was deleted, and its proof on the blockchain stays valid.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteMessage(message.dto.id)
            .then((left) => replaceMessageInCache(queryClient, left))
            .catch((error) => Alert.alert('Not deleted', describeError(error, 'The message could not be deleted. Please try again.'))),
      },
    ]);

  /** What the long-press menu offers for a message. */
  const actionsFor = (message: VerifiedMessage): MessageAction[] => {
    if (message.deleted) return [{ icon: 'shield-check-outline', label: 'Verify', onPress: () => onVerify(message) }];
    const kind = messageKind(message.text);
    const plain = message.text !== null && kind === 'text';
    return [
      ...(message.recomputedHash && message.text !== null ? [{ icon: 'reply', label: 'Reply', onPress: () => setReplyTo(message) }] : []),
      ...(plain ? [{ icon: 'content-copy', label: 'Copy text', onPress: () => void Clipboard.setStringAsync(messageBody(message.text) ?? '') }] : []),
      { icon: 'shield-check-outline', label: 'Verify', onPress: () => onVerify(message) },
      // Payments and swap offers stay: they are the record of something that happened on-chain.
      ...(message.mine && kind !== 'payment' && kind !== 'swap' ? [{ icon: 'delete-outline', label: 'Delete for everyone', danger: true, onPress: () => remove(message) }] : []),
    ];
  };

  return {
    rows,
    /** Verified messages minus the ones the search hides. */
    matchCount: shown.length,
    filtering,
    searching,
    filter,
    setFilter,
    openSearch: () => setSearching(true),
    closeSearch: () => {
      setSearching(false);
      setFilter(NO_FILTER);
    },
    highlightedId,
    jumpTo,
    onScrollToIndexFailed: (info: { index: number; averageItemLength: number }) => {
      listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
      setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: false }), 120);
    },
    replyTo,
    replyPreview: replyTo ? { name: nameOf(replyTo.dto.sender), body: messageBody(replyTo.text) ?? '' } : null,
    cancelReply: () => setReplyTo(null),
    outgoing,
    quoteOf,
    actionsFor,
  };
}
