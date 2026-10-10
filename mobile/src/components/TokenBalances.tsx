import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Text, useTheme } from 'react-native-paper';
import type { Address } from 'viem';

import { useBalances } from '@/chain/useBalances';

/** ETH, every ERC-20 token and badge holdings as tiles that wrap on narrow screens. Read directly from the chain. */
export function TokenBalances({ address }: { address: Address | null | undefined }) {
  const theme = useTheme();
  const balances = useBalances(address);
  const data = balances.data;

  const ICONS: Record<string, string> = { ETH: 'ethereum', CHAT: 'cash-multiple', tUSD: 'currency-usd', tBTC: 'bitcoin' };
  // Before the first read: placeholders for the assets every deployment has.
  const assets = data?.assets.length ? data.assets : [{ symbol: 'ETH', token: false, amount: undefined }, { symbol: 'CHAT', token: true, amount: undefined }];
  const tiles = [
    ...assets.map((asset) => ({
      icon: ICONS[asset.symbol] ?? 'circle-multiple-outline',
      symbol: asset.symbol,
      kind: asset.token ? 'ERC-20' : 'Gas',
      value: asset.amount === undefined ? undefined : formatAmount(asset.amount),
    })),
    { icon: 'certificate-outline', symbol: 'Badges', kind: 'ERC-721', value: data ? (data.badges === null ? '—' : String(data.badges)) : undefined },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {tiles.map((tile) => (
          <View key={tile.symbol} style={[styles.tile, { backgroundColor: theme.colors.surfaceVariant }]}>
            <View style={styles.tileHeader}>
              <Icon source={tile.icon} size={16} color={theme.colors.primary} />
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                {tile.symbol}
              </Text>
            </View>
            {balances.isLoading ? (
              <ActivityIndicator size="small" style={styles.loader} />
            ) : (
              <Text variant="titleLarge" style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {tile.value ?? '—'}
              </Text>
            )}
            <Text variant="labelSmall" style={{ color: theme.colors.outline }}>
              {tile.kind}
            </Text>
          </View>
        ))}
      </View>
      {balances.isError && (
        <Text variant="bodySmall" style={{ color: theme.colors.error }}>
          Could not read balances from the chain.
        </Text>
      )}
    </View>
  );
}

/** Up to 4 decimals and compact thousands, enough to read a balance at a glance. */
function formatAmount(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number >= 100_000
    ? number.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })
    : number.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: 96, borderRadius: 14, padding: 12, gap: 4 },
  tileHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { fontWeight: '700' },
  loader: { alignSelf: 'flex-start', marginVertical: 6 },
});
