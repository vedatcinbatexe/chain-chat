import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Text, useTheme } from 'react-native-paper';
import type { Address } from 'viem';

import { useOwnedBadges } from '@/chain/classBadge';

/** One color per badge type, so the same badge looks the same on every profile. */
const MEDALS = ['#f59f00', '#3b5bdb', '#2f9e44', '#c2255c', '#0c8599', '#ae3ec9', '#e8590c'];

interface Props {
  address: Address;
  /** Shown when the wallet holds none, e.g. "No badges yet". */
  emptyText: string;
  /** Tapping a medal opens the full list of badge types. */
  onPress: () => void;
}

/** The badges (ERC-721) a wallet holds, as a row of medals read from the ClassBadge contract. */
export function BadgeShelf({ address, emptyText, onPress }: Props) {
  const theme = useTheme();
  const owned = useOwnedBadges(address);

  if (owned.isPending) return <ActivityIndicator style={styles.loader} />;
  if (!owned.data?.length) {
    return (
      <Pressable onPress={onPress} style={[styles.empty, { borderColor: theme.colors.outlineVariant }]}>
        <Icon source="certificate-outline" size={22} color={theme.colors.outline} />
        <Text variant="bodySmall" style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
          {emptyText}
        </Text>
      </Pressable>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
      {owned.data.map((badge) => {
        const color = MEDALS[badge.type.id % MEDALS.length];
        return (
          <Pressable key={badge.tokenId.toString()} onPress={onPress} style={[styles.medalCard, { backgroundColor: theme.colors.surfaceVariant }]}>
            <View style={[styles.medal, { backgroundColor: color }]}>
              <Icon source="certificate" size={26} color="white" />
            </View>
            <Text variant="labelLarge" style={styles.name} numberOfLines={2}>
              {badge.type.name}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Token #{badge.tokenId.toString()}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loader: { marginVertical: 16 },
  shelf: { gap: 10, paddingRight: 4 },
  medalCard: { width: 116, borderRadius: 18, padding: 12, alignItems: 'center', gap: 6 },
  medal: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  name: { textAlign: 'center', fontWeight: '700' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, padding: 14 },
  emptyText: { flex: 1 },
});
