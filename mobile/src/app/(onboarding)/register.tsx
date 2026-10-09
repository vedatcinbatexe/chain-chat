import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, HelperText, Icon, Text, TextInput, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BaseError, ContractFunctionRevertedError, parseEther, type Hex } from 'viem';

import { requestGasDrip } from '@/api/drip';
import { useSystemInfo } from '@/api/system';
import { ensureSession } from '@/auth/session';
import { getPublicClient } from '@/chain/publicClient';
import { isUsernameAvailable, register, updateEncryptionKey, USERNAME_PATTERN } from '@/chain/registry';
import { shorten } from '@/components/CopyableValue';
import { ErrorScreen, LoadingScreen } from '@/components/StatusScreens';
import { useOnboardingState } from '@/onboarding/useOnboardingState';
import { useWalletStore } from '@/wallet/walletStore';

/** Below this balance a drip is requested; registration costs far less on Anvil and Base Sepolia. */
const MIN_GAS_BALANCE = parseEther('0.001');

type StepId = 'signIn' | 'gas' | 'chain';
type StepState = { state: 'idle' | 'active' | 'done' | 'skipped' | 'error'; detail?: string };
const IDLE: Record<StepId, StepState> = { signIn: { state: 'idle' }, gas: { state: 'idle' }, chain: { state: 'idle' } };

export default function RegisterScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const onboarding = useOnboardingState();
  const system = useSystemInfo();
  const address = useWalletStore((state) => state.address);
  const encryptionPublicKey = useWalletStore((state) => state.encryptionPublicKey);
  const removeWallet = useWalletStore((state) => state.remove);

  const [username, setUsername] = useState('');
  const [debounced, setDebounced] = useState('');
  const [steps, setSteps] = useState(IDLE);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(username), 400);
    return () => clearTimeout(timer);
  }, [username]);

  const isValid = USERNAME_PATTERN.test(username);
  const availability = useQuery({
    queryKey: ['username-available', system.data?.chainId, debounced],
    enabled: !!system.data && USERNAME_PATTERN.test(debounced),
    queryFn: () => isUsernameAvailable(system.data!, debounced),
  });
  const available = availability.data === true && debounced === username;

  if (onboarding.kind === 'no-wallet') return <Redirect href="/welcome" />;
  if (onboarding.kind === 'checking' || !system.data || !address || !encryptionPublicKey) {
    return <LoadingScreen label="Checking your wallet on the blockchain…" />;
  }
  if (onboarding.kind === 'error') return <ErrorScreen message={onboarding.message} onRetry={onboarding.retry} />;

  const keyUpdate = onboarding.kind === 'needs-key-update';
  const set = (id: StepId, state: StepState) => setSteps((previous) => ({ ...previous, [id]: state }));

  const run = async () => {
    setRunning(true);
    setSteps(IDLE);
    let current: StepId = 'signIn';
    try {
      set('signIn', { state: 'active' });
      await ensureSession();
      set('signIn', { state: 'done', detail: 'Signed a login message — no password, no gas' });

      current = 'gas';
      set('gas', { state: 'active' });
      const balance = await getPublicClient(system.data).getBalance({ address });
      if (balance >= MIN_GAS_BALANCE) {
        set('gas', { state: 'skipped', detail: 'This wallet already has enough ETH' });
      } else {
        const drip = await requestGasDrip();
        set('gas', { state: 'done', detail: drip.txHash ? `Received ${drip.amountEth} ETH · tx ${shorten(drip.txHash)}` : drip.status });
      }

      current = 'chain';
      set('chain', { state: 'active', detail: 'Waiting for your wallet to sign the transaction…' });
      const onSubmitted = (hash: Hex) => set('chain', { state: 'active', detail: `Waiting for confirmation · tx ${shorten(hash)}` });
      const hash = keyUpdate
        ? await updateEncryptionKey(system.data, encryptionPublicKey, onSubmitted)
        : await register(system.data, username, encryptionPublicKey, onSubmitted);
      set('chain', { state: 'done', detail: `Confirmed · tx ${shorten(hash)}` });

      // Re-read the registration from the chain; the layouts then route to the app.
      await queryClient.invalidateQueries({ queryKey: ['registration'] });
    } catch (error) {
      set(current, { state: 'error', detail: describe(error) });
      setRunning(false);
    }
  };

  const onUseDifferentWallet = () =>
    Alert.alert('Use a different wallet?', 'The current key is deleted from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete key', style: 'destructive', onPress: () => removeWallet() },
    ]);

  const canSubmit = keyUpdate || (isValid && available);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text variant="headlineMedium" style={styles.title}>
              {keyUpdate ? 'Update your key' : 'Choose a username'}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {keyUpdate
                ? `This wallet is registered as @${onboarding.username} with another device's encryption key. Publish this phone's key on-chain so messages can reach you here.`
                : 'Your username is stored on the blockchain, so nobody — not even the ChainChat server — can change it or swap your encryption key.'}
            </Text>
          </View>

          {!keyUpdate && (
            <View>
              <TextInput
                mode="outlined"
                label="Username"
                value={username}
                onChangeText={(text) => setUsername(text.toLowerCase().trim())}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                maxLength={20}
                disabled={running}
                left={<TextInput.Affix text="@" />}
              />
              <UsernameHint username={username} isValid={isValid} checking={availability.isFetching || debounced !== username} available={available} />
            </View>
          )}

          <View style={styles.steps}>
            <Step label="Sign in with your wallet" step={steps.signIn} />
            <Step label="Get test ETH for gas" step={steps.gas} />
            <Step label={keyUpdate ? 'Publish encryption key on-chain' : 'Register username on-chain'} step={steps.chain} />
          </View>

          <Button mode="contained" icon={keyUpdate ? 'key-change' : 'account-check-outline'} onPress={run} loading={running} disabled={running || !canSubmit} contentStyle={styles.buttonContent}>
            {keyUpdate ? 'Update key' : 'Register'}
          </Button>
          <Button mode="text" onPress={onUseDifferentWallet} disabled={running}>
            Use a different wallet
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function UsernameHint({ username, isValid, checking, available }: { username: string; isValid: boolean; checking: boolean; available: boolean }) {
  if (username.length === 0) return <HelperText type="info">3–20 characters: lowercase letters, digits and _</HelperText>;
  if (!isValid) return <HelperText type="error">Use 3–20 characters: lowercase letters, digits and _</HelperText>;
  if (checking) return <HelperText type="info">Checking availability on-chain…</HelperText>;
  return available ? <HelperText type="info">✓ @{username} is available</HelperText> : <HelperText type="error">@{username} is already taken</HelperText>;
}

