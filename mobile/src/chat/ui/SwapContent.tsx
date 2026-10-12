import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Icon, Text } from 'react-native-paper';
import type { Address } from 'viem';

import { useSystemInfo } from '@/api/system';
import { cancelSwapOrder, fillSwapOrder, useSwapOrder, type SwapOrder } from '@/chain/swapDesk';
import { useBalances } from '@/chain/useBalances';
import { notify } from '@/notifications/store';
import { formatSwapAmount, type SwapPayload } from '../swap';

const symbolOf = (side: SwapOrder['sell']) => side.asset?.symbol ?? 'unknown token';
const amountOf = (side: SwapOrder['sell']) => `${formatSwapAmount(side.amount)} ${symbolOf(side)}`;

const timeLeft = (expiresAt: number, now: number) => {
  const minutes = Math.max(0, Math.round((expiresAt - now) / 60_000));
  return minutes >= 120 ? `${Math.round(minutes / 60)} h left` : minutes >= 1 ? `${minutes} min left` : 'less than a minute left';
};

interface Props {
  swap: SwapPayload;
  /** The message's sender; an offer only counts if it announces their own order. */
  sender: Address;
  me: Address;
  color: string;
  /** Display name for an address, e.g. "@bob". */
  nameOf: (address: string) => string;
}

/**
 * A swap offer inside a chat bubble (SDD §6.9). The terms and the state are read from the SwapDesk contract, not
 * from the message: the message only says which order to look at. Other members can accept it; the maker can
 * cancel it while it is open.
 */
export function SwapContent({ swap, sender, me, color, nameOf }: Props) {
  const queryClient = useQueryClient();
  const system = useSystemInfo();
  const order = useSwapOrder(swap.orderId);
  const balances = useBalances(me);
  const [busy, setBusy] = useState<'accept' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const data = order.data;
  if (!data) {
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          {order.isError ? <Icon source="alert-circle-outline" size={18} color={color} /> : <ActivityIndicator size={16} color={color} />}
          <Text variant="labelMedium" style={[styles.shrink, { color }]}>
            {order.isError ? `Swap order #${swap.orderId} does not exist in the swap contract.` : 'Reading the swap offer from the blockchain…'}
          </Text>
        </View>
      </View>
    );
  }

  const mine = data.maker.toLowerCase() === me.toLowerCase();
  // A message can only announce its sender's own order; anything else is someone pointing at another person's offer.
  const genuine = data.maker.toLowerCase() === sender.toLowerCase();
  const need = balances.data?.assets.find((a) => a.symbol === data.buy.asset?.symbol);
  const canAfford = !!need && need.wei >= data.buy.amount;
  const unknownToken = !data.sell.asset || !data.buy.asset;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['swap-order'] }),
      queryClient.invalidateQueries({ queryKey: ['balances'] }),
      queryClient.invalidateQueries({ queryKey: ['activity'] }),
    ]);

  const accept = async () => {
    setBusy('accept');
    setError(null);
    try {
      await fillSwapOrder(system.data!, data);
      notify({ kind: 'funds', title: 'Swap completed', body: `You gave ${amountOf(data.buy)} and received ${amountOf(data.sell)}.`, route: '/activity' });
      await refresh();
    } catch (e) {
      console.warn('Accepting the swap failed', e);
      setError('The swap did not go through — someone may have been faster, or your balance changed.');
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy('cancel');
    setError(null);
    try {
      await cancelSwapOrder(system.data!, data.id);
      await refresh();
    } catch (e) {
      console.warn('Cancelling the swap failed', e);
      setError('The offer could not be cancelled.');
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const status =
    data.status === 'filled'
      ? { icon: 'check-decagram', text: `Completed on-chain · accepted by ${data.taker ? nameOf(data.taker) : 'someone'}` }
      : data.status === 'cancelled'
        ? { icon: 'close-circle-outline', text: 'Cancelled by the maker' }
        : data.status === 'expired'
          ? { icon: 'clock-alert-outline', text: mine ? 'Expired — cancel to get your funds back' : 'Expired' }
          : { icon: 'lock-outline', text: `Open · locked in the contract · ${timeLeft(data.expiresAt, order.dataUpdatedAt)}` };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Icon source="swap-horizontal-bold" size={20} color={color} />
        <Text variant="labelLarge" style={{ color }}>
          Swap offer #{data.id.toString()}
        </Text>
      </View>

      <View style={styles.terms}>
        <View style={styles.side}>
          <Text variant="labelSmall" style={[styles.dim, { color }]}>
            {mine ? 'You give' : `${nameOf(data.maker)} gives`}
          </Text>
          <Text variant="titleMedium" style={[styles.amount, { color }]}>
            {amountOf(data.sell)}
          </Text>
        </View>
        <Icon source="arrow-right" size={18} color={color} />
        <View style={styles.side}>
          <Text variant="labelSmall" style={[styles.dim, { color }]}>
            {mine ? 'You get' : 'for'}
          </Text>
          <Text variant="titleMedium" style={[styles.amount, { color }]}>
            {amountOf(data.buy)}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        <Icon source={status.icon} size={14} color={color} />
        <Text variant="labelSmall" style={[styles.shrink, { color }]}>
          {status.text}
        </Text>
      </View>

      {!genuine && (
        <Text variant="labelSmall" style={{ color }}>
          ⚠ This order belongs to {nameOf(data.maker)}, not to the person who posted this message.
        </Text>
      )}

      {data.status === 'open' && !mine && (
        <>
          <Button mode="contained-tonal" icon="swap-horizontal" compact onPress={accept} loading={busy === 'accept'} disabled={!!busy || !canAfford || unknownToken}>
            {busy === 'accept' ? 'Swapping on the blockchain…' : `Accept: give ${amountOf(data.buy)}`}
          </Button>
          {!canAfford && !unknownToken && balances.data && (
            <Text variant="labelSmall" style={{ color }}>
              You do not have {amountOf(data.buy)}.
            </Text>
          )}
        </>
      )}
      {(data.status === 'open' || data.status === 'expired') && mine && (
        <Button mode="contained-tonal" icon="close" compact onPress={cancel} loading={busy === 'cancel'} disabled={!!busy}>
          {busy === 'cancel' ? 'Cancelling…' : 'Cancel offer and unlock'}
        </Button>
      )}
      {error && (
        <Text variant="labelSmall" style={{ color }}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6, minWidth: 230 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  terms: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  side: { flexShrink: 1, gap: 1 },
  amount: { fontWeight: '700' },
  dim: { opacity: 0.8 },
  shrink: { flexShrink: 1 },
});
