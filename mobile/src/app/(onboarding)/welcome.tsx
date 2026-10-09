import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Icon, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  note: { textAlign: 'center' },
});