function Step({ label, step }: { label: string; step: StepState }) {
  const theme = useTheme();
  const icon = { idle: 'circle-outline', done: 'check-circle', skipped: 'check-circle-outline', error: 'alert-circle' } as const;
  const color = step.state === 'error' ? theme.colors.error : step.state === 'idle' ? theme.colors.outline : theme.colors.secondary;

  return (
    <View style={styles.step}>
      {step.state === 'active' ? <ActivityIndicator size={22} /> : <Icon source={icon[step.state]} size={22} color={color} />}
      <View style={styles.stepText}>
        <Text variant="bodyLarge">{label}</Text>
        {step.detail && (
          <Text variant="bodySmall" style={{ color: step.state === 'error' ? theme.colors.error : theme.colors.onSurfaceVariant }}>
            {step.detail}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Turns contract reverts and network failures into a sentence a user understands. */
function describe(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    const name = revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
    const messages: Record<string, string> = {
      UsernameTaken: 'That username was just taken — pick another one.',
      AlreadyRegistered: 'This wallet is already registered.',
      InvalidUsername: 'The contract rejected this username.',
      InvalidEncryptionKey: 'The encryption key is invalid.',
      NotRegistered: 'This wallet is not registered yet.',
    };
    return (name && messages[name]) ?? error.shortMessage;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 24, gap: 20 },
  header: { gap: 8, marginTop: 16 },
  title: { fontWeight: '700' },
  steps: { gap: 16, paddingVertical: 4 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepText: { flex: 1, gap: 2 },
  buttonContent: { paddingVertical: 6 },
});
