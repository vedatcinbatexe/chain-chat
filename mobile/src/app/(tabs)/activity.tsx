import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Divider, Icon, Modal, Portal, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { formatUnits, type Hex } from 'viem';

import { useSystemInfo } from '@/api/system';
import { useActivity, useAnchors, type ActivityItem, type ActivityKind, type AnchorActivity } from '@/chain/activity';
import { shorten } from '@/components/CopyableValue';
import { EmptyState } from '@/components/EmptyState';
import { env } from '@/config/env';
import { useWalletStore } from '@/wallet/walletStore';

const ICONS: Record<ActivityKind, string> = {
  registered: 'account-check-outline',
  'key-updated': 'key-change',
  'token-sent': 'arrow-top-right',
  'token-received': 'arrow-bottom-left',
  'token-faucet': 'water',
  'token-minted': 'cash-plus',
  'badge-minted': 'certificate-outline',
  'badge-received': 'certificate-outline',
  'badge-sent': 'certificate-outline',
  'eth-received': 'ethereum',
  'eth-sent': 'arrow-top-right',
};

const amountOf = (wei: bigint | undefined) => (wei === undefined ? '' : Number(formatUnits(wei, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }));
const who = (item: ActivityItem) => (item.counterpartyName ? `@${item.counterpartyName}` : item.counterparty ? shorten(item.counterparty, 6, 4) : 'someone');

/** One line describing what happened, e.g. "Sent 50 CHAT to @bob". */
function describe(item: ActivityItem): string {
  switch (item.kind) {
    case 'registered':
      return `Registered the username @${item.username}`;
    case 'key-updated':
      return 'Updated the encryption key';
    case 'token-sent':
      return `Sent ${amountOf(item.amount)} ${item.symbol} to ${who(item)}`;
    case 'token-received':
      return `Received ${amountOf(item.amount)} ${item.symbol} from ${who(item)}`;
    case 'token-faucet':
      return `Claimed ${amountOf(item.amount)} ${item.symbol} from the faucet`;
    case 'token-minted':
      return `Received ${amountOf(item.amount)} ${item.symbol} (newly minted)`;
    case 'badge-minted':
      return `Received the ${item.badge?.name} badge from an administrator`;
    case 'badge-received':
      return `Received the ${item.badge?.name} badge from ${who(item)}`;
    case 'badge-sent':
      return `Transferred the ${item.badge?.name} badge to ${who(item)}`;
    case 'eth-received':
      return `Received ${amountOf(item.amount)} ETH`;
    case 'eth-sent':
      return `Sent ${amountOf(item.amount)} ETH to ${who(item)}`;
  }
}

const formatTime = (timestamp: number | null) =>
  timestamp === null ? 'time unknown' : new Date(timestamp).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

interface Detail {
  title: string;
  txHash: Hex;
  blockNumber: bigint;
  timestamp: number | null;
  rows: { label: string; value: string }[];
}

export default function ActivityScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const me = useWalletStore((state) => state.address);
  const [tab, setTab] = useState<'mine' | 'anchors'>('mine');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const activity = useActivity(me);
  const anchors = useAnchors();

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['activity'] }), queryClient.invalidateQueries({ queryKey: ['activity-anchors'] })]);
    setRefreshing(false);
  };

  const openItem = (item: ActivityItem) =>
    setDetail({
      title: describe(item),
      txHash: item.txHash,
      blockNumber: item.blockNumber,
      timestamp: item.timestamp,
      rows: [
        ...(item.counterparty ? [{ label: item.kind.endsWith('sent') ? 'To' : 'From', value: item.counterparty }] : []),
        ...(item.badge ? [{ label: 'Badge', value: `${item.badge.name} · token #${item.badge.tokenId}` }] : []),
      ],
    });

  const openAnchor = (anchor: AnchorActivity) =>
    setDetail({
      title: `Anchor batch ${anchor.batchId}`,
      txHash: anchor.txHash,
      blockNumber: anchor.blockNumber,
      timestamp: anchor.timestamp,
      rows: [
        { label: 'Messages', value: `#${anchor.fromMessageId} – #${anchor.toMessageId}` },
        { label: 'Merkle root', value: anchor.root },
      ],
    });

  const query = tab === 'mine' ? activity : anchors;
  const refresh = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <SegmentedButtons
        style={styles.tabs}
        value={tab}
        onValueChange={(value) => setTab(value as 'mine' | 'anchors')}
        buttons={[
          { value: 'mine', label: 'My activity', icon: 'history' },
          { value: 'anchors', label: 'Anchors', icon: 'anchor' },
        ]}
      />
      <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
        {tab === 'mine'
          ? 'Everything this wallet did on-chain, read from the blockchain itself.'
          : 'Merkle roots of the message history, written to the Anchor contract. They are what makes tampering detectable.'}
      </Text>

      {query.isPending ? (
        <ActivityIndicator style={styles.loader} />
      ) : query.isError ? (
        <View style={styles.error}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
            Could not read the blockchain.
          </Text>
          <Button mode="outlined" icon="refresh" onPress={() => query.refetch()}>
            Try again
          </Button>
        </View>
      ) : tab === 'mine' ? (
        <FlatList
          data={activity.data}
          keyExtractor={(item) => item.id}
          refreshControl={refresh}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={<EmptyState icon="history" title="No on-chain activity yet" description="Registering, payments, faucet claims and badges will appear here." />}
          renderItem={({ item }) => (
            <Row
              icon={ICONS[item.kind]}
              tone={item.kind.endsWith('sent') ? 'out' : 'in'}
              title={describe(item)}
              subtitle={`${formatTime(item.timestamp)} · block ${item.blockNumber.toLocaleString()}`}
              onPress={() => openItem(item)}
            />
          )}
        />
      ) : (
        <FlatList
          data={anchors.data}
          keyExtractor={(anchor) => anchor.batchId.toString()}
          refreshControl={refresh}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={<EmptyState icon="anchor" title="Nothing anchored yet" description="The first batch is written to the chain shortly after the first messages." />}
          renderItem={({ item }) => (
            <Row
              icon="anchor"
              tone="in"
              title={`Batch ${item.batchId} · messages #${item.fromMessageId}–#${item.toMessageId}`}
              subtitle={`${formatTime(item.timestamp)} · block ${item.blockNumber.toLocaleString()}`}
              onPress={() => openAnchor(item)}
            />
          )}
        />
      )}

      <DetailSheet detail={detail} onDismiss={() => setDetail(null)} />
    </View>
  );
}

