import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Text, useTheme } from 'react-native-paper';
import type { Address } from 'viem';

import { buildPortfolio, formatAmount, formatUsd, formatWeight } from '@/chain/portfolio';
import { useBalances } from '@/chain/useBalances';
import { ASSET_ICONS, assetColor } from '@/theme/palette';
import { DonutChart } from './DonutChart';

/**
 * What a wallet holds and how it is split: a ring chart of each asset's share of the estimated value, and one row
 * per asset with its balance. Balances are read directly from the chain.
 */
export function PortfolioCard({ address }: { address: Address | null | undefined }) {
  const theme = useTheme();
  const balances = useBalances(address);

  if (balances.isPending) return <ActivityIndicator style={styles.loader} />;
  if (balances.isError) {
    return (
      <Text variant="bodySmall" style={{ color: theme.colors.error }}>
        Could not read balances from the chain.
      </Text>
    );
  }

  const portfolio = buildPortfolio(balances.data.assets);
  const colored = portfolio.slices.map((slice, index) => ({ ...slice, color: assetColor(slice.symbol, index) }));
  const largest = colored[0];

  return (
    <View style={styles.container}>
      <View style={styles.chartRow}>
        <DonutChart slices={colored.map((slice) => ({ key: slice.symbol, color: slice.color, weight: slice.weight }))} trackColor={theme.colors.surfaceVariant}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Estimated
          </Text>
          <Text variant="titleLarge" style={styles.bold} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {formatUsd(portfolio.total)}
          </Text>
          {portfolio.total > 0 && largest && (
            <Text variant="labelSmall" style={{ color: largest.color }} numberOfLines={1}>
              {formatWeight(largest.weight)} {largest.symbol}
            </Text>
          )}
        </DonutChart>
      </View>

      {/* One stacked bar: the same split as the ring, readable as lengths. */}
      {portfolio.total > 0 && (
        <View style={[styles.stack, { backgroundColor: theme.colors.surfaceVariant }]}>
          {colored
            .filter((slice) => slice.weight > 0)
            .map((slice) => (
              <View key={slice.symbol} style={{ flexGrow: slice.weight, flexBasis: 3, backgroundColor: slice.color }} />
            ))}
        </View>
      )}

      <View style={styles.rows}>
        {colored.map((slice) => (
          <View key={slice.symbol} style={styles.row}>
            <View style={[styles.assetIcon, { backgroundColor: slice.color }]}>
              <Icon source={ASSET_ICONS[slice.symbol] ?? 'circle-multiple-outline'} size={18} color="white" />
            </View>
            <View style={styles.rowText}>
              <Text variant="titleSmall" numberOfLines={1}>
                {slice.symbol}
              </Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                {slice.name}
              </Text>
            </View>
            <View style={styles.rowAmounts}>
              <Text variant="titleSmall" style={styles.bold} numberOfLines={1}>
                {formatAmount(slice.amount)}
              </Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                {formatUsd(slice.value)} · {formatWeight(slice.weight)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text variant="labelSmall" style={[styles.note, { color: theme.colors.outline }]}>
        Balances are read from the blockchain. Values use fixed reference prices — test assets have no market.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  loader: { marginVertical: 32 },
  chartRow: { alignItems: 'center' },
  bold: { fontWeight: '700' },
  stack: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  rows: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  assetIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowAmounts: { alignItems: 'flex-end', maxWidth: '55%' },
  note: { textAlign: 'center' },
});
