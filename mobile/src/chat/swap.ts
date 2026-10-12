import { formatUnits } from 'viem';

/**
 * Content of a swap offer message (SDD §6.9): an announcement of an order that exists in the SwapDesk contract.
 * Everything except `orderId` is only the sender's description — the app reads the real terms and the current
 * state from the contract before showing or accepting anything.
 */
export interface SwapPayload {
  $chainchat: 'swap';
  v: 1;
  /** The order's id in the SwapDesk contract (decimal string). */
  orderId: string;
  /** What the maker gives and wants, as claimed: symbols and amounts in wei (decimal strings). */
  sell: { token: string; amount: string };
  buy: { token: string; amount: string };
}

export function formatSwapPayload(swap: Omit<SwapPayload, '$chainchat' | 'v'>): string {
  return JSON.stringify({ $chainchat: 'swap', v: 1, ...swap } satisfies SwapPayload);
}

const isSide = (side: unknown): side is SwapPayload['sell'] => {
  const value = side as Partial<SwapPayload['sell']> | null;
  return !!value && typeof value.token === 'string' && /^[A-Za-z0-9]{1,10}$/.test(value.token) && typeof value.amount === 'string' && /^\d{1,78}$/.test(value.amount);
};

/** The swap offer in a decrypted message, or null for anything else. */
export function parseSwapPayload(text: string | null): SwapPayload | null {
  if (!text?.startsWith('{')) return null;
  try {
    const value = JSON.parse(text) as Partial<SwapPayload>;
    return value.$chainchat === 'swap' && typeof value.orderId === 'string' && /^\d{1,20}$/.test(value.orderId) && isSide(value.sell) && isSide(value.buy) ? (value as SwapPayload) : null;
  } catch {
    return null;
  }
}

export const formatSwapAmount = (wei: bigint | string) => Number(formatUnits(BigInt(wei), 18)).toLocaleString(undefined, { maximumFractionDigits: 6 });

/** One line for chat lists and notifications. */
export function describeSwap(text: string | null): string | null {
  const swap = parseSwapPayload(text);
  return swap ? `🔁 Swap offer: ${formatSwapAmount(swap.sell.amount)} ${swap.sell.token} for ${formatSwapAmount(swap.buy.amount)} ${swap.buy.token}` : null;
}
