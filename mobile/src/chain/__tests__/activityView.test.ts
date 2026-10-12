import { dailyCounts, dayTitle, directionOf, filterActivity, groupByDay, summarize } from '../activityView';
import { buildPortfolio, formatWeight } from '../portfolio';

const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();
const now = at(12, 15);

describe('activity view', () => {
  it('names days by the calendar, not by 24-hour distance', () => {
    expect(dayTitle(at(12, 0), now)).toBe('Today');
    expect(dayTitle(at(11, 23), now)).toBe('Yesterday');
    expect(dayTitle(null, now)).toBe('Date unknown');
    expect(dayTitle(at(5, 10), now)).not.toMatch(/Today|Yesterday/);
  });

  it('groups a newest-first list into day sections in order', () => {
    const sections = groupByDay([{ timestamp: at(12, 14) }, { timestamp: at(12, 9) }, { timestamp: at(11, 20) }], now);
    expect(sections.map((section) => [section.title, section.data.length])).toEqual([['Today', 2], ['Yesterday', 1]]);
  });

  it('counts what came in, went out, swaps and badges', () => {
    const kinds = ['token-received', 'token-faucet', 'eth-sent', 'swap-offered', 'swap-completed', 'badge-minted', 'badge-sent', 'registered'] as const;
    expect(summarize(kinds.map((kind) => ({ kind })))).toEqual({ received: 2, sent: 1, swaps: 1, badges: 1 });
    expect(directionOf('swap-completed')).toBe('neutral');
    expect(filterActivity(kinds.map((kind) => ({ kind })), 'swaps')).toHaveLength(2);
  });

  it('counts events per day for the last week, ending today', () => {
    const counts = dailyCounts([{ timestamp: at(12, 1) }, { timestamp: at(12, 2) }, { timestamp: at(10, 5) }, { timestamp: at(1, 5) }, { timestamp: null }], now);
    expect(counts.map((day) => day.count)).toEqual([0, 0, 0, 0, 1, 0, 2]);
    expect(counts[6].today).toBe(true);
  });
});

describe('buildPortfolio', () => {
  it('weights assets by value at the reference prices, largest first', () => {
    const portfolio = buildPortfolio(
      [
        { symbol: 'CHAT', name: 'ChainChat Token', amount: '1000' },
        { symbol: 'ETH', name: 'Ether', amount: '2' },
        { symbol: 'NEW', name: 'Unpriced', amount: '5' },
      ],
      { ETH: 450, CHAT: 0.1 },
    );
    expect(portfolio.total).toBe(1000);
    expect(portfolio.slices.map((slice) => [slice.symbol, slice.weight])).toEqual([['ETH', 0.9], ['CHAT', 0.1], ['NEW', 0]]);
  });

  it('has no weights for an empty wallet', () => {
    expect(buildPortfolio([{ symbol: 'ETH', name: 'Ether', amount: '0' }]).slices[0].weight).toBe(0);
    expect(formatWeight(0.0004)).toBe('<0.1%');
    expect(formatWeight(0.256)).toBe('26%');
  });
});
