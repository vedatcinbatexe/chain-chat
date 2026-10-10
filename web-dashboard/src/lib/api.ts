import { useSession } from './session';

const BASE = '/api/v1/admin';

/** A refused request; `code` is the backend's reason (e.g. "NotAnAdmin", "AmountOutOfRange"). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(MESSAGES[code] ?? code);
    this.name = 'ApiError';
  }
}

const MESSAGES: Record<string, string> = {
  NotAnAdmin: 'This wallet is not an admin.',
  NonceInvalid: 'The sign-in request expired. Please try again.',
  InvalidSignature: 'The signature does not match this wallet.',
  WrongDomain: 'This dashboard address does not match the server configuration (Admin:Domain).',
  WrongUri: 'This dashboard address does not match the server configuration (Admin:Uri).',
  InvalidAddress: 'That is not a valid wallet address.',
  AmountOutOfRange: 'The amount is outside the allowed range.',
  FundingDisabled: 'Funding is not configured on the server.',
  BadgeNotDeployed: 'The ClassBadge contract is not deployed on this network.',
  InvalidBadgeName: 'Enter a badge name of up to 32 characters.',
  BadgeNameTaken: 'A badge with this name already exists.',
  UnknownBadgeType: 'This badge type does not exist.',
  TransactionReverted: 'The transaction was reverted by the contract.',
  CannotBanAnAdmin: 'Admins cannot be banned. Remove them as an admin first.',
  OnlyRootAdmins: 'Only root admins can manage admins.',
  RootAdminsAreConfiguredOnTheServer: 'Root admins are set in the server configuration and cannot be removed here.',
  UserIsBanned: 'This wallet is banned. Unban it first.',
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useSession.getState().session?.token;
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.ok) return (response.status === 204 || response.status === 202 ? undefined : await response.json()) as T;

  // An expired token, or an admin who was removed: back to the sign-in screen.
  if ((response.status === 401 || response.status === 403) && token && !path.startsWith('/auth')) useSession.getState().signOut();

  let code = `Request failed (${response.status})`;
  try {
    const problem = (await response.json()) as { detail?: string; title?: string; errors?: Record<string, string[]> };
    code = Object.values(problem.errors ?? {})[0]?.[0] ?? problem.detail ?? problem.title ?? code;
  } catch {
    // not a JSON body
  }
  throw new ApiError(response.status, code);
}

export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

export function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
}
