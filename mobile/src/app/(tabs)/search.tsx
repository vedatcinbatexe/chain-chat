import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, Icon, IconButton, Searchbar, SegmentedButtons, Surface, Text, useTheme } from 'react-native-paper';

import { useConversations } from '@/api/conversations';
import { normalizeSearch, useUserSearch, type UserSummary } from '@/api/users';
import { KIND_FILTERS, messageBody, passesFilter, type MessageFilter } from '@/chat/content';
import { useLiveStore } from '@/chat/liveStore';
import { useAllMessages, type FoundMessage } from '@/chat/useAllMessages';
import { formatMessageTime } from '@/chat/usePeer';
import { shorten } from '@/components/CopyableValue';
import { DismissKeyboard } from '@/components/DismissKeyboard';
import { EmptyState } from '@/components/EmptyState';
import { UserAvatar } from '@/components/UserAvatar';
import { useWalletStore } from '@/wallet/walletStore';

const VALID_INPUT = /^(@?[a-z0-9_]*|0x[0-9a-fA-F]*)$/;
/** The message search shows at most this many results. */
const MAX_RESULTS = 100;

export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const myAddress = useWalletStore((state) => state.address);
  const online = useLiveStore((state) => state.online);
  const conversations = useConversations();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'people' | 'messages'>('people');
  const [kind, setKind] = useState<MessageFilter['kind']>('all');
  const all = useAllMessages(mode === 'messages');

  // Search 300 ms after the user stops typing, not on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const search = useUserSearch(mode === 'people' ? query : '');
  const normalized = normalizeSearch(text);
  const invalid = normalized.length > 0 && !VALID_INPUT.test(normalized);
  // Before anything is typed: the people this wallet already chats with.
  const contacts = conversations.data?.flatMap((c) => (c.peer ? [c.peer] : [])) ?? [];

  const openProfile = (user: UserSummary) => router.push({ pathname: '/user/[address]', params: { address: user.address } });
  const openChat = (user: UserSummary) => router.push({ pathname: '/chat/[address]', params: { address: user.address } });

  const renderUser = ({ item }: { item: UserSummary }) => {
    const isMe = item.address.toLowerCase() === myAddress?.toLowerCase();
    return (
      <Pressable onPress={() => openProfile(item)} style={[styles.row, { backgroundColor: theme.colors.elevation.level1 }]} accessibilityHint="Opens the profile">
        <UserAvatar username={item.username} address={item.address} size={48} online={isMe || !!online[item.address.toLowerCase()]} />
        <View style={styles.rowText}>
          <Text variant="titleMedium" style={styles.bold} numberOfLines={1}>
            @{item.username}
          </Text>
          <Text variant="labelMedium" style={[styles.address, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
            {shorten(item.address, 8, 6)}
          </Text>
        </View>
        {isMe ? (
          <Chip compact>You</Chip>
        ) : (
          <IconButton mode="contained-tonal" icon="message-lock-outline" size={20} onPress={() => openChat(item)} accessibilityLabel={`Message @${item.username}`} />
        )}
      </Pressable>
    );
  };

  const openMessage = (found: FoundMessage) =>
    found.conversation.peer
      ? router.push({ pathname: '/chat/[address]', params: { address: found.conversation.peer.address, focus: String(found.dto.id) } })
      : router.push({ pathname: '/group/[id]', params: { id: found.conversation.id, focus: String(found.dto.id) } });

  const filter: MessageFilter = { query: text, kind };
  const matches = all.messages.filter((found) => passesFilter(found.text, filter));

  const renderMessage = ({ item }: { item: FoundMessage }) => {
    const { conversation } = item;
    return (
      <Pressable onPress={() => openMessage(item)} style={[styles.row, { backgroundColor: theme.colors.elevation.level1 }]} accessibilityHint="Opens the chat at this message">
        {conversation.peer ? (
          <UserAvatar username={conversation.peer.username} address={conversation.peer.address} size={44} />
        ) : (
          <UserAvatar username={conversation.group?.name ?? '?'} address={conversation.id} icon="account-group" size={44} />
        )}
        <View style={styles.rowText}>
          <View style={styles.messageTitle}>
            <Text variant="titleSmall" style={[styles.bold, styles.flex]} numberOfLines={1}>
              {conversation.peer ? `@${conversation.peer.username}` : conversation.group?.name}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {formatMessageTime(Number(item.dto.clientTimestamp))}
            </Text>
          </View>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>
            <Text style={{ color: theme.colors.primary }}>{item.senderName}: </Text>
            {messageBody(item.text)}
          </Text>
        </View>
      </Pressable>
    );
  };

  const sectionTitle = (title: string, count: number) => (
    <View style={styles.sectionHeader}>
      <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
        {title}
      </Text>
      <Text variant="labelMedium" style={{ color: theme.colors.outline }}>
        {count}
      </Text>
    </View>
  );

  return (
    <DismissKeyboard style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <SegmentedButtons
        style={styles.modes}
        value={mode}
        onValueChange={(value) => setMode(value as 'people' | 'messages')}
        buttons={[
          { value: 'people', label: 'People', icon: 'account-search-outline' },
          { value: 'messages', label: 'Messages', icon: 'message-text-outline' },
        ]}
      />
      <Searchbar
        placeholder={mode === 'people' ? 'Username or 0x address' : 'Search all your chats'}
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        elevation={0}
        style={[styles.searchbar, { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.outlineVariant }]}
        loading={mode === 'people' ? search.isFetching : all.isLoading}
      />

      {mode === 'messages' ? (
        <>
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.kinds}>
              {KIND_FILTERS.map((option) => {
                const selected = kind === option.value;
                return (
                  <Chip key={option.value} compact icon={option.icon} selected={selected} showSelectedCheck={false} mode={selected ? 'flat' : 'outlined'} onPress={() => setKind(option.value)}>
                    {option.label}
                  </Chip>
                );
              })}
            </ScrollView>
          </View>
          {all.isError ? (
            <EmptyState icon="cloud-alert-outline" title="Could not load your chats" description="Check the connection and try again." />
          ) : all.isLoading ? (
            <ActivityIndicator style={styles.loader} />
          ) : matches.length === 0 ? (
            <EmptyState
              icon="message-question-outline"
              title={all.messages.length === 0 ? 'No messages yet' : 'No messages match'}
              description={all.messages.length === 0 ? 'Messages from all your chats can be searched here.' : 'Try other words or another filter.'}
            />
          ) : (
            <FlatList
              data={matches.slice(0, MAX_RESULTS)}
              keyExtractor={(found) => String(found.dto.id)}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={styles.list}
              ListHeaderComponent={sectionTitle(text.trim() || kind !== 'all' ? 'Matching messages' : `Recent messages in ${all.conversationCount} ${all.conversationCount === 1 ? 'chat' : 'chats'}`, matches.length)}
              ListFooterComponent={
                <Text variant="labelSmall" style={[styles.footnote, { color: theme.colors.outline }]}>
                  Searched on this phone: messages are end-to-end encrypted, so the server cannot read or search them. The latest 100 messages of each chat are covered.
                </Text>
              }
              renderItem={renderMessage}
            />
          )}
        </>
      ) : normalized.length === 0 ? (
        <FlatList
          data={contacts}
          keyExtractor={(user) => user.address}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          renderItem={renderUser}
          ListHeaderComponent={
            <View>
              <Surface style={[styles.tip, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
                <View style={[styles.tipIcon, { backgroundColor: theme.colors.primary }]}>
                  <Icon source="account-search" size={24} color={theme.colors.onPrimary} />
                </View>
                <View style={styles.rowText}>
                  <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onPrimaryContainer }]}>
                    Find people
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>
                    Type the start of a username, or paste a full wallet address. Names come from the Registry contract.
                  </Text>
                </View>
              </Surface>
              {contacts.length > 0 && sectionTitle('People you chat with', contacts.length)}
            </View>
          }
        />
      ) : invalid ? (
        <EmptyState icon="alert-circle-outline" title="Not a valid search" description="Usernames use lowercase letters, digits and _. Addresses start with 0x." />
      ) : search.isError ? (
        <EmptyState icon="cloud-alert-outline" title="Search failed" description={search.error.message} />
      ) : search.isPending && search.fetchStatus !== 'idle' ? (
        <ActivityIndicator style={styles.loader} />
      ) : search.data?.length === 0 ? (
        <EmptyState icon="account-question-outline" title="No users found" description={`Nobody has registered a name starting with "${normalized}".`} />
      ) : (
        <FlatList
          data={search.data ?? []}
          keyExtractor={(user) => user.address}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          ListHeaderComponent={search.data ? sectionTitle('Results', search.data.length) : null}
          renderItem={renderUser}
        />
      )}
    </DismissKeyboard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  modes: { marginHorizontal: 16, marginTop: 12 },
  kinds: { gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
  messageTitle: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  flex: { flex: 1 },
  footnote: { textAlign: 'center', marginTop: 8, paddingHorizontal: 12 },
  searchbar: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderRadius: 18, borderWidth: 1 },
  loader: { marginTop: 32 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16 },
  tipIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, marginBottom: 8, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, marginBottom: 8 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  bold: { fontWeight: '700' },
  address: { fontFamily: 'Menlo' },
});