function Row({ icon, tone, title, subtitle, onPress }: { icon: string; tone: 'in' | 'out'; title: string; subtitle: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityHint="Shows the transaction">
      <View style={[styles.rowIcon, { backgroundColor: tone === 'out' ? theme.colors.surfaceVariant : theme.colors.primaryContainer }]}>
        <Icon source={icon} size={20} color={tone === 'out' ? theme.colors.onSurfaceVariant : theme.colors.primary} />
      </View>
      <View style={styles.rowText}>
        <Text variant="bodyLarge" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {subtitle}
        </Text>
      </View>
      <Icon source="chevron-right" size={20} color={theme.colors.outline} />
    </Pressable>
  );
}

/** The transaction behind an entry: block, hash, and a link to the block explorer where one exists. */
function DetailSheet({ detail, onDismiss }: { detail: Detail | null; onDismiss: () => void }) {
  const theme = useTheme();
  const system = useSystemInfo();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!detail) return;
    await Clipboard.setStringAsync(detail.txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const rows = detail
    ? [
        { label: 'Status', value: `Confirmed in block ${detail.blockNumber.toLocaleString()}` },
        { label: 'Time', value: formatTime(detail.timestamp) },
        { label: 'Network', value: system.data ? `${system.data.network} · chain ${system.data.chainId}` : '—' },
        ...detail.rows,
        { label: 'Transaction', value: detail.txHash },
      ]
    : [];

  return (
    <Portal>
      <Modal visible={detail !== null} onDismiss={onDismiss} contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
        <Text variant="titleMedium" style={styles.sheetTitle}>
          {detail?.title}
        </Text>
        <Divider style={styles.sheetDivider} />
        {rows.map((row) => (
          <View key={row.label} style={styles.detailRow}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {row.label}
            </Text>
            <Text variant="bodyMedium" selectable style={row.value.startsWith('0x') ? styles.mono : undefined}>
              {row.value}
            </Text>
          </View>
        ))}
        <View style={styles.sheetActions}>
          <Button mode="contained-tonal" icon={copied ? 'check' : 'content-copy'} onPress={copy}>
            {copied ? 'Copied' : 'Copy transaction hash'}
          </Button>
          {env.explorerUrl ? (
            <Button mode="contained" icon="open-in-new" onPress={() => detail && Linking.openURL(`${env.explorerUrl}/tx/${detail.txHash}`)}>
              Open in block explorer
            </Button>
          ) : (
            <Text variant="labelSmall" style={[styles.centered, { color: theme.colors.onSurfaceVariant }]}>
              The local test chain has no block explorer. On a public network this opens the transaction there.
            </Text>
          )}
          <Button onPress={onDismiss}>Close</Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabs: { marginHorizontal: 16, marginTop: 12 },
  hint: { marginHorizontal: 20, marginTop: 8, marginBottom: 4 },
  loader: { marginTop: 48 },
  error: { alignItems: 'center', gap: 12, marginTop: 48 },
  list: { flexGrow: 1, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  sheet: { marginHorizontal: 20, borderRadius: 24, padding: 20 },
  sheetTitle: { fontWeight: '700' },
  sheetDivider: { marginVertical: 10 },
  detailRow: { gap: 2, marginBottom: 10 },
  mono: { fontFamily: 'Menlo', fontSize: 12 },
  sheetActions: { gap: 8, marginTop: 6 },
  centered: { textAlign: 'center' },
});
