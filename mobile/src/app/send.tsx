import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Chip, HelperText, Icon, SegmentedButtons, Text, TextInput, TouchableRipple, useTheme } from 'react-native-paper';
import { formatUnits, type Address, type Hex } from 'viem';

import { ApiError } from '@/api/client';
import { EXCHANGE_ACCOUNT_PATTERN, loadExchangeAccount, saveExchangeAccount, useExchangeWallets, type ExchangeWallet } from '@/api/exchange';
import { useSystemInfo } from '@/api/system';
import { GAS_RESERVE_WEI, parseAmountInput, resolveRecipient, sendAsset } from '@/chain/assets';
import { useBalances } from '@/chain/useBalances';
import { shorten } from '@/components/CopyableValue';
import { DismissKeyboard } from '@/components/DismissKeyboard';
import { SectionCard } from '@/components/SectionCard';
import { LoadingScreen } from '@/components/StatusScreens';
import { notify } from '@/notifications/store';
import { useWalletStore } from '@/wallet/walletStore';

const format = (wei: bigint) => Number(formatUnits(wei, 18)).toLocaleString(undefined, { maximumFractionDigits: 6 });

interface Sent {
  txHash: Hex;
  text: string;
  to: Address;
  /** The exchange wallet's or user's name, if known. */
  label: string | null;
  withdrawal: boolean;
}

/**
 * Sends ETH or a token from this wallet to any address: another ChainChat user, or a wallet on the exchange
 * portal (a withdrawal). The transaction is signed on this phone and goes straight to the chain (SDD §4.5).
 */
