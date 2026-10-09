import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, Divider, Icon, Text, useTheme } from 'react-native-paper';
import type { Address } from 'viem';

import { useSystemInfo } from '@/api/system';
import { useUserProfile } from '@/api/users';
import { readRegistration } from '@/chain/registry';
import { InfoRow } from '@/components/InfoRow';
import { ProfileHeader } from '@/components/ProfileHeader';
import { SectionCard } from '@/components/SectionCard';
import { ErrorScreen, LoadingScreen } from '@/components/StatusScreens';
import { TokenBalances } from '@/components/TokenBalances';
import { useWalletStore } from '@/wallet/walletStore';

export default function UserProfileScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const router = useRouter();
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
  const verification: Verification = onChain.isPending
    ? 'checking'
    : onChain.isError
      ? 'unreadable'
      : !onChain.data.registered
        ? 'not-registered'
        : chainKey?.toLowerCase() === user.encryptionPublicKey.toLowerCase()
          ? 'verified'
          : 'mismatch';

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

      <ProfileHeader
        username={user.username}
        address={user.address}
        chips={
          <>
            {isMe && (
              <Chip compact icon="account">
                This is you
              </Chip>
            )}
            {verification === 'verified' && (
              <Chip compact icon="shield-check">
                Verified on-chain
              </Chip>
            )}
          </>
        }
        actions={
          !isMe && (
            <Button
              mode="contained"
              icon="message-lock-outline"
              style={styles.primaryAction}
              contentStyle={styles.buttonContent}
              onPress={() => router.push({ pathname: '/chat/[address]', params: { address: user.address } })}>
              Send encrypted message
            </Button>
          )
        }
      />

      <KeyVerificationBanner state={verification} />

      <SectionCard title="Holdings" icon="wallet-outline" subtitle={system.data ? `${system.data.network} · chain ${system.data.chainId}` : undefined}>
        <TokenBalances address={user.address} />
      </SectionCard>

      <SectionCard title="Identity & keys" icon="key-outline">
        <InfoRow icon="wallet" label="Wallet address" value={user.address} mono copyable />
        <Divider />
        {/* The key read from the chain; the backend's copy is shown only while the chain is loading. */}
        <InfoRow icon="lock-outline" label="Encryption public key (X25519)" value={chainKey ?? user.encryptionPublicKey} mono copyable />
      </SectionCard>

      <SectionCard title="On-chain record" icon="cube-outline" subtitle="Where this identity was created">
        <InfoRow icon="counter" label="Registered in block" value={user.registeredAtBlock.toLocaleString()} />
        <Divider />
        <InfoRow icon="swap-horizontal" label="Registration transaction" value={user.registrationTxHash} mono copyable />
      </SectionCard>
    </ScrollView>
  );
}

type Verification = 'checking' | 'unreadable' | 'not-registered' | 'verified' | 'mismatch';

/** Whether the key the server returned is the one in the Registry contract (SDD §8.2: man-in-the-middle protection). */
function KeyVerificationBanner({ state }: { state: Verification }) {
  const theme = useTheme();
  const good = state === 'verified';
  const neutral = state === 'checking';

  const content = {
    checking: { icon: 'progress-clock', title: 'Checking the key on the blockchain…', text: 'Comparing with the Registry contract.' },
    unreadable: { icon: 'cloud-alert-outline', title: 'Key not verified', text: 'Could not read the Registry contract.' },
    'not-registered': { icon: 'alert-outline', title: 'Not registered on-chain', text: 'Do not trust this profile.' },
    verified: { icon: 'shield-check', title: 'Encryption key verified', text: 'The server shows the same key as the Registry contract, so messages to this user cannot be intercepted by a man in the middle.' },
    mismatch: { icon: 'shield-alert', title: 'Server key differs from the chain', text: 'ChainChat only uses the key from the Registry contract.' },
  }[state];

  const background = neutral ? theme.colors.surfaceVariant : good ? theme.colors.secondaryContainer : theme.colors.errorContainer;
  const foreground = neutral ? theme.colors.onSurfaceVariant : good ? theme.colors.onSecondaryContainer : theme.colors.onErrorContainer;

  return (
    <View style={[styles.banner, { backgroundColor: background }]}>
      <Icon source={content.icon} size={24} color={foreground} />
      <View style={styles.bannerText}>
        <Text variant="titleSmall" style={{ color: foreground }}>
          {content.title}
        </Text>
        <Text variant="bodySmall" style={{ color: foreground }}>
          {content.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  primaryAction: { flex: 1, borderRadius: 14 },
  buttonContent: { paddingVertical: 6 },
  banner: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, alignItems: 'flex-start' },
  bannerText: { flex: 1, minWidth: 0, gap: 2 },
});
