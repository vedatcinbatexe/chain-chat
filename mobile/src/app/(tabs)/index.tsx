import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, useTheme } from 'react-native-paper';

import { useConversations } from '@/api/conversations';
import { loadPresence, useChatConnectionStore } from '@/chat/connection';
import { ConversationRow } from '@/chat/ui/ConversationRow';
import { EmptyState } from '@/components/EmptyState';
import { ErrorScreen } from '@/components/StatusScreens';

/** All conversations — 1:1 chats and groups — most recent first. */
export default function ChatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const conversations = useConversations();
  const connected = useChatConnectionStore((state) => state.status === 'connected');
  const [refreshing, setRefreshing] = useState(false);

  // Who of my 1:1 contacts is online right now; later changes arrive live.
  const peers = conversations.data?.flatMap((c) => (c.peer ? [c.peer.address] : [])).join(',') ?? '';
  useEffect(() => {
    if (connected && peers) loadPresence(peers.split(','));
  }, [connected, peers]);

  if (conversations.isPending) return <ActivityIndicator style={styles.loader} />;
  if (conversations.isError) return <ErrorScreen message={conversations.error.message} onRetry={() => conversations.refetch()} />;

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['conversations'] });
    setRefreshing(false);
  };

  if (conversations.data.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        <EmptyState icon="message-lock-outline" title="No conversations yet" description="Find someone in Search, or create a group and share its invite link." />
        <View style={styles.actions}>
          <Button mode="contained" icon="account-search-outline" onPress={() => router.navigate('/search')}>
            Find people
          </Button>
          <Button mode="contained-tonal" icon="account-group-outline" onPress={() => router.navigate('/groups')}>
            Groups
          </Button>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: theme.colors.background }}
      data={conversations.data}
      keyExtractor={(c) => c.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      renderItem={({ item }) => <ConversationRow conversation={item} />}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loader: { marginTop: 48 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 64 },
});
