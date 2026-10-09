import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, List, Text, useTheme } from 'react-native-paper';

import { useConversations, type ConversationSummary } from '@/api/conversations';
import { parsePaymentPayload } from '@/chat/payment';
import { formatMessageTime, usePeer } from '@/chat/usePeer';
import { EmptyState } from '@/components/EmptyState';
import { ErrorScreen } from '@/components/StatusScreens';
import { UserAvatar } from '@/components/UserAvatar';
import { decrypt } from '@/crypto';
import { formatUnits } from 'viem';

import { getEncryptionKeyPair, useWalletStore } from '@/wallet/walletStore';

export default function ChatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const conversations = useConversations();
  const [refreshing, setRefreshing] = useState(false);

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
        <EmptyState icon="message-lock-outline" title="No conversations yet" description="Find someone in Search and send them an end-to-end encrypted message." />
        <Button mode="contained" icon="account-search-outline" onPress={() => router.navigate('/search')} style={styles.findButton}>
          Find people
        </Button>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: theme.colors.background }}
      data={conversations.data}
      keyExtractor={(c) => c.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      renderItem={({ item }) => (
        <ConversationRow conversation={item} onPress={() => router.push({ pathname: '/chat/[address]', params: { address: item.peer.address } })} />
      )}
    />
  );
}

function ConversationRow({ conversation, onPress }: { conversation: ConversationSummary; onPress: () => void }) {
  const theme = useTheme();
  const me = useWalletStore((state) => state.address);
  const { peer } = usePeer(conversation.peer.address);
  const last = conversation.lastMessage;

  // Preview only: decrypted with the peer's on-chain key. Full signature and chain checks happen in the chat screen.
  const text = last && peer ? decrypt(last.ciphertext, peer.encryptionKey, getEncryptionKeyPair().secretKey) : null;
  const payment = parsePaymentPayload(text);
  const body = payment ? `💸 ${Number(formatUnits(BigInt(payment.amount), 18)).toLocaleString()} CHAT` : text;
  const preview = !last ? 'No messages yet' : body === null ? '🔒 Encrypted message' : `${last.sender.toLowerCase() === me?.toLowerCase() ? 'You: ' : ''}${body}`;

  return (
    <List.Item
      title={`@${conversation.peer.username}`}
      description={preview}
      descriptionNumberOfLines={1}
      onPress={onPress}
      left={() => <UserAvatar username={conversation.peer.username} address={conversation.peer.address} />}
      right={() =>
        last ? (
          <Text variant="labelSmall" style={[styles.time, { color: theme.colors.onSurfaceVariant }]}>
            {formatMessageTime(Number(last.clientTimestamp))}
          </Text>
        ) : null
      }
      style={styles.row}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loader: { marginTop: 48 },
  findButton: { alignSelf: 'center', marginBottom: 64 },
  row: { paddingLeft: 16 },
  time: { alignSelf: 'center' },
});
