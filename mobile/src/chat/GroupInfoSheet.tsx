import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Button, Chip, Divider, Modal, Portal, Text, useTheme } from 'react-native-paper';

import type { GroupInfo } from '@/api/groups';
import { shorten } from '@/components/CopyableValue';
import { UserAvatar } from '@/components/UserAvatar';
import { useLiveStore } from './liveStore';

interface Props {
  group: GroupInfo;
  me: string;
  visible: boolean;
  onDismiss: () => void;
  onOpenProfile: (address: string) => void;
  onLeave: () => Promise<void>;
}

/** The link that opens the join screen: chainchat://join/CODE in a build, exp://…/--/join/CODE in Expo Go. */
export const inviteLink = (code: string) => Linking.createURL(`/join/${code}`);

/** Members (with live online status), the invite link, and leaving the group. */
export function GroupInfoSheet({ group, me, visible, onDismiss, onOpenProfile, onLeave }: Props) {
  const theme = useTheme();
  const online = useLiveStore((state) => state.online);
  const [copied, setCopied] = useState(false);
  const link = inviteLink(group.inviteCode);

  const share = () => Share.share({ message: `Join "${group.name}" on ChainChat: ${link}` });
  const copy = async () => {
    await Clipboard.setStringAsync(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const leave = () =>
    Alert.alert(`Leave "${group.name}"?`, 'New messages will no longer be encrypted to you. You can rejoin with the invite link.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => onLeave() },
    ]);

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <UserAvatar username={group.name} address={group.conversationId} icon="account-group" size={56} />
            <View style={styles.headerText}>
              <Text variant="titleLarge" style={styles.bold} numberOfLines={2}>
                {group.name}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {group.members.length} of {group.maxMembers} members · end-to-end encrypted
              </Text>
            </View>
          </View>

          <View style={[styles.invite, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text variant="titleSmall" style={{ color: theme.colors.onPrimaryContainer }}>
              Invite link
            </Text>
            <Text variant="bodySmall" numberOfLines={1} ellipsizeMode="middle" style={[styles.mono, { color: theme.colors.onPrimaryContainer }]}>
              {link}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onPrimaryContainer }}>
              Anyone with this link can join and read new messages.
            </Text>
            <View style={styles.inviteActions}>
              <Button mode="contained" icon="share-variant" onPress={share} style={styles.flex}>
                Share
              </Button>
              <Button mode="contained-tonal" icon={copied ? 'check' : 'content-copy'} onPress={copy} style={styles.flex}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </View>
          </View>

          <Text variant="titleSmall">Members</Text>
          {group.members.map((member, index) => {
            const isMe = member.address.toLowerCase() === me.toLowerCase();
            const name = member.username ?? shorten(member.address, 6, 4);
            return (
              <View key={member.address}>
                {index > 0 && <Divider />}
                <View style={styles.member}>
                  <UserAvatar username={name} address={member.address} size={38} online={isMe || !!online[member.address.toLowerCase()]} />
                  <View style={styles.memberText}>
                    <Text variant="bodyLarge" numberOfLines={1}>
                      {member.username ? `@${member.username}` : name}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {isMe ? 'You' : online[member.address.toLowerCase()] ? 'Online' : 'Offline'}
                      {member.address.toLowerCase() === group.createdBy.toLowerCase() ? ' · created the group' : ''}
                    </Text>
                  </View>
                  {!isMe && (
                    <Chip compact onPress={() => onOpenProfile(member.address)}>
                      Profile
                    </Chip>
                  )}
                </View>
              </View>
            );
          })}

          <Button mode="outlined" icon="logout" textColor={theme.colors.error} style={{ borderColor: theme.colors.error }} onPress={leave}>
            Leave group
          </Button>
          <Button onPress={onDismiss}>Close</Button>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: { margin: 16, borderRadius: 20, maxHeight: '88%' },
  content: { padding: 20, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  bold: { fontWeight: '700' },
  invite: { borderRadius: 16, padding: 14, gap: 6 },
  inviteActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  flex: { flex: 1 },
  mono: { fontFamily: 'Menlo' },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  memberText: { flex: 1, minWidth: 0 },
});
