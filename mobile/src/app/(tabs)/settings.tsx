import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Divider, List, Text, useTheme } from 'react-native-paper';

import { useSystemInfo } from '@/api/system';
import { useBalances } from '@/chain/useBalances';
import { CopyableValue } from '@/components/CopyableValue';
import { env } from '@/config/env';
import { useOnboardingState } from '@/onboarding/useOnboardingState';
import { useWalletStore } from '@/wallet/walletStore';

export default function SettingsScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const address = useWalletStore((state) => state.address);
  const encryptionPublicKey = useWalletStore((state) => state.encryptionPublicKey);
  const removeWallet = useWalletStore((state) => state.remove);

  const onboarding = useOnboardingState();
  const system = useSystemInfo();
  const balances = useBalances(address);
  const [refreshing, setRefreshing] = useState(false);

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

  const contracts = Object.keys(system.data?.contracts ?? {});

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Card mode="elevated">
        <Card.Title title="Wallet" subtitle="Your identity on ChainChat" />
        <Card.Content style={styles.cardContent}>
          {onboarding.kind === 'complete' && (
            <Text variant="headlineSmall" style={styles.username}>
              @{onboarding.username}
            </Text>
          )}
          {address && <CopyableValue label="Address" value={address} />}
          {encryptionPublicKey && <CopyableValue label="Encryption public key (X25519)" value={encryptionPublicKey} />}
          <Divider />
          <View style={styles.balances}>
            <Balance label="ETH (gas)" value={balances.data?.eth} loading={balances.isLoading} />
            <Balance label="CHAT" value={balances.data ? (balances.data.chat ?? '—') : undefined} loading={balances.isLoading} />
          </View>
          {balances.isError && (
            <Text variant="bodySmall" style={{ color: theme.colors.error }}>
              Could not read balances from the chain ({env.rpcUrl}).
            </Text>
          )}
        </Card.Content>
      </Card>

      <Card mode="elevated">
        <Card.Title title="Network" />
        <Card.Content>
          {system.isLoading && <ActivityIndicator style={styles.loader} />}
          {system.isError && (
            <List.Item
              title="Backend unreachable"
              description={`${env.apiUrl} — is the local stack running?`}
              left={(props) => <List.Icon {...props} icon="cloud-off-outline" color={theme.colors.error} />}
              right={() => <Button onPress={() => system.refetch()}>Retry</Button>}
            />
          )}
          {system.data && (
            <>
              <List.Item
                title={`${system.data.network} · chain ${system.data.chainId}`}
                description="Network"
                left={(props) => <List.Icon {...props} icon="lan" />}
              />
              <List.Item
                title={contracts.length > 0 ? contracts.join(', ') : 'Not deployed yet'}
                description={`${contracts.length} contracts`}
                left={(props) => <List.Icon {...props} icon="file-document-outline" />}
              />
            </>
          )}
          <List.Item title={env.apiUrl} description="API" left={(props) => <List.Icon {...props} icon="server" />} />
          <List.Item title={env.rpcUrl} description="Blockchain RPC" left={(props) => <List.Icon {...props} icon="cube-outline" />} />
        </Card.Content>
      </Card>

      <Card mode="outlined">
        <Card.Title title="Danger zone" titleStyle={{ color: theme.colors.error }} />
        <Card.Content>
          <Button mode="outlined" icon="delete-outline" textColor={theme.colors.error} onPress={onRemove}>
            Remove wallet from this phone
          </Button>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

function Balance({ label, value, loading }: { label: string; value: string | undefined; loading: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.balance}>
      <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {label}
      </Text>
      {loading ? <ActivityIndicator size="small" /> : <Text variant="titleLarge">{value ? formatAmount(value) : '—'}</Text>}
    </View>
  );
}

/** Up to 4 decimals, enough to read a balance at a glance. */
function formatAmount(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: 4 }) : value;
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  cardContent: { gap: 8 },
  username: { fontWeight: '700' },
  balances: { flexDirection: 'row', paddingTop: 8 },
  balance: { flex: 1, gap: 4 },
  loader: { marginVertical: 12 },
});
