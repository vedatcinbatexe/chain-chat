import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, Icon, IconButton, Searchbar, Surface, Text, useTheme } from 'react-native-paper';

import { useConversations } from '@/api/conversations';
import { normalizeSearch, useUserSearch, type UserSummary } from '@/api/users';
import { useLiveStore } from '@/chat/liveStore';
import { shorten } from '@/components/CopyableValue';
import { DismissKeyboard } from '@/components/DismissKeyboard';
import { EmptyState } from '@/components/EmptyState';
import { UserAvatar } from '@/components/UserAvatar';
import { useWalletStore } from '@/wallet/walletStore';

const VALID_INPUT = /^(@?[a-z0-9_]*|0x[0-9a-fA-F]*)$/;

export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const myAddress = useWalletStore((state) => state.address);
  const online = useLiveStore((state) => state.online);
  const conversations = useConversations();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  // Search 300 ms after the user stops typing, not on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const search = useUserSearch(query);
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
      <Searchbar
        placeholder="Username or 0x address"
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        elevation={0}
        style={[styles.searchbar, { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.outlineVariant }]}
        loading={search.isFetching}
      />

      {normalized.length === 0 ? (
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
