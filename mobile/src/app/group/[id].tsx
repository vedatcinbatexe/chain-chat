import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Icon, ProgressBar, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Hex } from 'viem';

import { conversationsQueryKey, useMessages } from '@/api/conversations';
import { describeSendFailure } from '@/api/errors';
import { leaveGroup, useGroup } from '@/api/groups';
import { addMessageToCache, loadPresence, toggleReaction, useChatConnectionStore } from '@/chat/connection';
import { GroupInfoSheet } from '@/chat/GroupInfoSheet';
import { describeTyping, useLiveStore, useTypingAddresses } from '@/chat/liveStore';
import { sendGroupMessage } from '@/chat/send';
import { pickImageMessage } from '@/chat/sendImage';
import { prepareVoiceMessage } from '@/chat/sendVoice';
import { buildRows, ConnectionBar, DaySeparator, EmptyConversation, LoadingHistory, MessageBubble, PendingBubble, type PendingMessage } from '@/chat/ui/ChatParts';
import { Composer } from '@/chat/ui/Composer';
import { ReactionPicker } from '@/chat/ui/ReactionPicker';
import { ReactionsSheet } from '@/chat/ui/ReactionsSheet';
import { useMemberKeys } from '@/chat/useMemberKeys';
import { useBadgeHolders } from '@/chain/classBadge';
import { verifyMessagesWith, type VerifiedMessage } from '@/chat/verify';
import { VerifySheet } from '@/chat/VerifySheet';
import { shorten } from '@/components/CopyableValue';
import { DismissKeyboard } from '@/components/DismissKeyboard';
import { ErrorScreen, LoadingScreen } from '@/components/StatusScreens';
import { UserAvatar } from '@/components/UserAvatar';
import { decryptGroupMessage, isGroupMessageFor } from '@/crypto';
import { useNotificationStore } from '@/notifications/store';
import { getEncryptionKeyPair, useWalletStore } from '@/wallet/walletStore';

/** iOS standard navigation bar height (below the status bar); the screen's header is a regular Stack header. */
const IOS_HEADER_HEIGHT = 44;

/** Local ids for messages that are still being sent. */
let pendingCounter = 0;
const nextPendingKey = () => `group-pending-${++pendingCounter}`;

