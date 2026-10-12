import { describeSwap, formatSwapPayload, parseSwapPayload } from '../swap';

const swap = { orderId: '7', sell: { token: 'tUSD', amount: '100000000000000000000' }, buy: { token: 'tBTC', amount: '2500000000000000' } };

describe('swap payload', () => {
  it('round-trips', () => {
    expect(parseSwapPayload(formatSwapPayload(swap))).toEqual({ $chainchat: 'swap', v: 1, ...swap });
  });

  it('rejects other content and malformed offers', () => {
    expect(parseSwapPayload('want to swap?')).toBeNull();
    expect(parseSwapPayload(null)).toBeNull();
    expect(parseSwapPayload(JSON.stringify({ $chainchat: 'swap', ...swap, orderId: '-1' }))).toBeNull();
    expect(parseSwapPayload(JSON.stringify({ $chainchat: 'swap', ...swap, orderId: 7 }))).toBeNull();
    expect(parseSwapPayload(JSON.stringify({ $chainchat: 'swap', ...swap, sell: { token: 'tUSD', amount: '1.5' } }))).toBeNull();
    expect(parseSwapPayload(JSON.stringify({ $chainchat: 'swap', ...swap, buy: null }))).toBeNull();
    expect(parseSwapPayload(JSON.stringify({ $chainchat: 'swap', ...swap, buy: { token: '<script>', amount: '1' } }))).toBeNull();
  });

  it('describes the offer in one line', () => {
    expect(describeSwap(formatSwapPayload(swap))).toBe('🔁 Swap offer: 100 tUSD for 0.0025 tBTC');
    expect(describeSwap('hello')).toBeNull();
  });
});
