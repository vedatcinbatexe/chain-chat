import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Divider, Icon, Modal, Portal, Text, useTheme } from 'react-native-paper';
import type { Address } from 'viem';

import { useBadgeTypes, useOwnedBadges } from '@/chain/classBadge';

interface Props {
  /** Whose badges to show. */
  address: Address;
  /** "My badges", "@bob's badges", … */
  title: string;
  visible: boolean;
  onDismiss: () => void;
}

/**
 * Every badge type that exists, and which of them this wallet holds — read from the ClassBadge contract, not
 * from the backend (SDD §6.5). Groups can require badges to join.
 */
export function BadgesSheet({ address, title, visible, onDismiss }: Props) {
  const theme = useTheme();
  const types = useBadgeTypes();
  const owned = useOwnedBadges(visible ? address : null);
  const loading = types.isPending || owned.isPending;
  const held = owned.data?.length ?? 0;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
        <Text variant="titleMedium" style={styles.title}>
          {title}
        </Text>
        <Text variant="bodySmall" style={[styles.centered, { color: theme.colors.onSurfaceVariant }]}>
          Badges are NFTs (ERC-721) in the wallet. A group can require one or more of them to join.
        </Text>

        {loading ? (
          <ActivityIndicator style={styles.loader} />
        ) : types.isError || owned.isError ? (
          <Text variant="bodyMedium" style={[styles.centered, styles.loader, { color: theme.colors.error }]}>
            Could not read badges from the blockchain.
          </Text>
        ) : types.data?.length === 0 ? (
          <Text variant="bodyMedium" style={[styles.centered, styles.loader, { color: theme.colors.onSurfaceVariant }]}>
            No badges exist on this network yet.
          </Text>
        ) : (
          <>
            <Divider style={styles.divider} />
            <ScrollView style={styles.list}>
              {types.data?.map((type) => {
                const mine = owned.data?.filter((badge) => badge.type.id === type.id) ?? [];
                const has = mine.length > 0;
                return (
                  <View key={type.id} style={styles.row}>
                    <View style={[styles.icon, { backgroundColor: has ? theme.colors.primaryContainer : theme.colors.surfaceVariant }]}>
                      <Icon source={has ? 'certificate' : 'lock-outline'} size={20} color={has ? theme.colors.primary : theme.colors.outline} />
                    </View>
                    <View style={styles.rowText}>
                      <Text variant="bodyLarge" numberOfLines={1} style={{ color: has ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}>
                        {type.name}
                      </Text>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {has ? `Held · token ${mine.map((badge) => `#${badge.tokenId}`).join(', ')}` : 'Not held'}
                      </Text>
                    </View>
                    {has && <Icon source="check-circle" size={20} color={theme.colors.primary} />}
                  </View>
                );
              })}
            </ScrollView>
            <Divider style={styles.divider} />
            <Text variant="labelMedium" style={[styles.centered, { color: theme.colors.onSurfaceVariant }]}>
              {held === 0 ? 'No badges held' : `${held} badge${held === 1 ? '' : 's'} held`} · {types.data?.length} type{types.data?.length === 1 ? '' : 's'} exist
            </Text>
          </>
        )}

        <Button mode="contained-tonal" onPress={onDismiss} style={styles.close}>
          Close
        </Button>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: { marginHorizontal: 24, borderRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, gap: 6 },
  title: { fontWeight: '700', textAlign: 'center' },
  centered: { textAlign: 'center' },
  loader: { marginVertical: 24 },
  divider: { marginVertical: 6 },
  list: { maxHeight: 340, flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 56 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  close: { marginTop: 10 },
});
