import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import type { Address } from 'viem';

import { useBalances } from '@/chain/useBalances';
import { env } from '@/config/env';

/** ETH, CHAT and ClassBadge holdings of a wallet, read from the chain. */
export function BalancesRow({ address }: { address: Address | null | undefined }) {
  const theme = useTheme();
  const balances = useBalances(address);
  const data = balances.data;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Balance label="ETH" hint="gas" value={data ? formatAmount(data.eth) : undefined} loading={balances.isLoading} />
        <Balance label="CHAT" hint="ERC-20" value={data ? (data.chat === null ? '—' : formatAmount(data.chat)) : undefined} loading={balances.isLoading} />
        <Balance label="Badges" hint="ERC-721" value={data ? (data.badges === null ? '—' : String(data.badges)) : undefined} loading={balances.isLoading} />
      </View>
      {balances.isError && (
        <Text variant="bodySmall" style={{ color: theme.colors.error }}>
          Could not read balances from the chain ({env.rpcUrl}).
        </Text>
      )}
    </View>
  );
}

function Balance({ label, hint, value, loading }: { label: string; hint: string; value: string | undefined; loading: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.balance}>
      <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {label} <Text variant="labelSmall" style={{ color: theme.colors.outline }}>{hint}</Text>
      </Text>
      {loading ? <ActivityIndicator size="small" style={styles.loader} /> : <Text variant="titleLarge">{value ?? '—'}</Text>}
    </View>
  );
}

/** Up to 4 decimals, enough to read a balance at a glance. */
function formatAmount(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: 4 }) : value;
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  row: { flexDirection: 'row', paddingTop: 4 },
  balance: { flex: 1, gap: 4 },
  loader: { alignSelf: 'flex-start' },
});
