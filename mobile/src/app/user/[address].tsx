import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Divider, HelperText, Icon, Text, useTheme } from 'react-native-paper';
import type { Address } from 'viem';

import { useSystemInfo } from '@/api/system';
import { useUserProfile } from '@/api/users';
import { readRegistration } from '@/chain/registry';
import { BalancesRow } from '@/components/BalancesRow';
import { CopyableValue } from '@/components/CopyableValue';
import { ErrorScreen, LoadingScreen } from '@/components/StatusScreens';
import { UserAvatar } from '@/components/UserAvatar';
import { useWalletStore } from '@/wallet/walletStore';

export default function UserProfileScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { address } = useLocalSearchParams<{ address: string }>();
  const myAddress = useWalletStore((state) => state.address);
  const system = useSystemInfo();
  const profile = useUserProfile(address);
  const [refreshing, setRefreshing] = useState(false);

  // The backend is a directory, not the authority: read the same registration from the Registry contract.
  const onChain = useQuery({
    queryKey: ['registration', system.data?.chainId, address],
    enabled: !!system.data && !!address,
    queryFn: () => readRegistration(system.data!, address as Address),
  });

  if (profile.isPending) return <LoadingScreen label="Loading profile…" />;
  if (profile.isError) return <ErrorScreen message={profile.error.message} onRetry={() => profile.refetch()} />;

  const user = profile.data;
  const isMe = user.address.toLowerCase() === myAddress?.toLowerCase();
  const chainKey = onChain.data?.encryptionKey ?? null;
  const keyMatches = chainKey !== null && chainKey.toLowerCase() === user.encryptionPublicKey.toLowerCase();

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Stack.Screen options={{ title: `@${user.username}` }} />

      <View style={styles.header}>
        <UserAvatar username={user.username} address={user.address} size={88} />
        <Text variant="headlineMedium" style={styles.username}>
          @{user.username}
        </Text>
        {isMe && <Chip icon="account">This is you</Chip>}
      </View>

      <Card mode="elevated">
        <Card.Title title="Identity" />
        <Card.Content style={styles.cardContent}>
          <CopyableValue label="Wallet address" value={user.address} />
          {/* Show the key read from the chain; fall back to the backend's copy only while the chain is loading. */}
          <CopyableValue label="Encryption public key (X25519)" value={chainKey ?? user.encryptionPublicKey} />
          <KeyVerification loading={onChain.isPending} failed={onChain.isError} registered={onChain.data?.registered ?? false} matches={keyMatches} />
        </Card.Content>
      </Card>

      <Card mode="elevated">
        <Card.Title title="Wallet holdings" subtitle={system.data ? `${system.data.network} · chain ${system.data.chainId}` : undefined} />
        <Card.Content>
          <BalancesRow address={user.address} />
        </Card.Content>
      </Card>

      <Card mode="elevated">
        <Card.Title title="On-chain record" />
        <Card.Content style={styles.cardContent}>
          <View style={styles.recordRow}>
            <Icon source="cube-outline" size={20} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodyMedium">Registered in block {user.registeredAtBlock.toLocaleString()}</Text>
          </View>
          <Divider />
          <CopyableValue label="Registration transaction" value={user.registrationTxHash} />
        </Card.Content>
      </Card>

      {!isMe && (
        <View>
          <Button mode="contained" icon="message-lock-outline" disabled contentStyle={styles.buttonContent}>
            Send encrypted message
          </Button>
          <HelperText type="info" style={styles.centered}>
            End-to-end encrypted chats arrive in the next step.
          </HelperText>
        </View>
      )}
    </ScrollView>
  );
}

/** Whether the encryption key the server returned is the one in the Registry contract (SDD §8.2: MITM protection). */
function KeyVerification({ loading, failed, registered, matches }: { loading: boolean; failed: boolean; registered: boolean; matches: boolean }) {
  const theme = useTheme();
  const [icon, color, text] = loading
    ? ['progress-clock', theme.colors.onSurfaceVariant, 'Checking the key on the blockchain…']
    : failed
      ? ['cloud-alert-outline', theme.colors.error, 'Could not read the Registry contract — key not verified.']
      : !registered
        ? ['alert-outline', theme.colors.error, 'Not registered on-chain — do not trust this profile.']
        : matches
          ? ['shield-check', theme.colors.secondary, 'Verified on-chain: the server shows the same key as the Registry contract.']
          : ['shield-alert', theme.colors.error, "The server's key differs from the Registry contract. ChainChat only uses the on-chain key."];

  return (
    <View style={styles.verification}>
      <Icon source={icon} size={20} color={color} />
      <Text variant="bodySmall" style={[styles.verificationText, { color }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  header: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  username: { fontWeight: '700' },
  cardContent: { gap: 10 },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  verification: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  verificationText: { flex: 1 },
  buttonContent: { paddingVertical: 6 },
  centered: { textAlign: 'center' },
});
