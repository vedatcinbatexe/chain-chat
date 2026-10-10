import { parseAmountInput } from '../assets';

describe('parseAmountInput', () => {
  it('reads whole and decimal amounts, with a dot or a comma', () => {
    expect(parseAmountInput('5')).toBe(5_000000000000000000n);
    expect(parseAmountInput(' 12.5 ')).toBe(12_500000000000000000n);
    expect(parseAmountInput('0,25')).toBe(250000000000000000n);
    expect(parseAmountInput('0.000000000000000001')).toBe(1n);
  });

  it('rejects zero, negatives, text and too many decimals', () => {
    for (const bad of ['', '0', '0.0', '-1', 'abc', '1e5', '1.', '.5', '1.2.3', '0.0000000000000000001']) {
      expect(parseAmountInput(bad)).toBeNull();
    }
  });
});
