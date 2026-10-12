import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Icon, IconButton, ProgressBar, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Address, Hex } from 'viem';

import { useMessages } from '@/api/conversations';
import { useSystemInfo } from '@/api/system';
import { describeSendFailure } from '@/api/errors';
import { submitAssetTransfer, type Asset } from '@/chain/assets';
import { addMessageToCache, loadPresence, toggleReaction, useChatConnectionStore } from '@/chat/connection';
import { describeTyping, useIsOnline, useTypingAddresses } from '@/chat/liveStore';
import { formatPaymentPayload } from '@/chat/payment';
import { sendTextMessage } from '@/chat/send';
import { createSwapOrder } from '@/chain/swapDesk';
import { SwapOfferSheet } from '@/chat/SwapOfferSheet';
import { formatSwapPayload } from '@/chat/swap';
import { pickImageMessage } from '@/chat/sendImage';
import { prepareVoiceMessage } from '@/chat/sendVoice';
import { SendPaymentSheet } from '@/chat/SendPaymentSheet';
import { ConnectionBar, DaySeparator, EmptyConversation, LoadingHistory, MessageBubble, PendingBubble, type PendingMessage, type Row } from '@/chat/ui/ChatParts';
import { ChatSearchBar } from '@/chat/ui/ChatSearchBar';
import { Composer } from '@/chat/ui/Composer';
import { useChatTools } from '@/chat/useChatTools';
import { ReactionPicker } from '@/chat/ui/ReactionPicker';
import { ReactionsSheet } from '@/chat/ui/ReactionsSheet';
import { usePeer } from '@/chat/usePeer';
import { verifyMessages, type VerifiedMessage } from '@/chat/verify';
import { VerifySheet } from '@/chat/VerifySheet';
import { DismissKeyboard } from '@/components/DismissKeyboard';
import { ErrorScreen, LoadingScreen } from '@/components/StatusScreens';
import { UserAvatar } from '@/components/UserAvatar';
import { directConversationId } from '@/crypto';
import { useNotificationStore } from '@/notifications/store';
import { getEncryptionKeyPair, useWalletStore } from '@/wallet/walletStore';

/** iOS standard navigation bar height (below the status bar); the screen's header is a regular Stack header. */
const IOS_HEADER_HEIGHT = 44;

/** Local ids for messages that are still being sent. */
let pendingCounter = 0;
const nextPendingKey = () => `pending-${++pendingCounter}`;

