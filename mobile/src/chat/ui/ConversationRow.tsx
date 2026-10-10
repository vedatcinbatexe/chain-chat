import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { List, Text, useTheme } from 'react-native-paper';
import { formatUnits } from 'viem';

import type { ConversationSummary } from '@/api/conversations';
import { UserAvatar } from '@/components/UserAvatar';
import { decrypt, decryptGroupMessage } from '@/crypto';
import { getEncryptionKeyPair, useWalletStore } from '@/wallet/walletStore';
import { useIsOnline } from '../liveStore';
import { parsePaymentPayload } from '../payment';
import { useMemberKeys } from '../useMemberKeys';
import { formatMessageTime } from '../usePeer';

/**
 * One row of the chat list, for a 1:1 chat or a group. The preview is decrypted on the phone with the sender's
 * on-chain key; full signature and chain checks happen in the chat screen.
 */
export function ConversationRow({ conversation }: { conversation: ConversationSummary }) {
  const theme = useTheme();
  const router = useRouter();
  const me = useWalletStore((state) => state.address);
  const last = conversation.lastMessage;
  const isGroup = conversation.type === 'Group';
  const peerOnline = useIsOnline(conversation.peer?.address);

  // Whose key decrypts the preview: the peer's (1:1, both directions) or the sender's (group).
  const keyOwner = isGroup ? last?.sender : conversation.peer?.address;
  const { keys } = useMemberKeys(keyOwner ? [keyOwner] : []);
  const key = keyOwner ? keys[keyOwner.toLowerCase()] : undefined;

  let text: string | null = null;
  if (last && key && me) {
    const secret = getEncryptionKeyPair().secretKey;
    text = isGroup ? decryptGroupMessage(last.ciphertext, me, key.encryptionKey, secret) : decrypt(last.ciphertext, key.encryptionKey, secret);
  }
  const payment = parsePaymentPayload(text);
  const body = payment ? `💸 ${Number(formatUnits(BigInt(payment.amount), 18)).toLocaleString()} CHAT` : text;
  const mine = last?.sender.toLowerCase() === me?.toLowerCase();
  const author = mine ? 'You: ' : isGroup && key ? `${key.username}: ` : '';
  const preview = !last ? (isGroup ? 'No messages yet — say hello' : 'No messages yet') : body === null ? '🔒 Encrypted message' : `${author}${body}`;

  const title = isGroup ? conversation.group!.name : `@${conversation.peer!.username}`;
  const open = () =>
    isGroup
      ? router.push({ pathname: '/group/[id]', params: { id: conversation.id } })
      : router.push({ pathname: '/chat/[address]', params: { address: conversation.peer!.address } });

  return (
    <List.Item
      title={title}
      titleStyle={styles.title}
      description={isGroup ? `${conversation.group!.memberCount} members · ${preview}` : preview}
      descriptionNumberOfLines={1}
      onPress={open}
      left={() =>
        isGroup ? (
          <UserAvatar username={conversation.group!.name} address={conversation.id} icon="account-group" />
        ) : (
          <UserAvatar username={conversation.peer!.username} address={conversation.peer!.address} online={peerOnline} />
        )
      }
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
  row: { paddingLeft: 16 },
  title: { fontWeight: '600' },
  time: { alignSelf: 'center' },
});
