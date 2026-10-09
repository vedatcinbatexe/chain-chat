import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, IconButton, ProgressBar, Surface, Text, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatUnits, type Address, type Hex } from 'viem';

import { useMessages } from '@/api/conversations';
import { useSystemInfo } from '@/api/system';
import { transferChat } from '@/chain/chatToken';
import { addMessageToCache, useChatConnectionStore } from '@/chat/connection';
import { formatPaymentPayload, parsePaymentPayload } from '@/chat/payment';
import { PaymentContent } from '@/chat/PaymentContent';
import { sendTextMessage } from '@/chat/send';
import { SendPaymentSheet } from '@/chat/SendPaymentSheet';
import { formatMessageTime, usePeer } from '@/chat/usePeer';
import { verifyMessages, type VerifiedMessage } from '@/chat/verify';
import { VerifySheet } from '@/chat/VerifySheet';
import { DismissKeyboard } from '@/components/DismissKeyboard';
import { ErrorScreen, LoadingScreen } from '@/components/StatusScreens';
import { UserAvatar } from '@/components/UserAvatar';
import { directConversationId } from '@/crypto';
import { getEncryptionKeyPair, useWalletStore } from '@/wallet/walletStore';

const MAX_LENGTH = 2000;
/** iOS standard navigation bar height (below the status bar); the screen's header is a regular Stack header. */
const IOS_HEADER_HEIGHT = 44;
/** Messages from the same sender within this window are grouped (tighter spacing, one tail). */
const GROUP_WINDOW_MS = 3 * 60 * 1000;

/** Local ids for messages that are still being sent. */
let pendingCounter = 0;
const nextPendingKey = () => `pending-${++pendingCounter}`;

interface PendingMessage {
  key: string;
  text: string;
  paymentTxHash?: Hex;
  failed: boolean;
}

type Row =
  | { kind: 'message'; message: VerifiedMessage; groupedWithNext: boolean }
  | { kind: 'pending'; pending: PendingMessage }
  | { kind: 'day'; label: string; key: string };

