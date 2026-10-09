import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { ActivityIndicator, Button, Card, Divider, List, Text, useTheme } from 'react-native-paper';

import { useSystemInfo } from '@/api/system';
import { BalancesRow } from '@/components/BalancesRow';
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
          <BalancesRow address={address} />
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

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  cardContent: { gap: 8 },
  username: { fontWeight: '700' },
  loader: { marginVertical: 12 },
});