export default function GroupChatScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = id.toLowerCase() as Hex;
  const me = useWalletStore((state) => state.address)!;
  const connection = useChatConnectionStore((state) => state.status);
  const connected = connection === 'connected';

  const group = useGroup(groupId);
  const messages = useMessages(groupId);

  // While this chat is on screen, its messages need no notification banner.
  useFocusEffect(
    useCallback(() => {
      useNotificationStore.getState().setActiveConversation(groupId.toLowerCase());
      return () => useNotificationStore.getState().setActiveConversation(null);
    }, [groupId]),
  );
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [selected, setSelected] = useState<VerifiedMessage | null>(null);
  const [reactingTo, setReactingTo] = useState<VerifiedMessage | null>(null);
  const [reactionsOf, setReactionsOf] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  // Keys of the current members (to encrypt to) and of everyone who wrote a message (to decrypt), from the chain.
  const memberAddresses = group.data?.members.map((m) => m.address) ?? [];
  const senderAddresses = messages.data?.map((m) => m.sender) ?? [];
  const { keys, ready: keysReady } = useMemberKeys([...memberAddresses, ...senderAddresses]);

  // NFT-gated group: each member's badges are checked on-chain before anything is encrypted to them.
  const badgeGate = group.data?.requiredBadgeContract ?? null;
  const badges = useBadgeHolders(badgeGate, group.data?.requiredBadges.map((b) => b.id) ?? [], memberAddresses);

  const memberList = memberAddresses.join(',');
  useEffect(() => {
    if (connected && memberList) loadPresence(memberList.split(','));
  }, [connected, memberList]);

  const onlineCount = useLiveStore((state) => memberAddresses.filter((a) => a.toLowerCase() === me.toLowerCase() || state.online[a.toLowerCase()]).length);
  const typing = useTypingAddresses(groupId);

  // Verify and decrypt on this phone: each message with its sender's on-chain key.
  const verified = useQuery({
    queryKey: ['verified', groupId, messages.data?.map((m) => m.id).join(','), Object.keys(keys).sort().join(',')],
    enabled: !!messages.data && keysReady,
    queryFn: () =>
      verifyMessagesWith(messages.data!, me, (dto) => {
        const sender = keys[dto.sender.toLowerCase()];
        return sender ? decryptGroupMessage(dto.ciphertext, me, sender.encryptionKey, getEncryptionKeyPair().secretKey) : null;
      }),
    placeholderData: keepPreviousData,
  });

  if (group.isPending) return <LoadingScreen label="Loading group…" />;
  if (group.isError) return <ErrorScreen message="This group does not exist, or you are not a member." onRetry={() => group.refetch()} />;

  const info = group.data;
  const nameOf = (address: string) => {
    const username = keys[address.toLowerCase()]?.username ?? info.members.find((m) => m.address.toLowerCase() === address.toLowerCase())?.username;
    return username ? `@${username}` : shorten(address, 6, 4);
  };

  // Encrypt to every current member whose key is on-chain (this always includes the sender) — and, in a gated
  // group, only to members who hold every required badge right now, whatever the server's member list says.
  const recipients = info.members.flatMap((m) => {
    const key = keys[m.address.toLowerCase()];
    if (badgeGate && !badges.holders.has(m.address.toLowerCase())) return [];
    return key ? [{ address: m.address, encryptionKey: key.encryptionKey }] : [];
  });
  const canSend = connected && keysReady && badges.ready && recipients.some((r) => r.address.toLowerCase() === me.toLowerCase());

  const send = (text: string, key = nextPendingKey()) => {
    setPending((previous) => [...previous.filter((p) => p.key !== key), { key, text, failed: false }]);
    sendGroupMessage(groupId, recipients, text)
      .then((stored) => {
        addMessageToCache(queryClient, stored);
        setPending((previous) => previous.filter((p) => p.key !== key));
      })
      .catch((error) => {
        console.warn('Group send failed', error);
        setPending((previous) => previous.map((p) => (p.key === key ? { ...p, failed: true, reason: describeSendFailure(error) } : p)));
      });
  };

  const react = (message: VerifiedMessage, emoji: string) => {
    setReactingTo(null);
    toggleReaction(message.dto.id, emoji).catch((error) => console.warn('Reaction failed', error));
  };

  const leave = async () => {
    await leaveGroup(groupId);
    setShowInfo(false);
    await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
    router.back();
  };

  const loadingHistory = messages.isPending || (!!messages.data?.length && !verified.data);
  // Reactions come straight from the message cache, so they update the moment the hub reports them.
  const liveReactions = new Map(messages.data?.map((m) => [m.id, m.reactions ?? []]));
  // Messages from before this member joined were never encrypted to their key: they are counted, not shown.
  const readable = (verified.data ?? []).filter((m) => m.text !== null || isGroupMessageFor(m.dto.ciphertext, me));
  const beforeJoining = (verified.data?.length ?? 0) - readable.length;
  const rows = buildRows(readable, pending);
  const subtitle = describeTyping(typing.map(nameOf)) ?? `${badgeGate ? '🎖 ' : ''}${info.members.length} members · ${onlineCount} online`;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + IOS_HEADER_HEIGHT : 0}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable style={styles.headerTitle} onPress={() => setShowInfo(true)} accessibilityHint="Shows members and the invite link">
              <UserAvatar username={info.name} address={info.conversationId} icon="account-group" size={34} />
              <View style={styles.headerText}>
                <Text variant="titleMedium" style={styles.headerName} numberOfLines={1}>
                  {info.name}
                </Text>
                <Text variant="labelSmall" numberOfLines={1} style={{ color: typing.length > 0 ? theme.colors.secondary : theme.colors.onSurfaceVariant }}>
                  {subtitle}
                </Text>
              </View>
            </Pressable>
          ),
        }}
      />

      <ProgressBar indeterminate visible={loadingHistory} color={theme.colors.primary} style={styles.progress} />
      {!connected && <ConnectionBar reconnecting={connection === 'reconnecting'} />}

      <DismissKeyboard>
        <FlatList
          inverted
          data={rows}
          extraData={messages.data}
          keyExtractor={(row) => (row.kind === 'message' ? `m${row.message.dto.id}` : row.kind === 'pending' ? `p${row.pending.key}` : row.key)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) =>
            item.kind === 'day' ? (
              <DaySeparator label={item.label} />
            ) : item.kind === 'pending' ? (
              <PendingBubble pending={item.pending} onRetry={() => send(item.pending.text, item.pending.key)} />
            ) : (
              <MessageBubble
                message={item.message}
                groupedWithNext={item.groupedWithNext}
                senderLabel={!item.message.mine && item.firstOfRun ? nameOf(item.message.dto.sender) : null}
                senderName={nameOf(item.message.dto.sender)}
                me={me}
                onPress={() => {
                  Keyboard.dismiss();
                  setSelected(item.message);
                }}
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
          ListFooterComponent={
            beforeJoining > 0 ? (
              <View style={[styles.joinNotice, { backgroundColor: theme.colors.surfaceVariant }]}>
                <Icon source="lock-clock" size={16} color={theme.colors.onSurfaceVariant} />
                <Text variant="labelMedium" style={[styles.joinNoticeText, { color: theme.colors.onSurfaceVariant }]}>
                  {beforeJoining === 1 ? '1 earlier message was' : `${beforeJoining} earlier messages were`} sent before you joined. They were encrypted only for the
                  members at that time, so they cannot be shown.
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            loadingHistory ? (
              <LoadingHistory />
            ) : (
              <EmptyConversation
                icon="account-group-outline"
                title={`Welcome to ${info.name}`}
                points={[
                  { icon: 'lock-outline', text: 'Each message is encrypted once, and its key is wrapped for every member’s on-chain key.' },
                  { icon: 'link-variant', text: 'Tap the group name to share the invite link and see who is online.' },
                  { icon: 'emoticon-happy-outline', text: 'Tap a message to verify it, long-press to react.' },
                ]}
              />
            )
          }
        />
      </DismissKeyboard>

      <Composer
        conversationId={groupId}
        value={draft}
        onChange={setDraft}
        onSend={() => {
          const text = draft.trim();
          if (!text) return;
          setDraft('');
          send(text);
        }}
        onSendVoice={async (recording) => send(await prepareVoiceMessage(recording))}
        onSendImage={async () => {
          const picture = await pickImageMessage();
          if (picture) send(picture);
        }}
        connected={canSend}
      />

      <VerifySheet message={selected} peerUsername={selected ? nameOf(selected.dto.sender).replace(/^@/, '') : ''} onDismiss={() => setSelected(null)} />
      <ReactionPicker visible={!!reactingTo} onDismiss={() => setReactingTo(null)} onSelect={(emoji) => reactingTo && react(reactingTo, emoji)} />
      <ReactionsSheet reactions={reactionsOf === null ? null : (liveReactions.get(reactionsOf) ?? [])} me={me} nameOf={nameOf} onDismiss={() => setReactionsOf(null)} />
      <GroupInfoSheet
        group={info}
        me={me}
        visible={showInfo}
        onDismiss={() => setShowInfo(false)}
        onOpenProfile={(address) => {
          setShowInfo(false);
          router.push({ pathname: '/user/[address]', params: { address } });
        }}
        onLeave={leave}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 260 },
  headerText: { flexShrink: 1 },
  headerName: { fontWeight: '700' },
  progress: { height: 3 },
  joinNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, alignSelf: 'center', maxWidth: 340, marginVertical: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  joinNoticeText: { flex: 1 },
  list: { paddingHorizontal: 12, paddingVertical: 10, flexGrow: 1 },
});
