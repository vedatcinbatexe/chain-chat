import type { Address, Hex } from 'viem';

/**
 * Content of a payment message (SDD §6.4). It is encrypted and signed like any message; the transaction hash is
 * also sent to the server in the clear (on-chain transfers are public) so it can check the receipt.
 */
export interface PaymentPayload {
  $chainchat: 'payment';
  v: 1;
  /** The asset's symbol (ETH, CHAT, tUSD, …), as claimed by the sender. The chain decides what was really paid. */
  token: string;
  /** Amount in wei (decimal string), as claimed by the sender. The on-chain amount is what counts. */
  amount: string;
  txHash: Hex;
  note?: string;
}

export function formatPaymentPayload(payment: Omit<PaymentPayload, '$chainchat' | 'v' | 'token'> & { token?: string }): string {
  return JSON.stringify({ $chainchat: 'payment', v: 1, token: 'CHAT', ...payment } satisfies PaymentPayload);
}

/** The payment in a decrypted message, or null for an ordinary text message. */
export function parsePaymentPayload(text: string | null): PaymentPayload | null {
  if (!text?.startsWith('{')) return null;
  try {
    const value = JSON.parse(text) as Partial<PaymentPayload>;
    if (value.$chainchat !== 'payment' || typeof value.txHash !== 'string' || !/^\d+$/.test(value.amount ?? '')) return null;
    // Payments sent before other assets existed carry no usable token: they were CHAT.
    const token = typeof value.token === 'string' && /^[A-Za-z0-9]{1,10}$/.test(value.token) ? value.token : 'CHAT';
    return { ...(value as PaymentPayload), token };
  } catch {
    return null;
  }
}

export type PaymentCheck =
  | { status: 'pending' }
  | { status: 'confirmed'; amount: bigint; blockNumber: bigint; asset: string }
  | { status: 'failed'; reason: 'TransactionNotFound' | 'TransactionReverted' | 'NoMatchingTransfer' };

export interface ReceiptSummary {
  succeeded: boolean;
  blockNumber: bigint;
  /** Transfers of supported assets only: token Transfer events, and the ETH the transaction itself carried. */
  transfers: { from: Address; to: Address; value: bigint; asset: string }[];
}

/**
 * Same rules as the backend's PaymentReceiptCheck, run on the phone so it does not have to trust the server:
 * mined, successful, confirmed, and paying the recipient from the sender — in ETH or a supported token. The asset
 * and amount come from the chain, not from the message.
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

  const paid = receipt.transfers.filter((t) => t.value > 0n && t.from.toLowerCase() === from.toLowerCase() && t.to.toLowerCase() === to.toLowerCase());
  if (paid.length === 0) return { status: 'failed', reason: 'NoMatchingTransfer' };

  // A payment is in one asset: the first one the transaction paid (a normal transfer only has one).
  const asset = paid[0].asset;
  const amount = paid.filter((t) => t.asset === asset).reduce((sum, t) => sum + t.value, 0n);
  return { status: 'confirmed', amount, blockNumber: receipt.blockNumber, asset };
}
