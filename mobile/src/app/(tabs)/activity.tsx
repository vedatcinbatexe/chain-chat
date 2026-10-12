import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Chip, Divider, Icon, Modal, Portal, SegmentedButtons, Surface, Text, useTheme } from 'react-native-paper';
import { formatUnits, type Hex } from 'viem';

import { useSystemInfo } from '@/api/system';
import { useActivity, useAnchors, type ActivityItem, type ActivityKind, type AnchorActivity } from '@/chain/activity';
import { categoryOf, dailyCounts, directionOf, filterActivity, groupByDay, summarize, type ActivityFilter } from '@/chain/activityView';
import { shorten } from '@/components/CopyableValue';
import { EmptyState } from '@/components/EmptyState';
import { env } from '@/config/env';
import { useTones, type Tone } from '@/theme/palette';
import { useWalletStore } from '@/wallet/walletStore';

/** Height of the tallest bar in the 7-day chart. */
const BAR_HEIGHT = 56;

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
  'swap-offered': 'swap-horizontal',
  'swap-completed': 'swap-horizontal-bold',
  'swap-cancelled': 'swap-horizontal',
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
    case 'swap-offered':
      return `Offered ${item.swap?.gave} for ${item.swap?.got} (swap #${item.swap?.id})`;
    case 'swap-completed':
      return `Swapped ${item.swap?.gave} for ${item.swap?.got} with ${who(item)}`;
    case 'swap-cancelled':
      return `Cancelled swap #${item.swap?.id} and got ${item.swap?.gave} back`;
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

type Tones = ReturnType<typeof useTones>;

const FILTERS: { value: ActivityFilter; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: 'format-list-bulleted' },
  { value: 'payments', label: 'Payments', icon: 'cash-multiple' },
  { value: 'swaps', label: 'Swaps', icon: 'swap-horizontal' },
  { value: 'badges', label: 'Badges', icon: 'certificate-outline' },
  { value: 'account', label: 'Account', icon: 'account-check-outline' },
];

/** The color an entry is drawn in: green in, orange out, violet swaps, amber badges. */
function toneOf(item: ActivityItem, tones: Tones) {
  const category = categoryOf(item.kind);
  if (category === 'swaps') return tones.swap;
  if (category === 'badges') return tones.badge;
  if (category === 'account') return tones.neutral;
  return directionOf(item.kind) === 'out' ? tones.out : tones.in;
}

/** A short title and, on the right, the amount that moved — e.g. "Sent to @bob" and "−50 CHAT". */
function present(item: ActivityItem): { title: string; value?: string; note?: string } {
  const amount = `${amountOf(item.amount)} ${item.symbol ?? ''}`.trim();
  switch (item.kind) {
    case 'registered':
      return { title: `Registered @${item.username}` };
    case 'key-updated':
      return { title: 'Updated the encryption key' };
    case 'token-sent':
    case 'eth-sent':
      return { title: `Sent to ${who(item)}`, value: `−${amount}` };
    case 'token-received':
      return { title: `Received from ${who(item)}`, value: `+${amount}` };
    case 'eth-received':
      return { title: 'Received ETH', value: `+${amount}` };
    case 'token-faucet':
      return { title: 'Faucet claim', value: `+${amount}` };
    case 'token-minted':
      return { title: 'Newly minted to you', value: `+${amount}` };
    case 'badge-minted':
      return { title: `${item.badge?.name} badge awarded`, note: `#${item.badge?.tokenId}` };
    case 'badge-received':
      return { title: `${item.badge?.name} badge from ${who(item)}`, note: `#${item.badge?.tokenId}` };
    case 'badge-sent':
      return { title: `${item.badge?.name} badge to ${who(item)}`, note: `#${item.badge?.tokenId}` };
    case 'swap-offered':
      return { title: `Swap offer #${item.swap?.id}`, value: item.swap?.gave, note: `for ${item.swap?.got}` };
    case 'swap-completed':
      return { title: `Swapped with ${who(item)}`, value: `+${item.swap?.got}`, note: `−${item.swap?.gave}` };
    case 'swap-cancelled':
      return { title: `Swap #${item.swap?.id} cancelled`, value: item.swap?.gave, note: 'returned' };
  }
}

const formatClock = (timestamp: number | null) => (timestamp === null ? 'time unknown' : new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));