export default function SendScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useWalletStore((state) => state.address);
  const system = useSystemInfo();
  const balances = useBalances(me);

  const [symbol, setSymbol] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [recipientText, setRecipientText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);

  // Where it goes: one of the user's wallets on the exchange portal (a withdrawal), or any address or user.
  const params = useLocalSearchParams<{ to?: string }>();
  const [destination, setDestination] = useState<'exchange' | 'address'>(params.to === 'address' ? 'address' : 'exchange');
  const [exchangeAccount, setExchangeAccount] = useState<string | null>(null);
  const [accountText, setAccountText] = useState('');
  const [exchangeWallet, setExchangeWallet] = useState<ExchangeWallet | null>(null);
  const exchangeWallets = useExchangeWallets(exchangeAccount);

  // The exchange account linked earlier on this phone.
  useEffect(() => {
    loadExchangeAccount()
      .then((saved) => saved && setExchangeAccount(saved))
      .catch(() => undefined);
  }, []);

  const linkAccount = async () => {
    const name = accountText.trim().toLowerCase();
    if (!EXCHANGE_ACCOUNT_PATTERN.test(name)) return setError('An exchange account name has 2–32 characters: lowercase letters, digits, - or _.');
    setError(null);
    setExchangeWallet(null);
    setExchangeAccount(name);
    await saveExchangeAccount(name).catch(() => undefined);
  };
  const unlinkAccount = async () => {
    setExchangeAccount(null);
    setExchangeWallet(null);
    setAccountText('');
    await saveExchangeAccount(null).catch(() => undefined);
  };

  if (!system.data || !balances.data || !me) return <LoadingScreen label="Reading your balances from the blockchain…" />;

  const assets = balances.data.assets;
  // Start on the first token the wallet actually holds, otherwise the first asset.
  const selected = assets.find((a) => a.symbol === symbol) ?? assets.find((a) => a.token && a.wei > 0n) ?? assets[0];
  const info = system.data.assets?.find((a) => a.symbol === selected?.symbol);
  if (!selected || !info) return <LoadingScreen label="No assets are available on this network." />;

  // ETH pays for gas: when sending ETH itself, a little stays behind.
  const spendable = selected.token ? selected.wei : selected.wei > GAS_RESERVE_WEI ? selected.wei - GAS_RESERVE_WEI : 0n;
  const noGas = (assets.find((a) => !a.token)?.wei ?? 0n) === 0n;

  const send = async () => {
    setError(null);
    const amount = parseAmountInput(amountText);
    if (amount === null) return setError('Enter an amount greater than zero.');
    if (amount > spendable) return setError(selected.token ? `You only have ${format(selected.wei)} ${selected.symbol}.` : `You can send at most ${format(spendable)} ETH; a little is kept for gas.`);

    setSending(true);
    try {
      const toExchange = destination === 'exchange';
      if (toExchange && !exchangeWallet) {
        setError('Choose the exchange wallet to withdraw to.');
        return;
      }
      const recipient = toExchange ? { address: exchangeWallet!.address, username: null } : await resolveRecipient(system.data!, recipientText);
      if (!recipient) {
        setError('Enter a wallet address (0x…) or the username of a ChainChat user.');
        return;
      }
      if (recipient.address.toLowerCase() === me.toLowerCase()) {
        setError('That is your own wallet.');
        return;
      }

      const txHash = await sendAsset(system.data!, info, recipient.address, amount);
      const text = `${format(amount)} ${selected.symbol}`;
      const to = toExchange ? `your exchange wallet “${exchangeWallet!.label}”` : recipient.username ? `@${recipient.username}` : shorten(recipient.address, 6, 4);
      setSent({ txHash, text, to: recipient.address, label: toExchange ? `Exchange wallet “${exchangeWallet!.label}”` : recipient.username ? `@${recipient.username}` : null, withdrawal: toExchange });
      notify({ kind: 'funds', title: toExchange ? `Withdrew ${text}` : `Sent ${text}`, body: `To ${to} — confirmed on the blockchain.`, route: '/activity' });
      queryClient.invalidateQueries({ queryKey: ['exchange-wallets'] });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['balances'] }), queryClient.invalidateQueries({ queryKey: ['activity'] })]);
    } catch (e) {
      console.warn('Sending failed', e);
      setError('The transfer failed. Check the amount and that you have ETH for gas, then try again.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.done, { backgroundColor: theme.colors.background }]}>
        <Icon source="check-decagram" size={64} color={theme.colors.primary} />
        <Text variant="headlineSmall" style={styles.bold}>
          {sent.withdrawal ? 'Withdrew' : 'Sent'} {sent.text}
        </Text>
        {sent.label && (
          <Text variant="titleMedium" style={styles.centered}>
            To {sent.label}
          </Text>
        )}
        <Text variant="bodySmall" selectable style={[styles.centered, styles.mono, { color: theme.colors.onSurfaceVariant }]}>
          {sent.to}
        </Text>
        <Text variant="bodySmall" selectable style={[styles.centered, styles.mono, { color: theme.colors.onSurfaceVariant }]}>
          {sent.txHash}
        </Text>
        <View style={styles.doneActions}>
          <Button mode="contained" icon="history" onPress={() => router.replace('/activity')}>
            See it in Activity
          </Button>
          <Button
            mode="outlined"
            onPress={() => {
              setSent(null);
              setAmountText('');
            }}>
            {sent.withdrawal ? 'Withdraw more' : 'Send another'}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: theme.colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <DismissKeyboard>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SectionCard title="Asset" icon="wallet-outline" subtitle="Balances are read from the blockchain">
            <View style={styles.chips}>
              {assets.map((asset) => (
                <Chip
                  key={asset.symbol}
                  selected={asset.symbol === selected.symbol}
                  mode={asset.symbol === selected.symbol ? 'flat' : 'outlined'}
                  disabled={sending}
                  onPress={() => {
                    setSymbol(asset.symbol);
                    setError(null);
                  }}>
                  {asset.symbol} · {format(asset.wei)}
                </Chip>
              ))}
            </View>
          </SectionCard>

          <SectionCard title="Amount" icon="cash-multiple">
            <TextInput
              mode="outlined"
              label={`Amount in ${selected.symbol}`}
              value={amountText}
              onChangeText={(value) => {
                setAmountText(value);
                setError(null);
              }}
              keyboardType="decimal-pad"
              disabled={sending}
              right={<TextInput.Affix text={selected.symbol} />}
            />
            <View style={styles.row}>
              <Text variant="bodySmall" style={[styles.flex, { color: theme.colors.onSurfaceVariant }]}>
                Available: {format(spendable)} {selected.symbol}
                {selected.token ? '' : ' (a little ETH is kept for gas)'}
              </Text>
              <Button compact disabled={sending || spendable === 0n} onPress={() => setAmountText(formatUnits(spendable, 18))}>
                Max
              </Button>
            </View>
          </SectionCard>

          <SectionCard title="To" icon="account-arrow-right-outline">
            <SegmentedButtons
              value={destination}
              onValueChange={(value) => {
                setDestination(value as 'exchange' | 'address');
                setError(null);
              }}
              buttons={[
                { value: 'exchange', label: 'My exchange wallet', icon: 'bank-outline', disabled: sending },
                { value: 'address', label: 'Address or user', icon: 'account-outline', disabled: sending },
              ]}
            />

            {destination === 'address' ? (
              <>
                <TextInput
                  mode="outlined"
                  label="Address or username"
                  placeholder="0x… or bob"
                  value={recipientText}
                  onChangeText={(value) => {
                    setRecipientText(value);
                    setError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  disabled={sending}
                />
                <Button compact icon="content-paste" disabled={sending} onPress={async () => setRecipientText((await Clipboard.getStringAsync()).trim())}>
                  Paste
                </Button>
              </>
            ) : !exchangeAccount ? (
              <>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Enter the account name you use on the exchange portal. Your wallets there appear here, and you only do this once.
                </Text>
                <TextInput
                  mode="outlined"
                  label="Exchange account name"
                  value={accountText}
                  onChangeText={(value) => {
                    setAccountText(value);
                    setError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={linkAccount}
                />
                <Button mode="contained-tonal" icon="link-variant" onPress={linkAccount} disabled={!accountText.trim()}>
                  Show my exchange wallets
                </Button>
              </>
            ) : (
              <>
                <View style={styles.row}>
                  <Text variant="bodySmall" style={[styles.flex, { color: theme.colors.onSurfaceVariant }]}>
                    Exchange account <Text style={styles.bold}>{exchangeAccount}</Text>
                  </Text>
                  <Button compact disabled={sending} onPress={unlinkAccount}>
                    Change
                  </Button>
                </View>
                {exchangeWallets.isPending ? (
                  <ActivityIndicator style={styles.loader} />
                ) : exchangeWallets.isError ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                    {exchangeWallets.error instanceof ApiError && exchangeWallets.error.status === 404
                      ? 'The exchange portal is not enabled on this server.'
                      : 'Could not load your exchange wallets.'}
                  </Text>
                ) : exchangeWallets.data.length === 0 ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    This exchange account has no wallets yet. Create one on the exchange portal first.
                  </Text>
                ) : (
                  exchangeWallets.data.map((wallet) => {
                    const chosen = exchangeWallet?.address === wallet.address;
                    return (
                      <TouchableRipple
                        key={wallet.address}
                        disabled={sending}
                        onPress={() => {
                          setExchangeWallet(wallet);
                          setError(null);
                        }}
                        borderless
                        style={[styles.wallet, { borderColor: chosen ? theme.colors.primary : theme.colors.outlineVariant, backgroundColor: chosen ? theme.colors.primaryContainer : 'transparent' }]}>
                        <View style={styles.row}>
                          <Icon source={chosen ? 'radiobox-marked' : 'radiobox-blank'} size={20} color={chosen ? theme.colors.primary : theme.colors.outline} />
                          <View style={styles.flex}>
                            <Text variant="titleSmall" numberOfLines={1}>
                              {wallet.label}
                            </Text>
                            <Text variant="labelSmall" style={[styles.mono, { color: theme.colors.onSurfaceVariant }]}>
                              {shorten(wallet.address, 8, 6)}
                            </Text>
                          </View>
                          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                            {format(BigInt(wallet.balances[selected.symbol] ?? '0'))} {selected.symbol}
                          </Text>
                        </View>
                      </TouchableRipple>
                    );
                  })
                )}
              </>
            )}
          </SectionCard>

          <HelperText type="error" visible={!!error || noGas} style={styles.centered}>
            {error ?? 'This wallet has no ETH to pay for gas.'}
          </HelperText>
          <Button mode="contained" icon="send" onPress={send} loading={sending} disabled={sending || noGas} contentStyle={styles.buttonContent}>
            {sending ? 'Sending and waiting for the block…' : destination === 'exchange' ? `Withdraw ${selected.symbol}` : `Send ${selected.symbol}`}
          </Button>
          <Text variant="labelSmall" style={[styles.centered, { color: theme.colors.outline }]}>
            Signed on this phone and sent straight to the blockchain. A transfer cannot be undone.
          </Text>
        </ScrollView>
      </DismissKeyboard>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  centered: { textAlign: 'center' },
  bold: { fontWeight: '700', textAlign: 'center' },
  mono: { fontFamily: 'Menlo', fontSize: 11 },
  buttonContent: { paddingVertical: 6 },
  loader: { marginVertical: 12 },
  wallet: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  doneActions: { alignSelf: 'stretch', gap: 10, marginTop: 18 },
});
