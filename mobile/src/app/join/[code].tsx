import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, useTheme } from 'react-native-paper';

import { conversationsQueryKey } from '@/api/conversations';
import { getInvitePreview, groupQueryKey, joinGroup } from '@/api/groups';
import { ErrorScreen, LoadingScreen } from '@/components/StatusScreens';
import { UserAvatar } from '@/components/UserAvatar';
import { useOnboardingState } from '@/onboarding/useOnboardingState';

/** Where an invite link (chainchat://join/CODE) lands: shows the group and lets the user join it. */
export default function JoinGroupScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { code } = useLocalSearchParams<{ code: string }>();
  const onboarding = useOnboardingState();
  const ready = onboarding.kind === 'complete';
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['invite', code],
    enabled: ready,
    queryFn: () => getInvitePreview(code),
    retry: false,
  });

  // Only registered wallets can join; the normal onboarding flow takes over, the link can be opened again after.
  if (onboarding.kind === 'no-wallet') return <Redirect href="/welcome" />;
  if (onboarding.kind === 'needs-registration' || onboarding.kind === 'needs-key-update') return <Redirect href="/register" />;
  if (onboarding.kind === 'error') return <ErrorScreen message={onboarding.message} onRetry={onboarding.retry} />;
  if (!ready || preview.isPending) return <LoadingScreen label="Looking up the invite…" />;
  if (preview.isError) return <ErrorScreen message="This invite link is not valid (anymore)." onRetry={() => preview.refetch()} />;

  const group = preview.data;
  const full = !group.alreadyMember && group.memberCount >= group.maxMembers;
  const openGroup = () => router.replace({ pathname: '/group/[id]', params: { id: group.conversationId } });

  const join = async () => {
    setJoining(true);
    setError(null);
    try {
      const joined = await joinGroup(code);
      queryClient.setQueryData(groupQueryKey(joined.conversationId), joined);
      await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
      openGroup();
    } catch (e) {
      setError((e as Error).message);
      setJoining(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <UserAvatar username={group.name} address={group.conversationId} icon="account-group" size={88} />
      <Text variant="headlineSmall" style={styles.name}>
        {group.name}
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {group.memberCount} of {group.maxMembers} members
        {group.createdByUsername ? ` · created by @${group.createdByUsername}` : ''}
      </Text>
      <Text variant="bodySmall" style={[styles.note, { color: theme.colors.onSurfaceVariant }]}>
        Messages are end-to-end encrypted. You will be able to read messages sent after you join.
      </Text>

      {group.alreadyMember ? (
        <Button mode="contained" icon="message-text-outline" onPress={openGroup} style={styles.button}>
          Open group
        </Button>
      ) : (
        <Button mode="contained" icon="account-plus-outline" onPress={join} loading={joining} disabled={joining || full} style={styles.button}>
          {full ? 'Group is full' : 'Join group'}
        </Button>
      )}
      <HelperText type="error" visible={!!error}>
        {error}
      </HelperText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  name: { fontWeight: '700', textAlign: 'center', marginTop: 8 },
  note: { textAlign: 'center', marginTop: 4 },
  button: { alignSelf: 'stretch', marginTop: 16 },
});