export default function ActivityScreen() {
  const theme = useTheme();
  const tones = useTones();
  const queryClient = useQueryClient();
  const me = useWalletStore((state) => state.address);
  const [tab, setTab] = useState<'mine' | 'anchors'>('mine');
  const [filter, setFilter] = useState<ActivityFilter>('all');
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
  // "Today" is measured from when the list was read, which keeps rendering free of clock reads.
  const now = activity.dataUpdatedAt;
  const items = activity.data ?? [];
  const sections = groupByDay(filterActivity(items, filter), now);

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
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          refreshControl={refresh}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <View style={styles.header}>
              <SummaryCard items={items} now={now} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                {FILTERS.map((option) => {
                  const selected = filter === option.value;
                  return (
                    <Chip key={option.value} icon={option.icon} selected={selected} showSelectedCheck={false} mode={selected ? 'flat' : 'outlined'} onPress={() => setFilter(option.value)}>
                      {option.label} {filterActivity(items, option.value).length}
                    </Chip>
                  );
                })}
              </ScrollView>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                {section.title}
              </Text>
              <Text variant="labelMedium" style={{ color: theme.colors.outline }}>
                {section.data.length} {section.data.length === 1 ? 'transaction' : 'transactions'}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            items.length === 0 ? (
              <EmptyState icon="history" title="No on-chain activity yet" description="Registering, payments, faucet claims and badges will appear here." />
            ) : (
              <EmptyState icon="filter-off-outline" title="Nothing in this filter" description="Choose another filter to see the rest of your activity." />
            )
          }
          renderItem={({ item }) => {
            const shown = present(item);
            const tone = toneOf(item, tones);
            return (
              <Row
                icon={ICONS[item.kind]}
                tone={tone}
                title={shown.title}
                subtitle={`${formatClock(item.timestamp)} · block ${item.blockNumber.toLocaleString()}`}
                value={shown.value}
                valueColor={directionOf(item.kind) === 'neutral' ? theme.colors.onSurface : tone.color}
                note={shown.note}
                onPress={() => openItem(item)}
              />
            );
          }}
        />
      ) : (
        <FlatList
          data={anchors.data}
          keyExtractor={(anchor) => anchor.batchId.toString()}
          refreshControl={refresh}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<AnchorSummary anchors={anchors.data ?? []} />}
          ListEmptyComponent={<EmptyState icon="anchor" title="Nothing anchored yet" description="The first batch is written to the chain shortly after the first messages." />}
          renderItem={({ item }) => (
            <Row
              icon="anchor"
              tone={tones.neutral}
              title={`Batch ${item.batchId}`}
              subtitle={`${formatTime(item.timestamp)} · block ${item.blockNumber.toLocaleString()}`}
              value={`#${item.fromMessageId}–#${item.toMessageId}`}
              valueColor={theme.colors.onSurface}
              note={shorten(item.root, 6, 4)}
              onPress={() => openAnchor(item)}
            />
          )}
        />
      )}

      <DetailSheet detail={detail} onDismiss={() => setDetail(null)} />
    </View>
  );
}

