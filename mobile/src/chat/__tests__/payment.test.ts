import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toEventSignature, toFunctionSignature, type Abi, type Address } from 'viem';

import { chatTokenAbi } from '@/chain/chatToken';
import { evaluatePayment, formatPaymentPayload, parsePaymentPayload, type ReceiptSummary } from '../payment';

const alice: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const bob: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const carol: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const ten = 10n * 10n ** 18n;
const txHash = `0x${'ab'.repeat(32)}` as const;

type Movement = Omit<ReceiptSummary['transfers'][number], 'asset'> & { asset?: string };
const mined = (...transfers: Movement[]): ReceiptSummary => ({ succeeded: true, blockNumber: 100n, transfers: transfers.map((t) => ({ asset: 'CHAT', ...t })) });
const check = (receipt: ReceiptSummary | null, head = 110n, giveUp = false) => evaluatePayment(alice, bob, receipt, head, 2n, giveUp);

describe('payment payload', () => {
  it('round-trips', () => {
    const text = formatPaymentPayload({ amount: ten.toString(), txHash, note: 'pizza 🍕' });
    expect(parsePaymentPayload(text)).toEqual({ $chainchat: 'payment', v: 1, token: 'CHAT', amount: ten.toString(), txHash, note: 'pizza 🍕' });
  });

  it('treats ordinary text — including other JSON — as not a payment', () => {
    expect(parsePaymentPayload('Hi bob!')).toBeNull();
    expect(parsePaymentPayload('{"hello":"world"}')).toBeNull();
    expect(parsePaymentPayload('{not json')).toBeNull();
    expect(parsePaymentPayload(null)).toBeNull();
    expect(parsePaymentPayload(JSON.stringify({ $chainchat: 'payment', amount: '-5', txHash }))).toBeNull();
  });

  it('carries the asset, and reads payments without one as CHAT', () => {
    expect(parsePaymentPayload(formatPaymentPayload({ token: 'tUSD', amount: '5', txHash }))?.token).toBe('tUSD');
    expect(parsePaymentPayload(JSON.stringify({ $chainchat: 'payment', amount: '5', txHash }))?.token).toBe('CHAT');
    expect(parsePaymentPayload(JSON.stringify({ $chainchat: 'payment', token: '<b>x</b>', amount: '5', txHash }))?.token).toBe('CHAT');
  });
});

describe('evaluatePayment (same rules as the backend)', () => {
  it('confirms a transfer from sender to recipient with the on-chain amount', () => {
    expect(check(mined({ from: alice, to: bob, value: ten }))).toEqual({ status: 'confirmed', amount: ten, blockNumber: 100n, asset: 'CHAT' });
  });

  it('takes the asset from the chain, and does not add different assets together', () => {
    expect(check(mined({ from: alice, to: bob, value: ten, asset: 'ETH' }))).toEqual({ status: 'confirmed', amount: ten, blockNumber: 100n, asset: 'ETH' });
    expect(check(mined({ from: alice, to: bob, value: ten, asset: 'tUSD' }, { from: alice, to: bob, value: ten * 5n, asset: 'CHAT' }))).toEqual({
      status: 'confirmed',
      amount: ten,
      blockNumber: 100n,
      asset: 'tUSD',
    });
    expect(check(mined({ from: alice, to: bob, value: 0n, asset: 'ETH' }))).toEqual({ status: 'failed', reason: 'NoMatchingTransfer' });
  });

  it('waits for the receipt and for confirmations', () => {
    expect(check(null)).toEqual({ status: 'pending' });
    expect(check(mined({ from: alice, to: bob, value: ten }), 101n)).toEqual({ status: 'pending' });
  });

  it('fails a transaction that never appears, or reverted', () => {
    expect(check(null, 110n, true)).toEqual({ status: 'failed', reason: 'TransactionNotFound' });
    expect(check({ succeeded: false, blockNumber: 100n, transfers: [] })).toEqual({ status: 'failed', reason: 'TransactionReverted' });
  });

  it('fails a transaction that does not pay the recipient', () => {
    expect(check(mined({ from: alice, to: carol, value: ten }))).toEqual({ status: 'failed', reason: 'NoMatchingTransfer' });
    expect(check(mined({ from: carol, to: bob, value: ten }))).toEqual({ status: 'failed', reason: 'NoMatchingTransfer' });
    expect(check(mined())).toEqual({ status: 'failed', reason: 'NoMatchingTransfer' });
  });
});

describe('chatTokenAbi', () => {
  const deployed: Abi = JSON.parse(readFileSync(join(__dirname, '../../../../shared/deployments/abi/ChatToken.json'), 'utf8'));
  const signatures = (abi: Abi, type: 'function' | 'event' | 'error') =>
    abi.filter((i) => i.type === type).map((i) => (type === 'event' ? toEventSignature(i as never) : toFunctionSignature(i as never)));

  it.each(['function', 'event', 'error'] as const)('every %s used by the app exists in the deployed contract', (type) => {
    for (const signature of signatures(chatTokenAbi, type)) expect(signatures(deployed, type)).toContain(signature);
  });
});
