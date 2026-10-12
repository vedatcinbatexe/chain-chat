import { useTheme } from 'react-native-paper';

/** One fixed color per asset, so ETH is the same blue in every chart and list. */
const ASSET_COLORS: Record<string, string> = { ETH: '#627eea', CHAT: '#845ef7', tUSD: '#2f9e44', tBTC: '#f7931a' };
const FALLBACK = ['#0c8599', '#c2255c', '#e8590c', '#1971c2'];

export function assetColor(symbol: string, index = 0): string {
  return ASSET_COLORS[symbol] ?? FALLBACK[index % FALLBACK.length];
}

export const ASSET_ICONS: Record<string, string> = { ETH: 'ethereum', CHAT: 'cash-multiple', tUSD: 'currency-usd', tBTC: 'bitcoin' };

export interface Tone {
  /** Icons and text. */
  color: string;
  /** The soft background behind them. */
  soft: string;
}

/** Meaning-carrying colors (money in, money out, swaps, badges) that Material's palette has no slot for. */
export function useTones(): Record<'in' | 'out' | 'swap' | 'badge' | 'neutral', Tone> {
  const theme = useTheme();
  const dark = theme.dark;
  return {
    in: dark ? { color: '#69db7c', soft: '#12301c' } : { color: '#2b8a3e', soft: '#dcf5e1' },
    out: dark ? { color: '#ffa94d', soft: '#3a2410' } : { color: '#d9480f', soft: '#ffe8d9' },
    swap: dark ? { color: '#b197fc', soft: '#281f47' } : { color: '#6741d9', soft: '#ebe4ff' },
    badge: dark ? { color: '#ffd43b', soft: '#3a3010' } : { color: '#b97a00', soft: '#fff3bf' },
    neutral: { color: theme.colors.primary, soft: theme.colors.primaryContainer },
  };
}