/** Totals for the wallet and how busy each of the last seven days was. */
function SummaryCard({ items, now }: { items: ActivityItem[]; now: number }) {
  const theme = useTheme();
  const tones = useTones();
  const summary = summarize(items);
  const days = dailyCounts(items, now);
  const busiest = Math.max(1, ...days.map((day) => day.count));
  const stats = [
    { label: 'Received', value: summary.received, icon: 'arrow-bottom-left', tone: tones.in },
    { label: 'Sent', value: summary.sent, icon: 'arrow-top-right', tone: tones.out },
    { label: 'Swaps', value: summary.swaps, icon: 'swap-horizontal', tone: tones.swap },
    { label: 'Badges', value: summary.badges, icon: 'certificate-outline', tone: tones.badge },
  ];

  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1 }]} elevation={0}>
      <View style={styles.stats}>
        {stats.map((stat) => (
          <View key={stat.label} style={[styles.stat, { backgroundColor: stat.tone.soft }]}>
            <Icon source={stat.icon} size={18} color={stat.tone.color} />
            <Text variant="titleLarge" style={[styles.bold, { color: stat.tone.color }]}>
              {stat.value}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
              {stat.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.chartTitle}>
        <Text variant="labelLarge">Last 7 days</Text>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {days.reduce((sum, day) => sum + day.count, 0)} transactions
        </Text>
      </View>
      <View style={styles.bars}>
        {days.map((day, index) => (
          <View key={index} style={styles.barColumn}>
            <Text variant="labelSmall" style={{ color: day.count > 0 ? theme.colors.onSurface : 'transparent' }}>
              {day.count}
            </Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.bar,
                  { height: day.count === 0 ? 4 : Math.max(8, (day.count / busiest) * BAR_HEIGHT), backgroundColor: day.count === 0 ? theme.colors.surfaceVariant : day.today ? theme.colors.primary : theme.colors.primaryContainer },
                ]}
              />
            </View>
            <Text variant="labelSmall" style={{ color: day.today ? theme.colors.primary : theme.colors.onSurfaceVariant, fontWeight: day.today ? '700' : '400' }}>
              {day.label}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="labelSmall" style={[styles.centered, { color: theme.colors.outline }]}>
        Read from the blockchain itself — the server is not asked what happened.
      </Text>
    </Surface>
  );
}

/** What anchoring has covered so far. */
function AnchorSummary({ anchors }: { anchors: AnchorActivity[] }) {
  const theme = useTheme();
  if (anchors.length === 0) return null;
  const latest = anchors[0];
  const messages = anchors.reduce((sum, anchor) => sum + Number(anchor.toMessageId - anchor.fromMessageId) + 1, 0);

  return (
    <Surface style={[styles.card, styles.header, { backgroundColor: theme.colors.elevation.level1 }]} elevation={0}>
      <View style={styles.stats}>
        <View style={[styles.stat, { backgroundColor: theme.colors.primaryContainer }]}>
          <Text variant="titleLarge" style={[styles.bold, { color: theme.colors.onPrimaryContainer }]}>
            {latest.batchId.toString()}
          </Text>
          <Text variant="labelSmall" style={{ color: theme.colors.onPrimaryContainer }}>
            Latest batch
          </Text>
        </View>
        <View style={[styles.stat, { backgroundColor: theme.colors.secondaryContainer }]}>
          <Text variant="titleLarge" style={[styles.bold, { color: theme.colors.onSecondaryContainer }]}>
            {messages.toLocaleString()}
          </Text>
          <Text variant="labelSmall" style={{ color: theme.colors.onSecondaryContainer }}>
            Messages in the last {anchors.length}
          </Text>
        </View>
      </View>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        Merkle roots of the message history, written to the Anchor contract. They are what makes tampering detectable.
      </Text>
    </Surface>
  );
}

interface RowProps {
  icon: string;
  tone: Tone;
  title: string;
  subtitle: string;
  /** The amount on the right, e.g. "+50 CHAT". */
  value?: string;
  valueColor: string;
  /** A second, quieter line under the amount. */
  note?: string;
  onPress: () => void;
}

function Row({ icon, tone, title, subtitle, value, valueColor, note, onPress }: RowProps) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.row, { backgroundColor: theme.colors.elevation.level1 }]} accessibilityHint="Shows the transaction">
      <View style={[styles.rowIcon, { backgroundColor: tone.soft }]}>
        <Icon source={icon} size={20} color={tone.color} />
      </View>
      <View style={styles.rowText}>
        <Text variant="titleSmall" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {(value || note) && (
        <View style={styles.rowValue}>
          {value && (
            <Text variant="titleSmall" style={[styles.bold, { color: valueColor }]} numberOfLines={1}>
              {value}
            </Text>
          )}
          {note && (
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
              {note}
            </Text>
          )}
        </View>
      )}
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
  tabs: { marginHorizontal: 16, marginTop: 12, marginBottom: 4 },
  loader: { marginTop: 48 },
  error: { alignItems: 'center', gap: 12, marginTop: 48 },
  list: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  header: { gap: 12, marginBottom: 4 },
  card: { borderRadius: 20, padding: 16, gap: 14 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, minWidth: 0, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 2 },
  bold: { fontWeight: '700' },
  chartTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bars: { flexDirection: 'row', gap: 8 },
  barColumn: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: { height: BAR_HEIGHT, alignSelf: 'stretch', justifyContent: 'flex-end' },
  bar: { borderRadius: 6 },
  filters: { gap: 8, paddingRight: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, marginBottom: 8, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, marginBottom: 8 },
  rowIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowValue: { alignItems: 'flex-end', maxWidth: '45%', gap: 2 },
  sheet: { marginHorizontal: 20, borderRadius: 24, padding: 20 },
  sheetTitle: { fontWeight: '700' },
  sheetDivider: { marginVertical: 10 },
  detailRow: { gap: 2, marginBottom: 10 },
  mono: { fontFamily: 'Menlo', fontSize: 12 },
  sheetActions: { gap: 8, marginTop: 6 },
  centered: { textAlign: 'center' },
});
