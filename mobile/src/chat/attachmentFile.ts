import { File, Paths } from 'expo-file-system';
import type { Hex } from 'viem';

import { downloadAttachment } from '@/api/attachments';
import { decryptAttachment } from '@/crypto';

/** What a message says about its attachment (SDD §6.8). */
export interface AttachmentRef {
  id: string;
  key: Hex;
  /** keccak256 of the encrypted file, from the signed message. */
  hash: Hex;
}

export type AttachmentFile = { state: 'ready'; uri: string } | { state: 'failed'; reason: string; tampered: boolean };

/**
 * Makes a message's attachment usable on this phone: downloads the encrypted file, checks it against the
 * fingerprint in the signed message, decrypts it, and keeps the result in the app's cache (so the next time it
 * opens instantly). `kind` is only used in the wording of errors.
 */
export async function loadAttachmentFile(ref: AttachmentRef, extension: string, kind: string): Promise<AttachmentFile> {
  const file = new File(Paths.cache, `attachment-${ref.id}.${extension}`);
  if (file.exists) return { state: 'ready', uri: file.uri };

  const blob = await downloadAttachment(ref.id);
  if (!blob) return { state: 'failed', reason: `The ${kind} is no longer on the server.`, tampered: false };

  const result = decryptAttachment(blob, ref.key, ref.hash);
  if (!result.ok) {
    return result.reason === 'tampered'
      ? { state: 'failed', reason: `⚠ This ${kind} does not match the signed message — it was changed after it was sent.`, tampered: true }
      : { state: 'failed', reason: `This ${kind} could not be decrypted.`, tampered: false };
  }

  file.create({ overwrite: true });
  file.write(result.content);
  return { state: 'ready', uri: file.uri };
}
