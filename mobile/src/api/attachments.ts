import { fetch } from 'expo/fetch';

import { ensureSession } from '@/auth/session';
import { env } from '@/config/env';

/** Same limit as the backend (AttachmentEndpoints.MaxBytes). */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/**
 * Encrypted attachment storage (SDD §6.8). Only ciphertext is sent and received here — see crypto/attachment.ts.
 * Uses Expo's fetch, which can send and receive raw bytes.
 */
export async function uploadAttachment(blob: Uint8Array): Promise<string> {
  if (blob.length > MAX_ATTACHMENT_BYTES) throw new Error('This file is too large to send.');
  const { token } = await ensureSession();
  const response = await fetch(`${env.apiUrl}/api/v1/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: blob.slice().buffer, // a plain ArrayBuffer holding exactly these bytes
  });
  if (!response.ok) throw new Error(`The upload failed (${response.status}).`);
  return ((await response.json()) as { id: string }).id;
}

/** The stored bytes of an attachment, or null if the server does not have it. */
export async function downloadAttachment(id: string): Promise<Uint8Array | null> {
  const { token } = await ensureSession();
  const response = await fetch(`${env.apiUrl}/api/v1/attachments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The download failed (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}
