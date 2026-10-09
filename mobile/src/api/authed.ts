import { ensureSession, signOut } from '@/auth/session';
import { ApiError, apiRequest } from './client';

/**
 * Request that needs a signed-in wallet. Signs in on demand (SIWE) and, if the token was rejected
 * (e.g. the server restarted), signs in once more and retries.
 */
export async function authedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const withToken = (token: string): RequestInit => ({
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
  });

  try {
    return await apiRequest<T>(path, withToken((await ensureSession()).token));
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    signOut();
    return apiRequest<T>(path, withToken((await ensureSession()).token));
  }
}
