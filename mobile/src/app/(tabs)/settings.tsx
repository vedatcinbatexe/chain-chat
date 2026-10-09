import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, Divider, Text, useTheme } from 'react-native-paper';

import { useSystemInfo } from '@/api/system';
import { claimFaucet } from '@/chain/chatToken';
import { useChatConnectionStore } from '@/chat/connection';
import { InfoRow } from '@/components/InfoRow';
import { ProfileHeader } from '@/components/ProfileHeader';
import { SectionCard } from '@/components/SectionCard';
import { TokenBalances } from '@/components/TokenBalances';
import { env } from '@/config/env';
import { useOnboardingState } from '@/onboarding/useOnboardingState';
import { useWalletStore } from '@/wallet/walletStore';

const CONNECTION_LABELS = {
  connected: { text: 'Connected', icon: 'check-circle' },
  connecting: { text: 'Connecting…', icon: 'progress-clock' },
  reconnecting: { text: 'Reconnecting…', icon: 'progress-clock' },
  disconnected: { text: 'Disconnected', icon: 'close-circle' },
} as const;

export default function SettingsScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const address = useWalletStore((state) => state.address);
  const encryptionPublicKey = useWalletStore((state) => state.encryptionPublicKey);
  const removeWallet = useWalletStore((state) => state.remove);
  const chatStatus = useChatConnectionStore((state) => state.status);

  const onboarding = useOnboardingState();
  const system = useSystemInfo();
  const [refreshing, setRefreshing] = useState(false);
  const [faucet, setFaucet] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });

  const onFaucet = async () => {
    setFaucet({ busy: true, message: null });
    try {
      await claimFaucet(system.data!);
      await queryClient.invalidateQueries({ queryKey: ['balances'] });
      setFaucet({ busy: false, message: 'Received 100 test CHAT.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setFaucet({ busy: false, message: text.includes('FaucetCooldown') ? 'The faucet gives 100 CHAT once per day — try again tomorrow.' : 'Faucet failed.' });
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setRefreshing(false);
  };

  const onRemove = () =>
    Alert.alert(
      'Remove wallet from this phone?',
      'The private key is deleted from secure storage. Without a backup of the key, this identity cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeWallet() },
      ],
    );

  if (!address) return null;
  const username = onboarding.kind === 'complete' ? onboarding.username : null;
  const contracts = Object.keys(system.data?.contracts ?? {});
  const connection = CONNECTION_LABELS[chatStatus];

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <ProfileHeader
        username={username}
        address={address}
        chips={
          <Chip compact icon="shield-check-outline">
            Registered on-chain
          </Chip>
        }
      />

      <SectionCard title="Assets" icon="wallet-outline" subtitle="Read directly from the blockchain">
        <TokenBalances address={address} />
        {system.data?.contracts.ChatToken && (
          <Button mode="contained-tonal" icon="water" onPress={onFaucet} loading={faucet.busy} disabled={faucet.busy}>
            Get 100 test CHAT
          </Button>
        )}
        {faucet.message && (
          <Text variant="bodySmall" style={[styles.centered, { color: theme.colors.onSurfaceVariant }]}>
            {faucet.message}
          </Text>
        )}
      </SectionCard>

      <SectionCard title="Identity & keys" icon="key-outline" subtitle="Your private keys never leave this phone">
        <InfoRow icon="wallet" label="Wallet address (secp256k1)" value={address} mono copyable />
        <Divider />
        {encryptionPublicKey && (
          <InfoRow
            icon="lock-outline"
            label="Encryption public key (X25519)"
            value={encryptionPublicKey}
            mono
            copyable
            footer={
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Published in the Registry contract — others encrypt to this key.
              </Text>
            }
          />
        )}
      </SectionCard>

      <SectionCard title="Network" icon="lan" subtitle={system.data ? `${system.data.network} · chain ${system.data.chainId}` : undefined}>
        {system.isError ? (
          <View style={styles.errorBox}>
            <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
              Backend unreachable — is the local stack running?
            </Text>
            <Button mode="outlined" icon="refresh" onPress={() => system.refetch()}>
              Retry
            </Button>
          </View>
        ) : (
          <InfoRow icon={connection.icon} label="Real-time chat" value={connection.text} />
        )}
        <Divider />
        <InfoRow icon="server" label="API" value={env.apiUrl} />
        <InfoRow icon="cube-outline" label="Blockchain RPC" value={env.rpcUrl} />
        {contracts.length > 0 && (
          <View style={styles.contracts}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Deployed contracts
            </Text>
            <View style={styles.chipWrap}>
              {contracts.map((name) => (
                <Chip key={name} compact icon="file-document-outline">
                  {name}
                </Chip>
              ))}
            </View>
          </View>
        )}
      </SectionCard>

      <SectionCard title="Danger zone" icon="alert-outline" tone="danger" subtitle="Removing the wallet cannot be undone without a key backup">
        <Button mode="outlined" icon="delete-outline" textColor={theme.colors.error} style={{ borderColor: theme.colors.error }} onPress={onRemove}>
          Remove wallet from this phone
        </Button>
      </SectionCard>

      <Text variant="labelSmall" style={[styles.centered, styles.footer, { color: theme.colors.outline }]}>
        ChainChat · BLM3730 Blockchain Basics · YTÜ
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  centered: { textAlign: 'center' },
  errorBox: { gap: 8 },
  contracts: { gap: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  footer: { marginTop: 4 },
});
