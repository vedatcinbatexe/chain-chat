import type { Hex } from 'viem';

import { parsePaymentPayload } from './payment';

/**
 * Content of a voice message (SDD §6.8). It is encrypted and signed like any message; the audio itself is a
 * separate encrypted file on the server, identified by `id`, opened with `key`, and checked against `hash`.
 */
export interface VoicePayload {
  $chainchat: 'voice';
  v: 1;
  /** The attachment's id on the server. */
  id: string;
  /** The file key (32 bytes). Only the chat's participants ever see it. */
  key: Hex;
  /** keccak256 of the encrypted file: what the server must return. */
  hash: Hex;
  durationMs: number;
  /** Size of the encrypted file in bytes. */
  size: number;
}

/** Longest recording the app makes. */
export const MAX_VOICE_MS = 60_000;

export function formatVoicePayload(voice: Omit<VoicePayload, '$chainchat' | 'v'>): string {
  return JSON.stringify({ $chainchat: 'voice', v: 1, ...voice } satisfies VoicePayload);
}

/** The voice message in a decrypted message, or null for anything else. */
export function parseVoicePayload(text: string | null): VoicePayload | null {
  if (!text?.startsWith('{')) return null;
  try {
    const value = JSON.parse(text) as Partial<VoicePayload>;
    const valid =
      value.$chainchat === 'voice' &&
      typeof value.id === 'string' &&
      /^[0-9a-f]{32}$/.test(value.id) &&
      typeof value.key === 'string' &&
      /^0x[0-9a-fA-F]{64}$/.test(value.key) &&
      typeof value.hash === 'string' &&
      /^0x[0-9a-fA-F]{64}$/.test(value.hash) &&
      typeof value.durationMs === 'number' &&
      value.durationMs >= 0;
    return valid ? { ...(value as VoicePayload), size: typeof value.size === 'number' ? value.size : 0 } : null;
  } catch {
    return null;
  }
}

/** 7400 → "0:07" */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** One line for chat lists and notifications: the text itself, or a description of a voice message. */
export function describeVoice(text: string | null): string | null {
  const voice = parseVoicePayload(text);
  return voice ? `🎤 Voice message (${formatDuration(voice.durationMs)})` : null;
}

/** True for messages whose content is structured (a payment or a voice message) rather than plain text. */
export const isStructuredMessage = (text: string | null) => parsePaymentPayload(text) !== null || parseVoicePayload(text) !== null;
