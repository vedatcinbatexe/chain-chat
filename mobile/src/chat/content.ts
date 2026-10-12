import { formatUnits } from 'viem';

import { describeMedia, parseImagePayload } from './image';
import { parsePaymentPayload } from './payment';
import { parseReplyPayload } from './reply';
import { parseSwapPayload } from './swap';
import { parseVoicePayload } from './voice';

/** What a decrypted message is, for filters. A reply counts as text. */
export type MessageKind = 'text' | 'photo' | 'voice' | 'payment' | 'swap';

export function messageKind(text: string | null): MessageKind {
  if (parsePaymentPayload(text)) return 'payment';
  if (parseVoicePayload(text)) return 'voice';
  if (parseImagePayload(text)) return 'photo';
  if (parseSwapPayload(text)) return 'swap';
  return 'text';
}

/**
 * A decrypted message in words — what chat lists, notifications, quotes and search show and match against:
 * the text itself (for a reply, the answer), or one line for a payment, picture, voice message or swap offer.
 * Null if the message could not be decrypted.
 */
export function messageBody(text: string | null): string | null {
  if (text === null) return null;
  const payment = parsePaymentPayload(text);
  if (payment) {
    const amount = Number(formatUnits(BigInt(payment.amount), 18)).toLocaleString(undefined, { maximumFractionDigits: 4 });
    return `💸 ${amount} ${payment.token}${payment.note ? ` — ${payment.note}` : ''}`;
  }
  return describeMedia(text) ?? parseReplyPayload(text)?.text ?? text;
}

/** Case-insensitive match of every word of the query, in any order. An empty query matches everything. */
export function matchesQuery(body: string | null, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  if (body === null) return false;
  const haystack = body.toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}

export interface MessageFilter {
  query: string;
  kind: MessageKind | 'all';
}

export const isFiltering = (filter: MessageFilter) => filter.kind !== 'all' || filter.query.trim().length > 0;

/** Whether a decrypted message passes the search box and the kind filter. Deleted and undecryptable messages never match a filter. */
export function passesFilter(text: string | null, filter: MessageFilter): boolean {
  if (!isFiltering(filter)) return true;
  if (text === null) return false;
  return (filter.kind === 'all' || messageKind(text) === filter.kind) && matchesQuery(messageBody(text), filter.query);
}

export const KIND_FILTERS: { value: MessageFilter['kind']; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: 'format-list-bulleted' },
  { value: 'text', label: 'Text', icon: 'message-text-outline' },
  { value: 'photo', label: 'Photos', icon: 'image-outline' },
  { value: 'voice', label: 'Voice', icon: 'microphone-outline' },
  { value: 'payment', label: 'Payments', icon: 'cash-multiple' },
  { value: 'swap', label: 'Swaps', icon: 'swap-horizontal' },
];
