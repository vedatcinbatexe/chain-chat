import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Avatar, Button, Card, HelperText, Text, TextInput } from 'react-native-paper';

import { useWalletStore } from '@/wallet/walletStore';

export default function ImportWalletScreen() {
  const importPrivateKey = useWalletStore((state) => state.importPrivateKey);
  const [privateKey, setPrivateKey] = useState('');
  const [hidden, setHidden] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walletReady = useWalletStore((state) => state.status === 'ready');

  // A wallet exists — continue with on-chain registration.
  if (walletReady) return <Redirect href="/register" />;

  const onImport = async () => {
    setImporting(true);
    setError(null);
    try {
      await importPrivateKey(privateKey); // continues to on-chain registration once the wallet is ready
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import this key.');
      setImporting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Card mode="contained">
          <Card.Title title="Test wallets only" left={(props) => <Avatar.Icon {...props} icon="alert-outline" />} />
          <Card.Content>
            <Text variant="bodyMedium">
              Use one of the seeded test accounts (for example an Anvil development key). Never paste a key that holds
              real funds.
            </Text>
          </Card.Content>
        </Card>

        <TextInput
          mode="outlined"
          label="Private key"
          placeholder="0x…"
          value={privateKey}
          onChangeText={setPrivateKey}
          secureTextEntry={hidden}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          right={<TextInput.Icon icon={hidden ? 'eye-outline' : 'eye-off-outline'} onPress={() => setHidden(!hidden)} />}
        />
        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>

        <Button mode="contained" icon="import" onPress={onImport} loading={importing} disabled={importing || !privateKey.trim()}>
          Import
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 12 },
});
