import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Banner, Icon, IconButton, Text, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatUnits, type Address, type Hex } from 'viem';

import { useMessages, type MessageDto } from '@/api/conversations';
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
import { ErrorScreen, LoadingScreen } from '@/components/StatusScreens';
import { UserAvatar } from '@/components/UserAvatar';
import { directConversationId } from '@/crypto';
import { getEncryptionKeyPair, useWalletStore } from '@/wallet/walletStore';

const MAX_LENGTH = 2000;

/** Local ids for messages that are still being sent. */
let pendingCounter = 0;
const nextPendingKey = () => `pending-${++pendingCounter}`;

interface PendingMessage {
  key: string;
  text: string;
  paymentTxHash?: Hex;
  failed: boolean;
}

type Row = { kind: 'message'; message: VerifiedMessage } | { kind: 'pending'; pending: PendingMessage };

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

  // Inverted list: newest first.
  const rows: Row[] = [
    ...[...pending].reverse().map((p): Row => ({ kind: 'pending', pending: p })),
    ...[...(verified.data ?? [])].reverse().map((m): Row => ({ kind: 'message', message: m })),
  ];

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: theme.colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable style={styles.headerTitle} onPress={() => router.push({ pathname: '/user/[address]', params: { address: peer.address } })}>
              <UserAvatar username={peer.username} address={peer.address} size={30} />
              <Text variant="titleMedium">@{peer.username}</Text>
            </Pressable>
          ),
        }}
      />

      <Banner visible={connection !== 'connected'} icon="lan-disconnect">
        {connection === 'reconnecting' ? 'Connection lost — reconnecting…' : 'Connecting to the chat server…'}
      </Banner>

      <FlatList
        inverted
        data={rows}
        keyExtractor={(row) => (row.kind === 'message' ? `m${row.message.dto.id}` : `p${row.pending.key}`)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) =>
          item.kind === 'message' ? (
            <MessageBubble message={item.message} peerUsername={peer.username} recipient={item.message.mine ? peer.address : me} onPress={() => setSelected(item.message)} />
          ) : (
            <PendingBubble pending={item.pending} onRetry={() => send(item.pending.text, item.pending.key, item.pending.paymentTxHash)} />
          )
        }
        ListEmptyComponent={
          messages.isPending ? null : (
            <View style={styles.empty}>
              <Icon source="lock-outline" size={36} color={theme.colors.outline} />
              <Text variant="bodyMedium" style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                Messages are end-to-end encrypted with @{peer.username}&apos;s key from the blockchain. The server only stores ciphertext. Tap any message to verify it.
              </Text>
            </View>
          )
        }
      />

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 8), borderTopColor: theme.colors.outlineVariant }]}>
        <IconButton icon="cash-fast" onPress={() => setPaying(true)} disabled={connection !== 'connected' || !system.data?.contracts.ChatToken} accessibilityLabel="Send CHAT" />
        <TextInput
          mode="outlined"
          placeholder="Encrypted message"
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={MAX_LENGTH}
          style={styles.input}
          dense
        />
        <IconButton icon="send" mode="contained" onPress={onSend} disabled={!draft.trim() || connection !== 'connected'} accessibilityLabel="Send" />
      </View>

      <VerifySheet message={selected} peerUsername={peer.username} onDismiss={() => setSelected(null)} />
      <SendPaymentSheet visible={paying} peerUsername={peer.username} onDismiss={() => setPaying(false)} onSend={sendPayment} />
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message, peerUsername, recipient, onPress }: { message: VerifiedMessage; peerUsername: string; recipient: Address; onPress: () => void }) {
  const theme = useTheme();
  const { mine, text, signatureValid, chainIntact, dto } = message;
  // A payment only counts if the signed, encrypted payload names the same transaction the server recorded.
  const parsed = parsePaymentPayload(text);
  const payment = parsed && (!dto.payment || dto.payment.txHash.toLowerCase() === parsed.txHash.toLowerCase()) ? parsed : null;
  const background = mine ? theme.colors.primary : theme.colors.surfaceVariant;
  const foreground = mine ? theme.colors.onPrimary : theme.colors.onSurfaceVariant;

  return (
    <Pressable style={[styles.bubbleRow, mine ? styles.mine : styles.theirs]} onPress={onPress} accessibilityHint="Shows signature, hash chain and on-chain anchor checks">
      {!chainIntact && (
        <Text variant="labelSmall" style={[styles.warning, { color: theme.colors.error }]}>
          ⚠ A message from {mine ? 'you' : `@${peerUsername}`} is missing before this one
        </Text>
      )}
      <View style={[styles.bubble, { backgroundColor: signatureValid ? background : theme.colors.errorContainer }]}>
        {payment ? (
          <PaymentContent payload={payment} dto={dto as MessageDto} recipient={recipient} color={signatureValid ? foreground : theme.colors.onErrorContainer} />
        ) : (
          <Text style={{ color: signatureValid ? foreground : theme.colors.onErrorContainer, fontStyle: text === null ? 'italic' : 'normal' }}>
            {text ?? 'Could not decrypt this message'}
          </Text>
        )}
        <View style={styles.meta}>
          <Text variant="labelSmall" style={{ color: signatureValid ? foreground : theme.colors.onErrorContainer, opacity: 0.8 }}>
            {formatMessageTime(Number(dto.clientTimestamp))}
          </Text>
          <Icon source={signatureValid ? 'check-decagram' : 'alert-decagram'} size={14} color={signatureValid ? foreground : theme.colors.error} />
        </View>
        {!signatureValid && (
          <Text variant="labelSmall" style={{ color: theme.colors.onErrorContainer }}>
            Signature invalid — not sent by this wallet, or changed in transit
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function PendingBubble({ pending, onRetry }: { pending: PendingMessage; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <Pressable style={[styles.bubbleRow, styles.mine]} onPress={pending.failed ? onRetry : undefined} disabled={!pending.failed}>
      <View style={[styles.bubble, { backgroundColor: theme.colors.primary, opacity: 0.6 }]}>
        <Text style={{ color: theme.colors.onPrimary }}>{describePending(pending)}</Text>
        <View style={styles.meta}>
          <Icon source={pending.failed ? 'alert-circle-outline' : 'clock-outline'} size={14} color={theme.colors.onPrimary} />
          <Text variant="labelSmall" style={{ color: theme.colors.onPrimary }}>
            {pending.failed ? 'Not sent — tap to retry' : 'Encrypting & sending…'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function describePending(pending: PendingMessage): string {
  const payment = parsePaymentPayload(pending.text);
  return payment ? `💸 Sending ${formatUnits(BigInt(payment.amount), 18)} CHAT…` : pending.text;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  list: { padding: 12, gap: 6, flexGrow: 1 },
  empty: { alignItems: 'center', gap: 10, padding: 32, transform: [{ scaleY: -1 }] },
  emptyText: { textAlign: 'center' },
  bubbleRow: { maxWidth: '82%', gap: 2 },
  mine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  warning: { paddingHorizontal: 4 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingTop: 8, gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 120 },
});