export default function ChatScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { address } = useLocalSearchParams<{ address: string }>();
  const me = useWalletStore((state) => state.address)!;
  const connection = useChatConnectionStore((state) => state.status);
  const { peer, isLoading, isError, notRegistered, refetch } = usePeer(address);

  const conversationId = useMemo(() => directConversationId(me, address as Address), [me, address]);
  const messages = useMessages(conversationId);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [selected, setSelected] = useState<VerifiedMessage | null>(null);
  const [paying, setPaying] = useState(false);
  const system = useSystemInfo();

  // Verify and decrypt on this phone; re-run whenever the message list or the peer's on-chain key changes.
  const verified = useQuery({
    queryKey: ['verified', conversationId, messages.data?.map((m) => m.id).join(','), peer?.encryptionKey],
    enabled: !!messages.data && !!peer,
    queryFn: () => verifyMessages(messages.data!, me, peer!.encryptionKey, getEncryptionKeyPair().secretKey),
    placeholderData: keepPreviousData,
  });

  if (isLoading) return <LoadingScreen label="Reading their key from the blockchain…" />;
  if (isError) return <ErrorScreen message="Could not read this user from the Registry contract." onRetry={() => refetch()} />;
  if (notRegistered || !peer) return <ErrorScreen message="This address is not registered on ChainChat." onRetry={() => refetch()} />;

  const send = (text: string, key = nextPendingKey(), paymentTxHash?: Hex) => {
    setPending((previous) => [...previous.filter((p) => p.key !== key), { key, text, paymentTxHash, failed: false }]);
    sendTextMessage(peer, text, paymentTxHash)
      .then((stored) => {
        addMessageToCache(queryClient, stored);
        setPending((previous) => previous.filter((p) => p.key !== key));
      })
      .catch((error) => {
        console.warn('Send failed', error);
        setPending((previous) => previous.map((p) => (p.key === key ? { ...p, failed: true } : p)));
      });
  };

  /** SDD §6.4: transfer on-chain from this wallet first, then announce it in the chat with the tx hash. */
  const sendPayment = async (amount: bigint, note: string) => {
    const txHash = await transferChat(system.data!, peer.address, amount);
    send(formatPaymentPayload({ amount: amount.toString(), txHash, ...(note ? { note } : {}) }), undefined, txHash);
  };

  const onSend = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    send(text);
  };

  const rows = buildRows(verified.data ?? [], pending);
  // History loads in two steps: fetch from the server, then verify + decrypt on this phone.
  // Until both are done, show a loading state instead of the empty "say hello" card.
  const loadingHistory = messages.isPending || (!!messages.data?.length && !verified.data);
  const connected = connection === 'connected';

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + IOS_HEADER_HEIGHT : 0}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable style={styles.headerTitle} onPress={() => router.push({ pathname: '/user/[address]', params: { address: peer.address } })}>
              <UserAvatar username={peer.username} address={peer.address} size={34} />
              <View>
                <Text variant="titleMedium" style={styles.headerName} numberOfLines={1}>
                  @{peer.username}
                </Text>
                <View style={styles.headerSubtitle}>
                  <Icon source="lock" size={11} color={theme.colors.secondary} />
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    End-to-end encrypted
                  </Text>
                </View>
              </View>
            </Pressable>
          ),
        }}
      />

      <ProgressBar indeterminate visible={loadingHistory} color={theme.colors.primary} style={styles.progress} />

      {!connected && (
        <View style={[styles.statusBar, { backgroundColor: theme.colors.tertiaryContainer }]}>
          <Icon source="lan-pending" size={14} color={theme.colors.onTertiaryContainer} />
          <Text variant="labelMedium" style={{ color: theme.colors.onTertiaryContainer }}>
            {connection === 'reconnecting' ? 'Connection lost — reconnecting…' : 'Connecting to the chat server…'}
          </Text>
        </View>
      )}

      <DismissKeyboard>
      <FlatList
        inverted
        data={rows}
        keyExtractor={(row) => (row.kind === 'message' ? `m${row.message.dto.id}` : row.kind === 'pending' ? `p${row.pending.key}` : row.key)}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <>
            {item.kind === 'day' ? (
              <DaySeparator label={item.label} />
            ) : item.kind === 'pending' ? (
              <PendingBubble pending={item.pending} onRetry={() => send(item.pending.text, item.pending.key, item.pending.paymentTxHash)} />
            ) : (
              <MessageBubble
                message={item.message}
                groupedWithNext={item.groupedWithNext}
                peerUsername={peer.username}
                recipient={item.message.mine ? peer.address : me}
                onPress={() => {
                  Keyboard.dismiss();
                  setSelected(item.message);
                }}
              />
            )}
          </>
        )}
        ListEmptyComponent={loadingHistory ? <LoadingHistory /> : <EmptyChat username={peer.username} />}
      />
      </DismissKeyboard>

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: theme.colors.background, borderTopColor: theme.colors.outlineVariant }]}>
        <IconButton
          icon="cash-fast"
          mode="contained-tonal"
          size={22}
          style={styles.composerButton}
          onPress={() => setPaying(true)}
          disabled={!connected || !system.data?.contracts.ChatToken}
          accessibilityLabel="Send CHAT"
        />
        <TextInput
          mode="outlined"
          placeholder="Encrypted message"
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={MAX_LENGTH}
          dense
          style={styles.input}
          outlineStyle={styles.inputOutline}
        />
        <IconButton
          icon="send"
          mode="contained"
          size={22}
          style={styles.composerButton}
          onPress={onSend}
          disabled={!draft.trim() || !connected}
          accessibilityLabel="Send"
        />
      </View>

      <VerifySheet message={selected} peerUsername={peer.username} onDismiss={() => setSelected(null)} />
      <SendPaymentSheet visible={paying} peerUsername={peer.username} onDismiss={() => setPaying(false)} onSend={sendPayment} />
    </KeyboardAvoidingView>
  );
}

