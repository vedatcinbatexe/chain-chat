import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Chip, HelperText, Modal, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { BaseError, ContractFunctionRevertedError, formatUnits, parseUnits } from 'viem';

import { useSystemInfo } from '@/api/system';
import { claimFaucet } from '@/chain/chatToken';
import { useBalances } from '@/chain/useBalances';
import { useWalletStore } from '@/wallet/walletStore';

const QUICK_AMOUNTS = ['1', '5', '10', '25'];

interface Props {
  visible: boolean;
  peerUsername: string;
  onDismiss: () => void;
  /** Sends the transfer on-chain and posts the payment message; resolves once the transfer is submitted. */
  onSend: (amount: bigint, note: string) => Promise<void>;
}

/** "Send CHAT" — an ERC-20 transfer sent from this wallet directly to the chain, then announced in the chat. */
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

  const balance = balances.data?.chat ? parseUnits(balances.data.chat, 18) : 0n;
  const amount = parseAmount(amountText);
  const amountError = amountText && amount === null ? 'Enter a positive amount' : amount !== null && amount > balance ? 'More than your CHAT balance' : null;

  const close = () => {
    setAmountText('');
    setNote('');
    setError(null);
    onDismiss();
  };

  const send = async () => {
    if (amount === null) return;
    setBusy('send');
    setError(null);
    try {
      await onSend(amount, note.trim());
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
        <Text variant="titleLarge" style={styles.title}>
          Send CHAT to @{peerUsername}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Your balance: {balances.data?.chat ? `${Number(balances.data.chat).toLocaleString(undefined, { maximumFractionDigits: 4 })} CHAT` : '…'}
        </Text>

        {balances.data && balance === 0n && (
          <Button mode="outlined" icon="water" onPress={faucet} loading={busy === 'faucet'} disabled={!!busy}>
            Get 100 test CHAT (faucet)
          </Button>
        )}

        <TextInput mode="outlined" label="Amount" value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" right={<TextInput.Affix text="CHAT" />} disabled={!!busy} />
        <View style={styles.chips}>
          {QUICK_AMOUNTS.map((quick) => (
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

        <Button mode="contained" icon="send" onPress={send} loading={busy === 'send'} disabled={!!busy || amount === null || !!amountError} contentStyle={styles.buttonContent}>
          {amount ? `Send ${formatUnits(amount, 18)} CHAT` : 'Send'}
        </Button>
        <Button onPress={close} disabled={!!busy}>
          Cancel
        </Button>
      </Modal>
    </Portal>
  );
}

function parseAmount(text: string): bigint | null {
  try {
    const value = parseUnits(text.trim().replace(',', '.'), 18);
    return value > 0n ? value : null;
  } catch {
    return null;
  }
}

function describe(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      if (revert.data?.errorName === 'ERC20InsufficientBalance') return 'Not enough CHAT.';
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
  sheet: { margin: 16, borderRadius: 20, padding: 20, gap: 10 },
  title: { fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 8 },
  buttonContent: { paddingVertical: 6 },
});
