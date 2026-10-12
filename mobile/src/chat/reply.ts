import { isAddress, type Address, type Hex } from 'viem';

/**
 * Content of a reply. Like every message it is encrypted and signed, so the server cannot see which message is
 * answered. The original is named by its message hash — the same value the sender signed and that gets anchored —
 * and no copy of its text is carried along: if the original is deleted later, the quote disappears with it.
 */
export interface ReplyPayload {
  $chainchat: 'reply';
  v: 1;
  to: { hash: Hex; sender: Address };
  text: string;
}

export function formatReplyPayload(to: ReplyPayload['to'], text: string): string {
  return JSON.stringify({ $chainchat: 'reply', v: 1, to, text } satisfies ReplyPayload);
}

/** The reply in a decrypted message, or null for anything else. */
export function parseReplyPayload(text: string | null): ReplyPayload | null {
  if (!text?.startsWith('{')) return null;
  try {
    const value = JSON.parse(text) as Partial<ReplyPayload>;
    const valid =
      value.$chainchat === 'reply' &&
      typeof value.text === 'string' &&
      typeof value.to?.hash === 'string' &&
      /^0x[0-9a-fA-F]{64}$/.test(value.to.hash) &&
      typeof value.to.sender === 'string' &&
      isAddress(value.to.sender);
    return valid ? (value as ReplyPayload) : null;
  } catch {
    return null;
  }
}