/** Chronological messages → rows for the inverted list (newest first), with day separators and grouping. */
function buildRows(messages: VerifiedMessage[], pending: PendingMessage[]): Row[] {
  const chronological: Row[] = [];
  let lastDay = '';

  messages.forEach((message, index) => {
    const time = Number(message.dto.clientTimestamp);
    const day = new Date(time).toDateString();
    if (day !== lastDay) {
      chronological.push({ kind: 'day', label: dayLabel(time), key: `day-${day}` });
      lastDay = day;
    }
    const next = messages[index + 1];
    const groupedWithNext =
      !!next &&
      next.mine === message.mine &&
      Number(next.dto.clientTimestamp) - time < GROUP_WINDOW_MS &&
      new Date(Number(next.dto.clientTimestamp)).toDateString() === day;
    chronological.push({ kind: 'message', message, groupedWithNext });
  });

  pending.forEach((p) => chronological.push({ kind: 'pending', pending: p }));
  return chronological.reverse();
}

function dayLabel(milliseconds: number): string {
  const date = new Date(milliseconds);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function DaySeparator({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.daySeparator}>
      <Text variant="labelSmall" style={[styles.dayLabel, { backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurfaceVariant }]}>
        {label}
      </Text>
    </View>
  );
}

function MessageBubble({
  message,
  groupedWithNext,
  peerUsername,
  recipient,
  onPress,
}: {
  message: VerifiedMessage;
  groupedWithNext: boolean;
  peerUsername: string;
  recipient: Address;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { mine, text, signatureValid, chainIntact, dto } = message;
  // A payment only counts if the signed, encrypted payload names the same transaction the server recorded.
  const parsed = parsePaymentPayload(text);
  const payment = parsed && (!dto.payment || dto.payment.txHash.toLowerCase() === parsed.txHash.toLowerCase()) ? parsed : null;

  const background = !signatureValid
    ? theme.colors.errorContainer
    : payment
      ? mine
        ? theme.colors.primaryContainer
        : theme.colors.secondaryContainer
      : mine
        ? theme.colors.primary
        : theme.colors.surfaceVariant;
  const foreground = !signatureValid
    ? theme.colors.onErrorContainer
    : payment
      ? mine
        ? theme.colors.onPrimaryContainer
        : theme.colors.onSecondaryContainer
      : mine
        ? theme.colors.onPrimary
        : theme.colors.onSurfaceVariant;

  // The "tail" corner only on the last bubble of a group.
  const tail = groupedWithNext ? null : mine ? styles.tailMine : styles.tailTheirs;

  return (
    <Pressable
      style={[styles.bubbleRow, mine ? styles.mine : styles.theirs, groupedWithNext ? styles.grouped : styles.ungrouped]}
      onPress={onPress}
      accessibilityHint="Shows signature, hash chain and on-chain anchor checks">
      {!chainIntact && (
        <Text variant="labelSmall" style={[styles.warning, { color: theme.colors.error }]}>
          ⚠ A message from {mine ? 'you' : `@${peerUsername}`} is missing before this one
        </Text>
      )}
      <View style={[styles.bubble, tail, payment && styles.paymentBubble, { backgroundColor: background }]}>
        {payment ? (
          <PaymentContent payload={payment} dto={dto} recipient={recipient} color={foreground} />
        ) : (
          <Text variant="bodyLarge" style={{ color: foreground, fontStyle: text === null ? 'italic' : 'normal' }}>
            {text ?? 'Could not decrypt this message'}
          </Text>
        )}
        <View style={styles.meta}>
          <Text variant="labelSmall" style={[styles.metaText, { color: foreground }]}>
            {formatMessageTime(Number(dto.clientTimestamp))}
          </Text>
          <Icon source={signatureValid ? 'check-decagram' : 'alert-decagram'} size={13} color={foreground} />
        </View>
        {!signatureValid && (
          <Text variant="labelSmall" style={{ color: foreground }}>
            Signature invalid — not sent by this wallet, or changed in transit
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function PendingBubble({ pending, onRetry }: { pending: PendingMessage; onRetry: () => void }) {
  const theme = useTheme();
  const color = pending.failed ? theme.colors.onErrorContainer : theme.colors.onPrimary;
  return (
    <Pressable style={[styles.bubbleRow, styles.mine, styles.ungrouped]} onPress={pending.failed ? onRetry : undefined} disabled={!pending.failed}>
      <View style={[styles.bubble, styles.tailMine, { backgroundColor: pending.failed ? theme.colors.errorContainer : theme.colors.primary, opacity: pending.failed ? 1 : 0.65 }]}>
        <Text variant="bodyLarge" style={{ color }}>
          {describePending(pending)}
        </Text>
        <View style={styles.meta}>
          <Icon source={pending.failed ? 'alert-circle-outline' : 'clock-outline'} size={13} color={color} />
          <Text variant="labelSmall" style={[styles.metaText, { color }]}>
            {pending.failed ? 'Not sent — tap to retry' : 'Encrypting & sending…'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function LoadingHistory() {
  const theme = useTheme();
  return (
    <View style={styles.loadingWrapper}>
      <ActivityIndicator />
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        Loading and verifying messages…
      </Text>
    </View>
  );
}

function EmptyChat({ username }: { username: string }) {
  const theme = useTheme();
  const points = [
    { icon: 'lock-outline', text: `Encrypted with @${username}'s key from the blockchain — the server only stores ciphertext.` },
    { icon: 'draw-pen', text: 'Every message is signed by your wallet and linked to your previous one.' },
    { icon: 'anchor', text: 'Batches are anchored on-chain. Tap any message to verify it.' },
  ];
  return (
    <View style={styles.emptyWrapper}>
      <Surface style={[styles.emptyCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={0}>
        <View style={[styles.emptyIcon, { backgroundColor: theme.colors.primaryContainer }]}>
          <Icon source="message-lock-outline" size={30} color={theme.colors.primary} />
        </View>
        <Text variant="titleMedium" style={styles.emptyTitle}>
          Say hello to @{username}
        </Text>
        {points.map((point) => (
          <View key={point.icon} style={styles.emptyPoint}>
            <Icon source={point.icon} size={18} color={theme.colors.secondary} />
            <Text variant="bodySmall" style={[styles.emptyPointText, { color: theme.colors.onSurfaceVariant }]}>
              {point.text}
            </Text>
          </View>
        ))}
      </Surface>
    </View>
  );
}

function describePending(pending: PendingMessage): string {
  const payment = parsePaymentPayload(pending.text);
  return payment ? `💸 Sending ${formatUnits(BigInt(payment.amount), 18)} CHAT…` : pending.text;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerName: { fontWeight: '700' },
  headerSubtitle: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statusBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  list: { paddingHorizontal: 12, paddingVertical: 10, flexGrow: 1 },
  daySeparator: { alignItems: 'center', marginVertical: 12 },
  dayLabel: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  bubbleRow: { maxWidth: '80%', gap: 2 },
  grouped: { marginTop: 2 },
  ungrouped: { marginTop: 8 },
  mine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, gap: 3 },
  tailMine: { borderBottomRightRadius: 6 },
  tailTheirs: { borderBottomLeftRadius: 6 },
  paymentBubble: { paddingVertical: 12, paddingHorizontal: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  metaText: { opacity: 0.75 },
  warning: { paddingHorizontal: 6, marginBottom: 2 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingTop: 8, gap: 2, borderTopWidth: StyleSheet.hairlineWidth },
  composerButton: { marginBottom: 4 },
  input: { flex: 1, maxHeight: 120, fontSize: 16 },
  inputOutline: { borderRadius: 22 },
  progress: { height: 3 },
  // The inverted list flips its children; flip the loading and empty states back.
  loadingWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, transform: [{ scaleY: -1 }] },
  emptyWrapper: { flex: 1, justifyContent: 'center', padding: 8, transform: [{ scaleY: -1 }] },
  emptyCard: { borderRadius: 24, padding: 20, gap: 12, alignItems: 'center' },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontWeight: '700' },
  emptyPoint: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', alignSelf: 'stretch' },
  emptyPointText: { flex: 1 },
});