export default function ChatScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { address, focus } = useLocalSearchParams<{ address: string; focus?: string }>();
  const me = useWalletStore((state) => state.address)!;
  const connection = useChatConnectionStore((state) => state.status);
  const { peer, isLoading, isError, notRegistered, refetch } = usePeer(address);

  const conversationId = useMemo(() => directConversationId(me, address as Address), [me, address]);
  const messages = useMessages(conversationId);

  // While this chat is on screen, its messages need no notification banner.
  useFocusEffect(
    useCallback(() => {
      useNotificationStore.getState().setActiveConversation(conversationId.toLowerCase());
      return () => useNotificationStore.getState().setActiveConversation(null);
    }, [conversationId]),
  );
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [selected, setSelected] = useState<VerifiedMessage | null>(null);
  const [reactingTo, setReactingTo] = useState<VerifiedMessage | null>(null);
  const [reactionsOf, setReactionsOf] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const system = useSystemInfo();
  const peerOnline = useIsOnline(address);
  const typing = useTypingAddresses(conversationId);
  const connected = connection === 'connected';

  // Initial presence once connected; later changes arrive live.
  useEffect(() => {
    if (connected && address) loadPresence([address]);
  }, [connected, address]);

  // Verify and decrypt on this phone; re-run whenever the message list or the peer's on-chain key changes.
  const verified = useQuery({
    queryKey: ['verified', conversationId, messages.data?.map((m) => `${m.id}${m.deletedAt ? 'x' : ''}`).join(','), peer?.encryptionKey],
    enabled: !!messages.data && !!peer,
    queryFn: () => verifyMessages(messages.data!, me, peer!.encryptionKey, getEncryptionKeyPair().secretKey),
    placeholderData: keepPreviousData,
  });

  const nameOf = (other: string) =>
    other.toLowerCase() === me.toLowerCase() ? 'You' : peer && other.toLowerCase() === peer.address.toLowerCase() ? `@${peer.username}` : `${other.slice(0, 6)}…${other.slice(-4)}`;
  const listRef = useRef<FlatList<Row>>(null);
  const tools = useChatTools({ listRef, messages: verified.data ?? [], pending, nameOf, focusId: focus ? Number(focus) : null, onVerify: setSelected });
  // Rows are drawn again when a reaction arrives or another message is marked.
  const listState = useMemo(() => ({ messages: messages.data, highlighted: tools.highlightedId }), [messages.data, tools.highlightedId]);

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
        setPending((previous) => previous.map((p) => (p.key === key ? { ...p, failed: true, reason: describeSendFailure(error) } : p)));
      });
  };

  /** SDD §6.4: transfer on-chain from this wallet first, then announce it in the chat with the tx hash. */
  const sendPayment = async (asset: Asset, amount: bigint, note: string) => {
    const txHash = await submitAssetTransfer(system.data!, asset, peer.address, amount);
    send(formatPaymentPayload({ token: asset.symbol, amount: amount.toString(), txHash, ...(note ? { note } : {}) }), undefined, txHash);
    queryClient.invalidateQueries({ queryKey: ['balances'] });
  };

  const react = (message: VerifiedMessage, emoji: string) => {
    setReactingTo(null);
    toggleReaction(message.dto.id, emoji).catch((error) => console.warn('Reaction failed', error));
  };

  // Messages load in two steps: fetch from the server, then verify + decrypt on this phone.
  const loadingHistory = messages.isPending || (!!messages.data?.length && !verified.data);
  // Reactions come straight from the message cache, so they update the moment the hub reports them.
  const liveReactions = new Map(messages.data?.map((m) => [m.id, m.reactions ?? []]));
  const subtitle = typing.length > 0 ? describeTyping([`@${peer.username}`]) : peerOnline ? 'Online' : 'End-to-end encrypted';

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + IOS_HEADER_HEIGHT : 0}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable style={styles.headerTitle} onPress={() => router.push({ pathname: '/user/[address]', params: { address: peer.address } })}>
              <UserAvatar username={peer.username} address={peer.address} size={34} online={peerOnline} />
              <View>
                <Text variant="titleMedium" style={styles.headerName} numberOfLines={1}>
                  @{peer.username}
                </Text>
                <View style={styles.headerSubtitle}>
                  {subtitle === 'End-to-end encrypted' && <Icon source="lock" size={11} color={theme.colors.secondary} />}
                  <Text variant="labelSmall" style={{ color: typing.length > 0 || peerOnline ? theme.colors.secondary : theme.colors.onSurfaceVariant }}>
                    {subtitle}
                  </Text>
                </View>
              </View>
            </Pressable>
          ),
          headerRight: () => <IconButton icon="magnify" onPress={tools.openSearch} accessibilityLabel="Search this chat" />,
        }}
      />

      <ProgressBar indeterminate visible={loadingHistory} color={theme.colors.primary} style={styles.progress} />
      {!connected && <ConnectionBar reconnecting={connection === 'reconnecting'} />}
      {tools.searching && <ChatSearchBar filter={tools.filter} onChange={tools.setFilter} matchCount={tools.filtering ? tools.matchCount : null} onClose={tools.closeSearch} />}

      <DismissKeyboard>
        <FlatList
          inverted
          ref={listRef}
          data={tools.rows}
          extraData={listState}
          onScrollToIndexFailed={tools.onScrollToIndexFailed}
          keyExtractor={(row) => (row.kind === 'message' ? `m${row.message.dto.id}` : row.kind === 'pending' ? `p${row.pending.key}` : row.key)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) =>
            item.kind === 'day' ? (
              <DaySeparator label={item.label} />
            ) : item.kind === 'pending' ? (
              <PendingBubble pending={item.pending} onRetry={() => send(item.pending.text, item.pending.key, item.pending.paymentTxHash)} />
            ) : (
              <MessageBubble
                message={item.message}
                groupedWithNext={item.groupedWithNext}
                senderName={`@${peer.username}`}
                nameOf={(address) => (address.toLowerCase() === me.toLowerCase() ? 'you' : address.toLowerCase() === peer.address.toLowerCase() ? `@${peer.username}` : `${address.slice(0, 6)}…${address.slice(-4)}`)}
                recipient={item.message.mine ? peer.address : me}
                me={me}
                onPress={() => {
                  Keyboard.dismiss();
                  // While searching, a tap shows the message in its place in the conversation.
                  if (tools.filtering) tools.jumpTo(item.message.dto.id);
                  else setSelected(item.message);
                }}
                quote={tools.quoteOf(item.message)}
                onPressQuote={tools.jumpTo}
                highlighted={tools.highlightedId === item.message.dto.id}
                onLongPress={() => {
                  Keyboard.dismiss();
                  setReactingTo(item.message);
                }}
                reactions={liveReactions.get(item.message.dto.id)}
                onShowReactions={() => setReactionsOf(item.message.dto.id)}
                onToggleReaction={(emoji) => react(item.message, emoji)}
              />
            )
          }
          ListEmptyComponent={
            tools.filtering ? null : loadingHistory ? (
              <LoadingHistory />
            ) : (
              <EmptyConversation
                icon="message-lock-outline"
                title={`Say hello to @${peer.username}`}
                points={[
                  { icon: 'lock-outline', text: `Encrypted with @${peer.username}'s key from the blockchain — the server only stores ciphertext.` },
                  { icon: 'draw-pen', text: 'Every message is signed by your wallet and linked to your previous one.' },
                  { icon: 'anchor', text: 'Batches are anchored on-chain. Tap a message to verify it, long-press to react, reply or delete.' },
                ]}
              />
            )
          }
        />
      </DismissKeyboard>

      <Composer
        conversationId={conversationId}
        value={draft}
        onChange={setDraft}
        onSend={() => {
          const text = draft.trim();
          if (!text) return;
          setDraft('');
          send(tools.outgoing(text));
        }}
        replyingTo={tools.replyPreview}
        onCancelReply={tools.cancelReply}
        onSendVoice={async (recording) => send(await prepareVoiceMessage(recording))}
        onSwap={system.data?.contracts.SwapDesk ? () => setSwapping(true) : undefined}
        onSendImage={async () => {
          const picture = await pickImageMessage();
          if (picture) send(picture);
        }}
        connected={connected}
        onPay={() => setPaying(true)}
        payDisabled={!system.data?.assets?.length}
      />

      <VerifySheet message={selected} peerUsername={peer.username} onDismiss={() => setSelected(null)} />
      <ReactionPicker
        visible={!!reactingTo}
        onDismiss={() => setReactingTo(null)}
        onSelect={(emoji) => reactingTo && react(reactingTo, emoji)}
        actions={reactingTo ? tools.actionsFor(reactingTo) : []}
        canReact={!reactingTo?.deleted}
      />
      <ReactionsSheet
        reactions={reactionsOf === null ? null : (liveReactions.get(reactionsOf) ?? [])}
        me={me}
        nameOf={() => `@${peer.username}`}
        onDismiss={() => setReactionsOf(null)}
      />
      <SwapOfferSheet
        visible={swapping}
        onDismiss={() => setSwapping(false)}
        onCreate={async (offer) => {
          // Lock the offered asset in the swap contract first, then announce the order in the chat.
          const { id } = await createSwapOrder(system.data!, offer.sell, offer.buy, Date.now() + offer.validForMs);
          send(formatSwapPayload({ orderId: id.toString(), sell: { token: offer.sell.asset.symbol, amount: offer.sell.amount.toString() }, buy: { token: offer.buy.asset.symbol, amount: offer.buy.amount.toString() } }));
          queryClient.invalidateQueries({ queryKey: ['balances'] });
        }}
      />
      <SendPaymentSheet visible={paying} peerUsername={peer.username} onDismiss={() => setPaying(false)} onSend={sendPayment} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerName: { fontWeight: '700' },
  headerSubtitle: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  progress: { height: 3 },
  list: { paddingHorizontal: 12, paddingVertical: 10, flexGrow: 1 },
});
