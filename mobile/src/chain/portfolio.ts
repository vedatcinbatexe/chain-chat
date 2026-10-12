/**
 * How a wallet's holdings are split between assets. Comparing 3 ETH with 500 CHAT needs a common unit, and test
 * assets on a local chain have no market — so each asset has one fixed reference price in USD. They are for
 * drawing the split only; nothing in the app trades at these prices.
 */
export const REFERENCE_PRICES_USD: Record<string, number> = { ETH: 2500, tBTC: 60_000, tUSD: 1, CHAT: 0.1 };

export interface PortfolioSlice {
  symbol: string;
  name: string;
  /** Whole units held. */
  amount: number;
  /** Estimated value in USD at the reference price; 0 for an asset without one. */
  value: number;
  /** Share of the total value, 0–1. */
  weight: number;
}

export interface Portfolio {
  total: number;
  /** Largest first. */
  slices: PortfolioSlice[];
}

export function buildPortfolio(assets: { symbol: string; name: string; amount: string }[], prices: Record<string, number> = REFERENCE_PRICES_USD): Portfolio {
  const valued = assets.map((asset) => {
    const amount = Number(asset.amount);
    const held = Number.isFinite(amount) ? amount : 0;
    return { symbol: asset.symbol, name: asset.name, amount: held, value: held * (Object.hasOwn(prices, asset.symbol) ? prices[asset.symbol] : 0) };
  });
  const total = valued.reduce((sum, asset) => sum + asset.value, 0);
  const slices = valued.map((asset) => ({ ...asset, weight: total > 0 ? asset.value / total : 0 })).sort((a, b) => b.value - a.value);
  return { total, slices };
}

/** 2,500,000 → "2.5M". Written out by hand: the phone's JavaScript engine does not support compact number formatting. */
function compact(value: number): string {
  const [divisor, suffix] = value >= 1e9 ? [1e9, 'B'] : value >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
  return `${(value / divisor).toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}`;
}

/** "$1,234.50", or "$2.5M" once the number is too long to read at a glance. */
export function formatUsd(value: number): string {
  if (value >= 100_000) return `$${compact(value)}`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: value > 0 && value < 1000 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** "12%", "0.4%", "<0.1%" for a share that is there but tiny, ">99%" for one that is almost everything. */
export function formatWeight(weight: number): string {
  if (weight <= 0) return '0%';
  if (weight < 0.001) return '<0.1%';
  if (weight > 0.99 && weight < 1) return '>99%';
  const percent = weight * 100;
  return `${percent >= 10 ? Math.round(percent) : Number(percent.toFixed(1))}%`;
}

/** Up to 4 decimals, and "2.5M" for very large balances — enough to read a balance at a glance. */
export function formatAmount(value: number): string {
  return value >= 100_000 ? compact(value) : value.toLocaleString('en-US', { maximumFractionDigits: 4 });
}
