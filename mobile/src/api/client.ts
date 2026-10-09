import { env } from '@/config/env';

/** RFC 9457 ProblemDetails, as returned by the backend's error handler. */
export interface ProblemDetails {
  title?: string;
  status?: number;
  detail?: string;
  errors?: Record<string, string[]>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | null,
  ) {
    super(problem?.title ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

const TIMEOUT_MS = 10_000;

/** JSON request to the ChainChat API; errors become ApiError. For endpoints that need sign-in, use authedRequest. */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  try {
    const response = await fetch(`${env.apiUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
      signal: controller.signal,
    });

    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as ProblemDetails | null;
      throw new ApiError(response.status, problem);
    }

    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  } finally {
    clearTimeout(timeout);
  }
}
