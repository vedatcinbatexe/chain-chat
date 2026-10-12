import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Chip, HelperText, Modal, Portal, Text, TextInput, useTheme } from 'react-native-paper';

import { useSystemInfo, type AssetInfo } from '@/api/system';
import { GAS_RESERVE_WEI, parseAmountInput } from '@/chain/assets';
import { useBalances } from '@/chain/useBalances';
import { DismissKeyboard } from '@/components/DismissKeyboard';
import { useWalletStore } from '@/wallet/walletStore';
import { formatSwapAmount } from './swap';

const EXPIRIES = [
  { label: '15 min', ms: 15 * 60_000 },
  { label: '1 hour', ms: 60 * 60_000 },
  { label: '1 day', ms: 24 * 60 * 60_000 },
];

export interface SwapOffer {
  sell: { asset: AssetInfo; amount: bigint };
  buy: { asset: AssetInfo; amount: bigint };
  /** How long the offer can be accepted, in milliseconds from now. */
  validForMs: number;
}

interface Props {
  visible: boolean;
  onDismiss: () => void;
  /** Locks the offered asset in the swap contract and posts the offer; rejects if that fails. */
  onCreate: (offer: SwapOffer) => Promise<void>;
}

/**
 * "I give X, I want Y": creates a swap offer for the chat (SDD §6.9). What the user gives is locked in the swap
 * contract until someone accepts, the offer expires or they cancel it.
 */
export function SwapOfferSheet({ visible, onDismiss, onCreate }: Props) {
  const theme = useTheme();
  const system = useSystemInfo();
  const me = useWalletStore((state) => state.address);
  const balances = useBalances(me);

  const [sellSymbol, setSellSymbol] = useState<string | null>(null);
  const [buySymbol, setBuySymbol] = useState<string | null>(null);
  const [sellText, setSellText] = useState('');
  const [buyText, setBuyText] = useState('');
  const [validForMs, setValidForMs] = useState(EXPIRIES[1].ms);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assets = system.data?.assets ?? [];
  const held = balances.data?.assets ?? [];
  // Start with a token the wallet holds to give, and a different one to receive.
  const sell = assets.find((a) => a.symbol === sellSymbol) ?? assets.find((a) => a.address && (held.find((h) => h.symbol === a.symbol)?.wei ?? 0n) > 0n) ?? assets[0];
  const buy = assets.find((a) => a.symbol === buySymbol && a.symbol !== sell?.symbol) ?? assets.find((a) => a.address && a.symbol !== sell?.symbol) ?? assets.find((a) => a.symbol !== sell?.symbol);

  const sellBalance = held.find((h) => h.symbol === sell?.symbol);
  // ETH pays for gas: when offering ETH itself, a little stays behind.
  const available = !sellBalance ? 0n : sellBalance.token ? sellBalance.wei : sellBalance.wei > GAS_RESERVE_WEI ? sellBalance.wei - GAS_RESERVE_WEI : 0n;
  const sellAmount = parseAmountInput(sellText);
  const buyAmount = parseAmountInput(buyText);
  const sellError = sellText && sellAmount === null ? 'Enter a positive amount' : sellAmount !== null && sellAmount > available ? `More than your ${sell?.symbol} balance` : null;
  const buyError = buyText && buyAmount === null ? 'Enter a positive amount' : null;

  const close = () => {
    setSellText('');
    setBuyText('');
    setError(null);
    onDismiss();
  };

  const create = async () => {
    if (!sell || !buy || sellAmount === null || buyAmount === null) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({ sell: { asset: sell, amount: sellAmount }, buy: { asset: buy, amount: buyAmount }, validForMs });
      close();
    } catch (e) {
      console.warn('Creating the swap offer failed', e);
      setError('The offer could not be created. Check your balance and that you have ETH for gas.');
    } finally {
      setBusy(false);
    }
  };

  const picker = (selected: AssetInfo | undefined, exclude: string | undefined, onPick: (symbol: string) => void) => (
    <View style={styles.chips}>
      {assets
        .filter((asset) => asset.symbol !== exclude)
        .map((asset) => (
          <Chip key={asset.symbol} compact selected={asset.symbol === selected?.symbol} mode={asset.symbol === selected?.symbol ? 'flat' : 'outlined'} disabled={busy} onPress={() => onPick(asset.symbol)}>
            {asset.symbol}
          </Chip>
        ))}
    </View>
  );

  return (
    <Portal>
      <Modal visible={visible} onDismiss={busy ? undefined : close} contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
        <DismissKeyboard style={styles.body}>
          <Text variant="titleLarge" style={styles.title}>
            New swap offer
          </Text>

          <Text variant="titleSmall">I give</Text>
          {picker(sell, undefined, (symbol) => {
            setSellSymbol(symbol);
            setSellText('');
          })}
          <TextInput mode="outlined" dense label="Amount" value={sellText} onChangeText={setSellText} keyboardType="decimal-pad" disabled={busy} right={<TextInput.Affix text={sell?.symbol ?? ''} />} />
          <HelperText type={sellError ? 'error' : 'info'} visible>
            {sellError ?? (balances.data ? `Available: ${formatSwapAmount(available)} ${sell?.symbol ?? ''}` : 'Reading your balances…')}
          </HelperText>

          <Text variant="titleSmall">I want</Text>
          {picker(buy, sell?.symbol, setBuySymbol)}
          <TextInput mode="outlined" dense label="Amount" value={buyText} onChangeText={setBuyText} keyboardType="decimal-pad" disabled={busy} right={<TextInput.Affix text={buy?.symbol ?? ''} />} />
          <HelperText type="error" visible={!!buyError}>
            {buyError}
          </HelperText>

          <Text variant="titleSmall">Valid for</Text>
          <View style={styles.chips}>
            {EXPIRIES.map((option) => (
              <Chip key={option.label} compact selected={option.ms === validForMs} mode={option.ms === validForMs ? 'flat' : 'outlined'} disabled={busy} onPress={() => setValidForMs(option.ms)}>
                {option.label}
              </Chip>
            ))}
          </View>

          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            What you give is locked in the swap contract. Whoever accepts pays you and receives it in the same transaction — both happen, or neither. You can cancel
            while nobody has accepted.
          </Text>
          <HelperText type="error" visible={!!error}>
            {error}
          </HelperText>

          <Button mode="contained" icon="swap-horizontal" onPress={create} loading={busy} disabled={busy || sellAmount === null || buyAmount === null || !!sellError || !sell || !buy} contentStyle={styles.buttonContent}>
            {busy ? 'Locking on the blockchain…' : 'Post offer'}
          </Button>
          <Button onPress={close} disabled={busy}>
            Cancel
          </Button>
        </DismissKeyboard>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: { margin: 16, borderRadius: 20, padding: 20 },
  body: { flex: 0, gap: 6 },
  title: { fontWeight: '700', marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  buttonContent: { paddingVertical: 6 },
});
