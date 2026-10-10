import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, Dialog, Divider, HelperText, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { isAddress } from 'viem';

import { useSystemInfo } from '@/api/system';
import { claimFaucet } from '@/chain/chatToken';
import { transferBadge, useOwnedBadges } from '@/chain/classBadge';
import { useChatConnectionStore } from '@/chat/connection';
import { BadgesSheet } from '@/components/BadgesSheet';
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
  const router = useRouter();
  const address = useWalletStore((state) => state.address);
  const encryptionPublicKey = useWalletStore((state) => state.encryptionPublicKey);
  const removeWallet = useWalletStore((state) => state.remove);
  const logout = useWalletStore((state) => state.logout);
  const chatStatus = useChatConnectionStore((state) => state.status);

  const onboarding = useOnboardingState();
  const system = useSystemInfo();
  const [refreshing, setRefreshing] = useState(false);
  const [faucet, setFaucet] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
  const ownedBadges = useOwnedBadges(address);
  const [badgeToken, setBadgeToken] = useState<bigint | null>(null);
  const [showBadges, setShowBadges] = useState(false);
  const [badgeDialog, setBadgeDialog] = useState(false);
  const [badgeTo, setBadgeTo] = useState('');
  const [badge, setBadge] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const onTransferBadge = async () => {
    const to = badgeTo.trim();
    const tokenId = badgeToken ?? ownedBadges.data?.[0]?.tokenId;
    if (tokenId === undefined) return setBadge({ busy: false, error: 'Choose a badge to transfer.' });
    if (!isAddress(to)) return setBadge({ busy: false, error: 'Enter a full wallet address (0x…).' });
    setBadge({ busy: true, error: null });
    try {
      await transferBadge(system.data!, to, tokenId);
      await queryClient.invalidateQueries({ queryKey: ['balances'] });
      await queryClient.invalidateQueries({ queryKey: ['badge'] });
      setBadgeDialog(false);
      setBadgeTo('');
      setBadgeToken(null);
      setBadge({ busy: false, error: null });
    } catch (error) {
      console.warn('Badge transfer failed', error);
      setBadge({ busy: false, error: 'The transfer failed. Check the address and that you have ETH for gas.' });
    }
  };

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

  const onLogout = () =>
    Alert.alert('Log out?', 'Your wallet stays saved on this phone. You can log back in with one tap, as the same user.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        onPress: async () => {
          await logout();
          queryClient.clear(); // drop the cached chats of this session
        },
      },
    ]);

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
        <View style={styles.actionsRow}>
          <Button mode="contained" icon="bank-transfer-out" style={styles.actionButton} onPress={() => router.push({ pathname: '/send', params: { to: 'exchange' } })}>
            Withdraw
          </Button>
          <Button mode="contained-tonal" icon="send-outline" style={styles.actionButton} onPress={() => router.push({ pathname: '/send', params: { to: 'address' } })}>
            Send
          </Button>
        </View>
        <Text variant="labelSmall" style={[styles.centered, { color: theme.colors.onSurfaceVariant }]}>
          Withdraw to your wallet on the exchange portal, or send to any address. To deposit, use the portal with your username.
        </Text>
        {system.data?.contracts.ChatToken && (
          <Button mode="contained-tonal" icon="water" onPress={onFaucet} loading={faucet.busy} disabled={faucet.busy}>
            Get 100 test CHAT
          </Button>
        )}
        {system.data?.contracts.ClassBadge && (
          <Button mode="outlined" icon="certificate-outline" onPress={() => setShowBadges(true)}>
            View badges
          </Button>
        )}
        {!!ownedBadges.data?.length && (
          <View style={styles.contracts}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              My badges (ERC-721) — they unlock badge-gated groups
            </Text>
            <View style={styles.chipWrap}>
              {ownedBadges.data.map((owned) => (
                <Chip key={owned.tokenId.toString()} compact icon="certificate-outline">
                  {owned.type.name} #{owned.tokenId.toString()}
                </Chip>
              ))}
            </View>
            <Button mode="outlined" icon="send-outline" onPress={() => setBadgeDialog(true)}>
              Transfer a badge
            </Button>
          </View>
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

      <SectionCard title="Session" icon="account-circle-outline" subtitle="Logging out keeps your wallet on this phone">
        <Button mode="contained-tonal" icon="logout" onPress={onLogout}>
          Log out
        </Button>
      </SectionCard>

      <SectionCard title="Danger zone" icon="alert-outline" tone="danger" subtitle="Removing the wallet cannot be undone without a key backup">
        <Button mode="outlined" icon="delete-outline" textColor={theme.colors.error} style={{ borderColor: theme.colors.error }} onPress={onRemove}>
          Remove wallet from this phone
        </Button>
      </SectionCard>

      <BadgesSheet address={address} title="My badges" visible={showBadges} onDismiss={() => setShowBadges(false)} />
      <Portal>
        <Dialog visible={badgeDialog} onDismiss={() => !badge.busy && setBadgeDialog(false)}>
          <Dialog.Title>Transfer a badge</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Sends the badge (ERC-721) to another wallet. You are removed from every group that requires a badge you no longer hold, and can no longer read new messages there.
            </Text>
            <View style={[styles.chipWrap, styles.dialogInput]}>
              {ownedBadges.data?.map((owned, index) => {
                const selected = badgeToken === null ? index === 0 : badgeToken === owned.tokenId;
                return (
                  <Chip key={owned.tokenId.toString()} compact selected={selected} mode={selected ? 'flat' : 'outlined'} onPress={() => setBadgeToken(owned.tokenId)} disabled={badge.busy}>
                    {owned.type.name} #{owned.tokenId.toString()}
                  </Chip>
                );
              })}
            </View>
            <TextInput
              mode="outlined"
              label="Recipient address"
              placeholder="0x…"
              value={badgeTo}
              onChangeText={(value) => {
                setBadgeTo(value);
                setBadge({ busy: false, error: null });
              }}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.dialogInput}
            />
            <HelperText type="error" visible={!!badge.error}>
              {badge.error}
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setBadgeDialog(false)} disabled={badge.busy}>
              Cancel
            </Button>
            <Button mode="contained" onPress={onTransferBadge} loading={badge.busy} disabled={badge.busy}>
              Transfer
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

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
  actionsRow: { flexDirection: 'row', gap: 8 },
  actionButton: { flex: 1 },
  dialogInput: { marginTop: 12 },
});
