import { previewOf } from '../incoming';

describe('previewOf', () => {
  it('shows the decrypted text, shortened when long', () => {
    expect(previewOf('See you at 5')).toEqual({ body: 'See you at 5', payment: false });
    const long = previewOf('x'.repeat(300));
    expect(long.body).toHaveLength(121);
    expect(long.body.endsWith('…')).toBe(true);
  });

  it('describes a payment instead of showing its payload', () => {
    const payload = JSON.stringify({ $chainchat: 'payment', amount: '10000000000000000000', txHash: `0x${'ab'.repeat(32)}`, note: 'lunch' });
    expect(previewOf(payload)).toEqual({ body: '💸 Sent you 10 CHAT — lunch', payment: true });
  });

  it('never shows anything for a message that could not be decrypted', () => {
    expect(previewOf(null)).toEqual({ body: 'New encrypted message', payment: false });
  });
});
