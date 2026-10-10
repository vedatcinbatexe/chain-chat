import { formatUnits } from 'viem';

/** 0x1234…abcd */
export const shorten = (value: string, head = 6, tail = 4) => (value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`);

/** Wei (decimal string) → "1,234.5" in whole units, at most `digits` decimals. */
export function formatAmount(wei: string | null | undefined, digits = 4): string {
  if (wei === null || wei === undefined) return '—';
  return Number(formatUnits(BigInt(wei), 18)).toLocaleString('en-US', { maximumFractionDigits: digits });
}

export const formatNumber = (value: number) => value.toLocaleString('en-US');

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export const displayName = (username: string | null | undefined, address: string) => (username ? `@${username}` : shorten(address));
