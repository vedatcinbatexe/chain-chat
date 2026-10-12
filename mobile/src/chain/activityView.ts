import type { ActivityItem, ActivityKind } from './activity';

/** How the Activity screen sorts on-chain events into filters, days and totals. Pure functions over the list read from the chain. */
export type ActivityCategory = 'payments' | 'swaps' | 'badges' | 'account';
export type ActivityFilter = 'all' | ActivityCategory;
export type ActivityDirection = 'in' | 'out' | 'neutral';

const CATEGORIES: Record<ActivityKind, ActivityCategory> = {
  registered: 'account',
  'key-updated': 'account',
  'token-sent': 'payments',
  'token-received': 'payments',
  'token-faucet': 'payments',
  'token-minted': 'payments',
  'eth-received': 'payments',
  'eth-sent': 'payments',
  'badge-minted': 'badges',
  'badge-received': 'badges',
  'badge-sent': 'badges',
  'swap-offered': 'swaps',
  'swap-completed': 'swaps',
  'swap-cancelled': 'swaps',
};

export const categoryOf = (kind: ActivityKind): ActivityCategory => CATEGORIES[kind];

/** Whether something came into the wallet, left it, or neither (registering, swaps — which do both). */
export function directionOf(kind: ActivityKind): ActivityDirection {
  const category = CATEGORIES[kind];
  if (category === 'swaps' || category === 'account') return 'neutral';
  return kind.endsWith('sent') ? 'out' : 'in';
}

export const filterActivity = <T extends { kind: ActivityKind }>(items: T[], filter: ActivityFilter): T[] => (filter === 'all' ? items : items.filter((item) => CATEGORIES[item.kind] === filter));

const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Whole days between two moments by the calendar: 23:50 and 00:10 the next day are one day apart. */
const daysBetween = (earlier: number, later: number) => Math.round((startOfDay(later) - startOfDay(earlier)) / DAY_MS);

/** "Today", "Yesterday", or the date. */
export function dayTitle(timestamp: number | null, now: number): string {
  if (timestamp === null) return 'Date unknown';
  const days = daysBetween(timestamp, now);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  return new Date(timestamp).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
}

/** Splits a newest-first list into one section per day, keeping the order. */
export function groupByDay<T extends { timestamp: number | null }>(items: T[], now: number): { title: string; data: T[] }[] {
  const sections = new Map<string, T[]>();
  for (const item of items) {
    const title = dayTitle(item.timestamp, now);
    const section = sections.get(title);
    if (section) section.push(item);
    else sections.set(title, [item]);
  }
  return [...sections].map(([title, data]) => ({ title, data }));
}

export interface ActivitySummary {
  /** Payments and tokens that came in. */
  received: number;
  /** Payments that went out. */
  sent: number;
  /** Swaps that were completed. */
  swaps: number;
  /** Badges that came in. */
  badges: number;
}

export function summarize(items: Pick<ActivityItem, 'kind'>[]): ActivitySummary {
  const summary = { received: 0, sent: 0, swaps: 0, badges: 0 };
  for (const { kind } of items) {
    const category = CATEGORIES[kind];
    if (category === 'payments') summary[directionOf(kind) === 'out' ? 'sent' : 'received']++;
    else if (kind === 'swap-completed') summary.swaps++;
    else if (category === 'badges' && directionOf(kind) === 'in') summary.badges++;
  }
  return summary;
}

export interface DayCount {
  /** "Mon", "Tue", … */
  label: string;
  count: number;
  today: boolean;
}

/** How many events happened on each of the last `days` days, oldest first, ending today. */
export function dailyCounts(items: Pick<ActivityItem, 'timestamp'>[], now: number, days = 7): DayCount[] {
  const counts = new Array<number>(days).fill(0);
  for (const { timestamp } of items) {
    if (timestamp === null) continue;
    const ago = daysBetween(timestamp, now);
    if (ago >= 0 && ago < days) counts[days - 1 - ago]++;
  }
  const today = startOfDay(now);
  return counts.map((count, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - 1 - index));
    return { label: date.toLocaleDateString(undefined, { weekday: 'short' }), count, today: index === days - 1 };
  });
}
