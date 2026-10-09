import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, List, Searchbar, useTheme } from 'react-native-paper';

import { normalizeSearch, useUserSearch, type UserSummary } from '@/api/users';
import { shorten } from '@/components/CopyableValue';
import { EmptyState } from '@/components/EmptyState';
import { UserAvatar } from '@/components/UserAvatar';
import { useWalletStore } from '@/wallet/walletStore';

const VALID_INPUT = /^(@?[a-z0-9_]*|0x[0-9a-fA-F]*)$/;

export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const myAddress = useWalletStore((state) => state.address);
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

  const open = (user: UserSummary) => router.push({ pathname: '/user/[address]', params: { address: user.address } });

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Searchbar
        placeholder="Username or 0x address"
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        style={styles.searchbar}
        loading={search.isFetching}
      />

      {normalized.length === 0 ? (
        <EmptyState icon="account-search-outline" title="Find people" description="Search for a username, or paste a wallet address." />
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
          renderItem={({ item }) => {
            const isMe = item.address.toLowerCase() === myAddress?.toLowerCase();
            return (
              <List.Item
                title={`@${item.username}`}
                description={shorten(item.address)}
                descriptionStyle={styles.address}
                onPress={() => open(item)}
                left={() => <UserAvatar username={item.username} address={item.address} />}
                right={() => (isMe ? <Chip compact>You</Chip> : <List.Icon icon="chevron-right" />)}
                style={styles.item}
              />
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchbar: { margin: 12 },
  loader: { marginTop: 32 },
  item: { paddingLeft: 16 },
  address: { fontFamily: 'Menlo' },
});
