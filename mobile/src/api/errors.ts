import { ApiError } from './client';

/** What the backend's refusal codes mean, in words a user can act on. Codes without an entry fall back to a generic text. */
const MESSAGES: Record<string, string> = {
  // Admin controls (web dashboard)
  Banned: 'This account has been blocked by an administrator.',
  MessagingPaused: 'Messaging is paused by an administrator. Try again later.',
  GroupCreationDisabled: 'Creating new groups is turned off by an administrator.',
  // Groups
  NotAMember: 'You are no longer a member of this group.',
  GroupFull: 'This group is full.',
  GroupNotFound: 'This group does not exist, or you are not a member.',
  InviteNotFound: 'This invite link is not valid anymore.',
  InvalidName: 'Enter a group name of up to 64 characters.',
  NotRegistered: 'Register a username first.',
  // NFT-gated groups
  BadgeRequired: 'Your wallet does not hold every badge this group requires. Ask an administrator to mint the missing badge to your wallet.',
  UnknownBadgeType: 'One of the selected badges does not exist anymore.',
  TooManyBadges: 'A group can require at most 5 badges.',
  BadgeNotAvailable: 'The ClassBadge contract is not deployed on this network.',
  // Messages
  RateLimited: 'You are sending messages too fast. Wait a moment and try again.',
  PaymentTxAlreadyClaimed: 'This payment was already sent in a message.',
  PaymentsNotSupportedInGroups: 'Payments can only be sent in a 1:1 chat.',
};

/** The backend's refusal code (e.g. "Banned"), from a rejected chat message or an API error. */
export function errorCode(error: unknown): string | null {
  if (error instanceof ApiError) return error.problem?.detail ?? null;
  // ChatRejectedError (chat/connection.ts) — matched by shape to keep this module free of chat imports.
  if (error instanceof Error && error.name === 'ChatRejectedError') return (error as Error & { code?: string }).code ?? null;
  return null;
}

export const isBanned = (error: unknown) => errorCode(error) === 'Banned';

/** A sentence for the user. */
export function describeError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const code = errorCode(error);
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (error instanceof ApiError || (error instanceof Error && error.name === 'ChatRejectedError')) return fallback;
  return error instanceof Error && error.message ? error.message : fallback;
}

/** A short reason for a message that was not sent, or null when retrying is the only useful hint. */
export function describeSendFailure(error: unknown): string | null {
  const code = errorCode(error);
  return code && MESSAGES[code] ? MESSAGES[code] : null;
}
