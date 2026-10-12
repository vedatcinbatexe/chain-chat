import { keccak256, type Address, type Hex } from 'viem';

import { messageHash, messageHashFromCiphertextHash } from '@/crypto';
import { matchesQuery, messageBody, messageKind, passesFilter } from '../content';
import { formatPaymentPayload } from '../payment';
import { formatReplyPayload, parseReplyPayload } from '../reply';

const bob = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
const hash = `0x${'ab'.repeat(32)}` as Hex;

describe('reply payload', () => {
  it('round-trips and names the original by its hash', () => {
    const reply = parseReplyPayload(formatReplyPayload({ hash, sender: bob }, 'sounds good'));
    expect(reply).toMatchObject({ text: 'sounds good', to: { hash, sender: bob } });
  });

  it('rejects plain text and malformed references', () => {
    expect(parseReplyPayload('hello')).toBeNull();
    expect(parseReplyPayload(JSON.stringify({ $chainchat: 'reply', v: 1, to: { hash: '0x12', sender: bob }, text: 'x' }))).toBeNull();
    expect(parseReplyPayload(JSON.stringify({ $chainchat: 'reply', v: 1, to: { hash, sender: 'bob' }, text: 'x' }))).toBeNull();
  });
});

describe('message content', () => {
  const reply = formatReplyPayload({ hash, sender: bob }, 'See you at Noon');
  const payment = formatPaymentPayload({ token: 'tUSD', amount: (5n * 10n ** 18n).toString(), txHash: hash, note: 'lunch' });

  it('shows a reply as its own text and a payment as one line', () => {
    expect(messageBody(reply)).toBe('See you at Noon');
    expect(messageKind(reply)).toBe('text');
    expect(messageKind(payment)).toBe('payment');
    expect(messageBody(payment)).toContain('tUSD — lunch');
    expect(messageBody(null)).toBeNull();
  });

  it('matches every word, ignoring case and order', () => {
    expect(matchesQuery('See you at Noon', 'noon SEE')).toBe(true);
    expect(matchesQuery('See you at Noon', 'noon tomorrow')).toBe(false);
    expect(matchesQuery(null, '')).toBe(true);
  });

  it('filters by kind and text together, and never matches what cannot be read', () => {
    expect(passesFilter(payment, { query: 'lunch', kind: 'payment' })).toBe(true);
    expect(passesFilter(payment, { query: 'lunch', kind: 'text' })).toBe(false);
    expect(passesFilter(null, { query: '', kind: 'all' })).toBe(true);
    expect(passesFilter(null, { query: 'a', kind: 'all' })).toBe(false);
  });
});

describe('deleted message hash', () => {
  it('equals the original hash when computed from the ciphertext fingerprint', () => {
    const header = { conversationId: hash, sender: bob, seq: 2n, prevHash: `0x${'cd'.repeat(32)}` as Hex, clientTimestamp: 1767225600000n };
    const ciphertext = '0xdeadbeef' as Hex;
    expect(messageHashFromCiphertextHash({ ...header, ciphertextHash: keccak256(ciphertext) })).toBe(messageHash({ ...header, ciphertext }));
  });
});
