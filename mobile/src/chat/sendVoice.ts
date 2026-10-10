import { File } from 'expo-file-system';

import { uploadAttachment } from '@/api/attachments';
import { encryptAttachment } from '@/crypto';
import type { Recording } from './ui/VoiceRecorder';
import { formatVoicePayload } from './voice';

/**
 * Turns a recording into the text of a voice message (SDD §6.8): the audio is encrypted on this phone with a
 * fresh key, only the ciphertext is uploaded, and the returned payload — id, key, fingerprint and length — is
 * then sent like any other message: end-to-end encrypted, signed and hash-chained.
 */
export async function prepareVoiceMessage(recording: Recording): Promise<string> {
  const audio = await new File(recording.uri).bytes();
  if (audio.length === 0) throw new Error('The recording is empty.');

  const encrypted = encryptAttachment(audio);
  const id = await uploadAttachment(encrypted.blob);
  return formatVoicePayload({ id, key: encrypted.key, hash: encrypted.hash, durationMs: Math.round(recording.durationMs), size: encrypted.blob.length });
}
