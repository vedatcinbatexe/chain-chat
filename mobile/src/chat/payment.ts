import type { Address, Hex } from 'viem';

/**
 * Content of a payment message (SDD §6.4). It is encrypted and signed like any message; the transaction hash is
 * also sent to the server in the clear (on-chain transfers are public) so it can check the receipt.
 */
export interface PaymentPayload {
  $chainchat: 'payment';
  v: 1;
  token: 'CHAT';
  /** Amount in wei (decimal string), as claimed by the sender. The on-chain amount is what counts. */
  amount: string;
  txHash: Hex;
  note?: string;
}

export function formatPaymentPayload(payment: Omit<PaymentPayload, '$chainchat' | 'v' | 'token'>): string {
  return JSON.stringify({ $chainchat: 'payment', v: 1, token: 'CHAT', ...payment } satisfies PaymentPayload);
}

/** The payment in a decrypted message, or null for an ordinary text message. */
export function parsePaymentPayload(text: string | null): PaymentPayload | null {
  if (!text?.startsWith('{')) return null;
  try {
    const value = JSON.parse(text) as Partial<PaymentPayload>;
    return value.$chainchat === 'payment' && typeof value.txHash === 'string' && /^\d+$/.test(value.amount ?? '')
      ? (value as PaymentPayload)
      : null;
  } catch {
    return null;
  }
}

export type PaymentCheck =
  | { status: 'pending' }
  | { status: 'confirmed'; amount: bigint; blockNumber: bigint }
  | { status: 'failed'; reason: 'TransactionNotFound' | 'TransactionReverted' | 'NoMatchingTransfer' };

export interface ReceiptSummary {
  succeeded: boolean;
  blockNumber: bigint;
  transfers: { from: Address; to: Address; value: bigint }[];
}

/**
 * Same rules as the backend's PaymentReceiptCheck, run on the phone so it does not have to trust the server:
 * mined, successful, confirmed, and a ChatToken transfer from the sender to the recipient.
 */
export function evaluatePayment(
  from: Address,
  to: Address,
  receipt: ReceiptSummary | null,
  headBlock: bigint,
  confirmations: bigint,
  giveUp: boolean,
): PaymentCheck {
  if (!receipt) return giveUp ? { status: 'failed', reason: 'TransactionNotFound' } : { status: 'pending' };
  if (!receipt.succeeded) return { status: 'failed', reason: 'TransactionReverted' };
  if (headBlock - receipt.blockNumber < confirmations) return { status: 'pending' };

  const amount = receipt.transfers
    .filter((t) => t.from.toLowerCase() === from.toLowerCase() && t.to.toLowerCase() === to.toLowerCase())
    .reduce((sum, t) => sum + t.value, 0n);

  return amount > 0n ? { status: 'confirmed', amount, blockNumber: receipt.blockNumber } : { status: 'failed', reason: 'NoMatchingTransfer' };
}
