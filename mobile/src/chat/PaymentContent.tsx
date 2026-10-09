import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Text } from 'react-native-paper';
import { formatUnits, type Address } from 'viem';

import type { MessageDto } from '@/api/conversations';
import type { PaymentPayload } from './payment';
import { usePaymentCheck } from './usePaymentCheck';

const FAILURES = {
  TransactionNotFound: 'Transaction not found on-chain',
  TransactionReverted: 'Transaction reverted — no CHAT was sent',
  NoMatchingTransfer: 'No CHAT transfer to the recipient in this transaction — fake payment claim',
} as const;

const format = (wei: bigint) => Number(formatUnits(wei, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 });

/**
 * A payment inside a chat bubble. The amount and status come from the transaction receipt read on this phone;
 * the amount in the (signed) message is only a claim and is flagged if the chain disagrees.
 */
export function PaymentContent({ payload, dto, recipient, color }: { payload: PaymentPayload; dto: MessageDto; recipient: Address; color: string }) {
  const check = usePaymentCheck(payload.txHash, dto.sender, recipient, Number(dto.clientTimestamp));
  const claimed = BigInt(payload.amount);
  const result = check.data;
  const shownAmount = result?.status === 'confirmed' ? result.amount : claimed;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Icon source="cash-fast" size={22} color={color} />
        <Text variant="headlineSmall" style={[styles.amount, { color }]}>
          {format(shownAmount)} CHAT
        </Text>
      </View>
      {payload.note && <Text style={{ color, fontStyle: 'italic' }}>“{payload.note}”</Text>}

      <View style={styles.row}>
        {!result || result.status === 'pending' ? (
          <>
            <ActivityIndicator size={12} color={color} />
            <Text variant="labelSmall" style={{ color }}>
              Waiting for on-chain confirmation…
            </Text>
          </>
        ) : result.status === 'confirmed' ? (
          <>
            <Icon source="check-decagram" size={14} color={color} />
            <Text variant="labelSmall" style={{ color }}>
              Confirmed on-chain · block {result.blockNumber.toString()}
            </Text>
          </>
        ) : (
          <>
            <Icon source="close-octagon" size={14} color={color} />
            <Text variant="labelSmall" style={[styles.shrink, { color }]}>
              {FAILURES[result.reason]}
            </Text>
          </>
        )}
      </View>

      {result?.status === 'confirmed' && result.amount !== claimed && (
        <Text variant="labelSmall" style={{ color }}>
          ⚠ Claimed {format(claimed)} CHAT, but the on-chain transfer is {format(result.amount)} CHAT
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4, minWidth: 180 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  amount: { fontWeight: '700' },
  shrink: { flexShrink: 1 },
});
