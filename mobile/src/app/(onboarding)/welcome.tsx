import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Icon, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { shorten } from '@/components/CopyableValue';
import { UserAvatar } from '@/components/UserAvatar';
import { useWalletStore } from '@/wallet/walletStore';

const FEATURES = [
  { icon: 'wallet-outline', text: 'Your wallet is your identity — no phone number, no password.' },
  { icon: 'lock-outline', text: 'Messages are end-to-end encrypted. The server only sees ciphertext.' },
  { icon: 'link-variant', text: 'Usernames, payments and message proofs are verifiable on the blockchain.' },
] as const;

export default function WelcomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const create = useWalletStore((state) => state.create);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walletReady = useWalletStore((state) => state.status === 'ready');
  // Logged out: the wallet is still saved on this phone.
  const lockedAddress = useWalletStore((state) => state.lockedAddress);
  const login = useWalletStore((state) => state.login);
  const remove = useWalletStore((state) => state.remove);
  const [loggingIn, setLoggingIn] = useState(false);

  // A wallet exists — continue with on-chain registration.
  if (walletReady) return <Redirect href="/register" />;

  const onCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await create(); // continues to on-chain registration once the wallet is ready
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the wallet.');
      setCreating(false);
    }
  };

  const onLogin = async () => {
    setLoggingIn(true);
    setError(null);
    try {
      await login(); // the layout continues to the app once the wallet is unlocked
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unlock the wallet.');
      setLoggingIn(false);
    }
  };

  const onForget = () =>
    Alert.alert(
      'Remove wallet from this phone?',
      'The private key is deleted from secure storage. Without a backup of the key, this identity cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => remove() },
      ],
    );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.logo, { backgroundColor: theme.colors.primaryContainer }]}>
            <Icon source="message-lock-outline" size={44} color={theme.colors.primary} />
          </View>
          <Text variant="displaySmall" style={styles.title}>
            ChainChat
          </Text>
          <Text variant="bodyLarge" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
            Private messaging where the blockchain holds trust.
          </Text>
        </View>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.icon} style={styles.feature}>
              <Icon source={feature.icon} size={24} color={theme.colors.secondary} />
              <Text variant="bodyMedium" style={styles.featureText}>
                {feature.text}
              </Text>
            </View>
          ))}
        </View>

        {lockedAddress ? (
          <View style={styles.actions}>
            <View style={[styles.saved, { backgroundColor: theme.colors.surfaceVariant }]}>
              <UserAvatar username={lockedAddress.slice(2)} address={lockedAddress} size={40} icon="wallet" />
              <View style={styles.savedText}>
                <Text variant="titleSmall">Welcome back</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Wallet {shorten(lockedAddress, 8, 6)} is saved on this phone
                </Text>
              </View>
            </View>
            <Button mode="contained" icon="login" onPress={onLogin} loading={loggingIn} disabled={loggingIn} contentStyle={styles.buttonContent}>
              Log in
            </Button>
            <Button mode="text" icon="delete-outline" textColor={theme.colors.error} onPress={onForget} disabled={loggingIn}>
              Remove this wallet and use another
            </Button>
            <HelperText type="error" visible={!!error}>
              {error}
            </HelperText>
          </View>
        ) : (
          <View style={styles.actions}>
            <Button mode="contained" icon="plus" onPress={onCreate} loading={creating} disabled={creating} contentStyle={styles.buttonContent}>
              Create new wallet
            </Button>
            <Button mode="outlined" icon="key-outline" onPress={() => router.push('/import')} disabled={creating} contentStyle={styles.buttonContent}>
              Import test wallet
            </Button>
            <HelperText type="error" visible={!!error}>
              {error}
            </HelperText>
            <Text variant="bodySmall" style={[styles.note, { color: theme.colors.onSurfaceVariant }]}>
              Keys are created on this phone and stored only in its secure storage.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, padding: 24, justifyContent: 'space-between', gap: 32 },
  hero: { alignItems: 'center', marginTop: 32, gap: 12 },
  logo: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '700' },
  subtitle: { textAlign: 'center' },
  features: { gap: 18 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureText: { flex: 1 },
  actions: { gap: 12 },
  buttonContent: { paddingVertical: 6 },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16 },
  savedText: { flex: 1, minWidth: 0 },
  note: { textAlign: 'center' },
});
