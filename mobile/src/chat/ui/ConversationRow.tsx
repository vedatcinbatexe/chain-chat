import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';
import { formatUnits } from 'viem';

import type { ConversationSummary } from '@/api/conversations';
import { UserAvatar } from '@/components/UserAvatar';
import { decrypt, decryptGroupMessage, isGroupMessageFor } from '@/crypto';
import { getEncryptionKeyPair, useWalletStore } from '@/wallet/walletStore';
import { useIsOnline } from '../liveStore';
import { parsePaymentPayload } from '../payment';
import { describeMedia } from '../image';
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
  const body = payment ? `💸 ${Number(formatUnits(BigInt(payment.amount), 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${payment.token}` : (describeMedia(text) ?? text);
  const mine = last?.sender.toLowerCase() === me?.toLowerCase();
  const author = mine ? 'You: ' : isGroup && key ? `${key.username}: ` : '';
  const beforeJoining = isGroup && !!last && !!me && body === null && !isGroupMessageFor(last.ciphertext, me);
  const preview = !last ? (isGroup ? 'No messages yet — say hello' : 'No messages yet') : beforeJoining ? 'You joined — say hello' : body === null ? '🔒 Encrypted message' : `${author}${body}`;

  const title = isGroup ? conversation.group!.name : `@${conversation.peer!.username}`;
  const open = () =>
    isGroup
      ? router.push({ pathname: '/group/[id]', params: { id: conversation.id } })
      : router.push({ pathname: '/chat/[address]', params: { address: conversation.peer!.address } });

  return (
    <Pressable onPress={open} style={[styles.row, { backgroundColor: theme.colors.elevation.level1 }]}>
      {isGroup ? (
        <UserAvatar username={conversation.group!.name} address={conversation.id} icon="account-group" size={48} />
      ) : (
        <UserAvatar username={conversation.peer!.username} address={conversation.peer!.address} online={peerOnline} size={48} />
      )}
      <View style={styles.text}>
        <View style={styles.line}>
          <Text variant="titleMedium" style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {last && (
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {formatMessageTime(Number(last.clientTimestamp))}
            </Text>
          )}
        </View>
        <View style={styles.line}>
          {isGroup && (
            <View style={[styles.members, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Icon source="account-multiple" size={12} color={theme.colors.onSurfaceVariant} />
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {conversation.group!.memberCount}
              </Text>
            </View>
          )}
          <Text variant="bodyMedium" style={[styles.preview, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
            {preview}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, marginBottom: 8 },
  text: { flex: 1, minWidth: 0, gap: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontWeight: '600' },
  preview: { flex: 1 },
  members: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
});
