import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, HelperText, Portal, Text, TextInput, useTheme } from 'react-native-paper';

import { conversationsQueryKey, useConversations } from '@/api/conversations';
import { createGroup, groupQueryKey, parseInviteCode } from '@/api/groups';
import { ConversationRow } from '@/chat/ui/ConversationRow';
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

  const open = (kind: 'create' | 'join') => {
    setInput('');
    setError(null);
    setDialog(kind);
  };

  const create = async () => {
    const name = input.trim();
    if (!name) return setError('Give the group a name.');
    setBusy(true);
    try {
      const group = await createGroup(name);
      queryClient.setQueryData(groupQueryKey(group.conversationId), group);
      await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
      setDialog(null);
      router.push({ pathname: '/group/[id]', params: { id: group.conversationId } });
    } catch (e) {
      setError((e as Error).message);
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
  if (conversations.isError) return <ErrorScreen message={conversations.error.message} onRetry={() => conversations.refetch()} />;

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
});
