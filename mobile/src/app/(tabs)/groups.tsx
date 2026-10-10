import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Chip, Dialog, HelperText, Portal, Text, TextInput, useTheme } from 'react-native-paper';

import { conversationsQueryKey, useConversations } from '@/api/conversations';
import { describeError } from '@/api/errors';
import { createGroup, groupQueryKey, parseInviteCode } from '@/api/groups';
import { useBadgeTypes, useOwnedBadges } from '@/chain/classBadge';
import { ConversationRow } from '@/chat/ui/ConversationRow';
import { useWalletStore } from '@/wallet/walletStore';
import { EmptyState } from '@/components/EmptyState';
import { ErrorScreen } from '@/components/StatusScreens';

const MAX_NAME_LENGTH = 48;

/** My groups, plus creating one and joining one from a pasted invite link. */
export default function GroupsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const conversations = useConversations();
  const [dialog, setDialog] = useState<'create' | 'join' | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // NFT gating: the badge types (read from the chain) members must hold; the creator needs them too.
  const me = useWalletStore((state) => state.address);
  const badgeTypes = useBadgeTypes();
  const ownedBadges = useOwnedBadges(me);
  const heldTypes = new Set(ownedBadges.data?.map((b) => b.type.id));
  const [requiredBadges, setRequiredBadges] = useState<number[]>([]);

  const open = (kind: 'create' | 'join') => {
    setInput('');
    setError(null);
    setRequiredBadges([]);
    setDialog(kind);
  };

  const create = async () => {
    const name = input.trim();
    if (!name) return setError('Give the group a name.');
    setBusy(true);
    try {
      const group = await createGroup(name, requiredBadges);
      queryClient.setQueryData(groupQueryKey(group.conversationId), group);
      await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
      setDialog(null);
      router.push({ pathname: '/group/[id]', params: { id: group.conversationId } });
    } catch (e) {
      setError(describeError(e, 'Could not create the group. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const join = () => {
    const code = parseInviteCode(input);
    if (!code) return setError('That does not look like an invite link or code.');
    setDialog(null);
    router.push({ pathname: '/join/[code]', params: { code } });
  };

  if (conversations.isPending) return <ActivityIndicator style={styles.loader} />;
  if (conversations.isError) return <ErrorScreen message={describeError(conversations.error, 'Could not load your groups.')} onRetry={() => conversations.refetch()} />;

  const groups = conversations.data.filter((c) => c.type === 'Group');

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <View style={styles.actions}>
        <Button mode="contained" icon="plus" onPress={() => open('create')} style={styles.flex}>
          New group
        </Button>
        <Button mode="contained-tonal" icon="link-variant" onPress={() => open('join')} style={styles.flex}>
          Join with link
        </Button>
      </View>

      {groups.length === 0 ? (
        <EmptyState icon="account-group-outline" title="No groups yet" description="Create a group and share its invite link, or paste a link someone sent you." />
      ) : (
        <FlatList data={groups} keyExtractor={(c) => c.id} renderItem={({ item }) => <ConversationRow conversation={item} />} />
      )}

      <Portal>
        <Dialog visible={dialog !== null} onDismiss={() => !busy && setDialog(null)}>
          <Dialog.Title>{dialog === 'join' ? 'Join a group' : 'New group'}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
              {dialog === 'join' ? 'Paste the invite link or code.' : 'You get an invite link to share right after creating it.'}
            </Text>
            <TextInput
              mode="outlined"
              autoFocus
              label={dialog === 'join' ? 'Invite link' : 'Group name'}
              value={input}
              onChangeText={(value) => {
                setInput(value);
                setError(null);
              }}
              maxLength={dialog === 'join' ? 200 : MAX_NAME_LENGTH}
              autoCapitalize={dialog === 'join' ? 'none' : 'sentences'}
              autoCorrect={false}
              onSubmitEditing={dialog === 'join' ? join : create}
            />
            {dialog === 'create' && !!badgeTypes.data?.length && (
              <View style={styles.badges}>
                <Text variant="titleSmall">Required badges (optional)</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  NFT-gated: only wallets holding every selected badge can join. You can only require badges you hold yourself.
                </Text>
                <View style={styles.badgeChips}>
                  {badgeTypes.data.map((type) => {
                    const selected = requiredBadges.includes(type.id);
                    const held = heldTypes.has(type.id);
                    return (
                      <Chip
                        key={type.id}
                        compact
                        mode={selected ? 'flat' : 'outlined'}
                        selected={selected}
                        disabled={busy || !held}
                        icon={held ? 'certificate-outline' : 'lock-outline'}
                        onPress={() => setRequiredBadges((current) => (selected ? current.filter((id) => id !== type.id) : [...current, type.id]))}>
                        {type.name}
                      </Chip>
                    );
                  })}
                </View>
              </View>
            )}
            <HelperText type="error" visible={!!error}>
              {error}
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button mode="contained" onPress={dialog === 'join' ? join : create} loading={busy} disabled={busy}>
              {dialog === 'join' ? 'Continue' : 'Create'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loader: { marginTop: 48 },
  actions: { flexDirection: 'row', gap: 10, padding: 16 },
  flex: { flex: 1 },
  hint: { marginBottom: 12 },
  badges: { gap: 6, marginTop: 14 },
  badgeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
});
