import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Icon, Text, useTheme } from 'react-native-paper';

import { describeError, isBanned } from '@/api/errors';
import { signIn } from '@/auth/session';
import { useWalletStore } from '@/wallet/walletStore';

/**
 * Shown when an administrator blocked this wallet on the server (SDD §4.4). The block is server-side only:
 * the wallet, its username and its funds live on the blockchain and are untouched.
 */
export function BlockedScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const logout = useWalletStore((state) => state.logout);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const checkAgain = async () => {
    setChecking(true);
    setMessage(null);
    try {
      await signIn(); // a successful sign-in clears the blocked state
      await queryClient.invalidateQueries();
    } catch (error) {
      setMessage(isBanned(error) ? 'This account is still blocked.' : describeError(error, 'Could not reach the server.'));
    } finally {
      setChecking(false);
    }
  };

  const onLogout = async () => {
    await logout();
    queryClient.clear();
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Icon source="account-cancel-outline" size={64} color={theme.colors.error} />
      <Text variant="headlineSmall" style={styles.title}>
        Account blocked
      </Text>
      <Text variant="bodyMedium" style={[styles.text, { color: theme.colors.onSurfaceVariant }]}>
        An administrator blocked this account on this ChainChat server. You cannot send messages or join groups here.
      </Text>
      <Text variant="bodySmall" style={[styles.text, { color: theme.colors.onSurfaceVariant }]}>
        Your wallet, username and funds live on the blockchain and are not affected.
      </Text>

      <View style={styles.actions}>
        <Button mode="contained" icon="refresh" onPress={checkAgain} loading={checking} disabled={checking}>
          Check again
        </Button>
        <Button mode="outlined" icon="logout" onPress={onLogout} disabled={checking}>
          Log out
        </Button>
        <HelperText type="error" visible={!!message} style={styles.text}>
          {message}
        </HelperText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { fontWeight: '700' },
  text: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 16 },
});
