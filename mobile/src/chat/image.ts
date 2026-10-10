import type { Hex } from 'viem';

import { describeVoice } from './voice';

/**
 * Content of an image message (SDD §6.8): like a voice message, the picture is a separate encrypted file and the
 * signed message carries its id, key and fingerprint. `mime` tells a photo from an animated GIF.
 */
export interface ImagePayload {
  $chainchat: 'image';
  v: 1;
  id: string;
  key: Hex;
  hash: Hex;
  mime: 'image/jpeg' | 'image/png' | 'image/gif';
  width: number;
  height: number;
  /** Size of the encrypted file in bytes. */
  size: number;
}

const EXTENSIONS: Record<ImagePayload['mime'], string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };

export const imageExtension = (mime: ImagePayload['mime']) => EXTENSIONS[mime];

export function formatImagePayload(image: Omit<ImagePayload, '$chainchat' | 'v'>): string {
  return JSON.stringify({ $chainchat: 'image', v: 1, ...image } satisfies ImagePayload);
}

/** The image in a decrypted message, or null for anything else. */
export function parseImagePayload(text: string | null): ImagePayload | null {
  if (!text?.startsWith('{')) return null;
  try {
    const value = JSON.parse(text) as Partial<ImagePayload>;
    const valid =
      value.$chainchat === 'image' &&
      typeof value.id === 'string' &&
      /^[0-9a-f]{32}$/.test(value.id) &&
      typeof value.key === 'string' &&
      /^0x[0-9a-fA-F]{64}$/.test(value.key) &&
      typeof value.hash === 'string' &&
      /^0x[0-9a-fA-F]{64}$/.test(value.hash) &&
      typeof value.mime === 'string' &&
      Object.hasOwn(EXTENSIONS, value.mime); // not `in`: that would also accept names like "constructor"
    if (!valid) return null;
    // Dimensions only shape the placeholder; nonsense values fall back to a square.
    const side = (n: unknown) => (typeof n === 'number' && n > 0 && n < 20_000 ? n : 0);
    const width = side(value.width);
    const height = side(value.height);
    return { ...(value as ImagePayload), width: width && height ? width : 1, height: width && height ? height : 1, size: typeof value.size === 'number' ? value.size : 0 };
  } catch {
    return null;
  }
}

export function describeImage(text: string | null): string | null {
  const image = parseImagePayload(text);
  return image ? (image.mime === 'image/gif' ? '🎞 GIF' : '📷 Photo') : null;
}

/** One line for chat lists and notifications when the message is a voice message or an image; otherwise null. */
export const describeMedia = (text: string | null) => describeVoice(text) ?? describeImage(text);
