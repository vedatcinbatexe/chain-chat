import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Chip, HelperText, Modal, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { BaseError, ContractFunctionRevertedError, formatUnits } from 'viem';

import { useSystemInfo } from '@/api/system';
import { DismissKeyboard } from '@/components/DismissKeyboard';
import { GAS_RESERVE_WEI, parseAmountInput, type Asset } from '@/chain/assets';
import { claimFaucet } from '@/chain/chatToken';
import { useBalances } from '@/chain/useBalances';
import { useWalletStore } from '@/wallet/walletStore';

const QUICK_AMOUNTS: Record<string, string[]> = { ETH: ['0.01', '0.05', '0.1'], tBTC: ['0.01', '0.1', '1'] };
const quickAmounts = (symbol: string) => QUICK_AMOUNTS[symbol] ?? ['1', '5', '10', '25'];
const format = (wei: bigint) => Number(formatUnits(wei, 18)).toLocaleString(undefined, { maximumFractionDigits: 6 });

interface Props {
  visible: boolean;
  peerUsername: string;
  onDismiss: () => void;
  /** Sends the transfer on-chain and posts the payment message; resolves once the transfer is submitted. */
  onSend: (asset: Asset, amount: bigint, note: string) => Promise<void>;
}

/**
 * Pay inside a chat with any asset the wallet holds (ETH, CHAT, tUSD, …): a transfer sent from this wallet directly
 * to the chain, then announced in the chat. Both phones confirm it from the on-chain receipt.
 */
export function SendPaymentSheet({ visible, peerUsername, onDismiss, onSend }: Props) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const system = useSystemInfo();
  const me = useWalletStore((state) => state.address);
  const balances = useBalances(me);

  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'send' | 'faucet' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState<string | null>(null);

  const assets = balances.data?.assets ?? [];
  // Start on the first token the wallet holds (CHAT comes first), otherwise the first asset.
  const selected = assets.find((a) => a.symbol === symbol) ?? assets.find((a) => a.token && a.wei > 0n) ?? assets.find((a) => a.token) ?? assets[0];
  const asset = system.data?.assets?.find((a) => a.symbol === selected?.symbol);
  const unit = selected?.symbol ?? 'CHAT';
  // ETH pays for gas: when paying in ETH itself, a little stays behind.
  const balance = !selected ? 0n : selected.token ? selected.wei : selected.wei > GAS_RESERVE_WEI ? selected.wei - GAS_RESERVE_WEI : 0n;
  const amount = parseAmountInput(amountText);
  const amountError = amountText && amount === null ? 'Enter a positive amount' : amount !== null && amount > balance ? `More than your ${unit} balance` : null;

  const close = () => {
    setAmountText('');
    setNote('');
    setSymbol(null);
    setError(null);
    onDismiss();
  };

  const send = async () => {
    if (amount === null || !asset) return;
    setBusy('send');
    setError(null);
    try {
      await onSend(asset, amount, note.trim());
      close();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(null);
    }
  };

  const faucet = async () => {
    setBusy('faucet');
    setError(null);
    try {
      await claimFaucet(system.data!);
      await queryClient.invalidateQueries({ queryKey: ['balances'] });
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={busy ? undefined : close} contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
        <DismissKeyboard style={styles.body}>
        <Text variant="titleLarge" style={styles.title}>
          Pay @{peerUsername}
        </Text>
        <View style={styles.chips}>
          {assets.map((option) => (
            <Chip
              key={option.symbol}
              compact
              selected={option.symbol === unit}
              mode={option.symbol === unit ? 'flat' : 'outlined'}
              disabled={!!busy}
              onPress={() => {
                setSymbol(option.symbol);
                setAmountText('');
                setError(null);
              }}>
              {option.symbol}
            </Chip>
          ))}
        </View>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {balances.data ? `Available: ${format(balance)} ${unit}${selected?.token === false ? ' (a little ETH is kept for gas)' : ''}` : 'Reading your balances…'}
        </Text>

        {balances.data && unit === 'CHAT' && balance === 0n && (
          <Button mode="outlined" icon="water" onPress={faucet} loading={busy === 'faucet'} disabled={!!busy}>
            Get 100 test CHAT (faucet)
          </Button>
        )}

        <TextInput mode="outlined" label="Amount" value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" right={<TextInput.Affix text={unit} />} disabled={!!busy} />
        <View style={styles.chips}>
          {quickAmounts(unit).map((quick) => (
            <Chip key={quick} compact onPress={() => setAmountText(quick)} disabled={!!busy}>
              {quick}
            </Chip>
          ))}
        </View>
        <HelperText type="error" visible={!!amountError}>
          {amountError}
        </HelperText>

        <TextInput mode="outlined" label="Note (optional, encrypted)" value={note} onChangeText={setNote} maxLength={140} disabled={!!busy} />

        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          The transfer goes from your wallet straight to the blockchain; gas is paid in ETH. Both phones confirm it from the on-chain receipt.
        </Text>
        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>

        <Button mode="contained" icon="send" onPress={send} loading={busy === 'send'} disabled={!!busy || amount === null || !!amountError || !asset} contentStyle={styles.buttonContent}>
          {amount ? `Send ${formatUnits(amount, 18)} ${unit}` : 'Send'}
        </Button>
        <Button onPress={close} disabled={!!busy}>
          Cancel
        </Button>
        </DismissKeyboard>
      </Modal>
    </Portal>
  );
}

function describe(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      if (revert.data?.errorName === 'ERC20InsufficientBalance') return 'Not enough balance.';
      if (revert.data?.errorName === 'FaucetCooldown') {
        const at = new Date(Number(revert.data.args?.[0] as bigint) * 1000);
        return `The faucet gives 100 CHAT per day — available again at ${at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`;
      }
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

const styles = StyleSheet.create({
  sheet: { margin: 16, borderRadius: 20, padding: 20 },
  body: { flex: 0, gap: 10 },
  title: { fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  buttonContent: { paddingVertical: 6 },
});
