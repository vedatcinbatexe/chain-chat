import { useQuery } from '@tanstack/react-query';
import { erc20Abi, parseEventLogs, type Address, type Hex } from 'viem';

import { useSystemInfo } from '@/api/system';
import { readReceipt } from '@/chain/chatToken';
import { getPublicClient } from '@/chain/publicClient';
import { evaluatePayment, type PaymentCheck, type ReceiptSummary } from './payment';

/** Same values as the backend's PaymentOptions (Development uses 1 confirmation on Anvil). */
const CONFIRMATIONS = 1n;
const GIVE_UP_AFTER_MS = 5 * 60 * 1000;

/**
 * Checks a payment claim against the chain from this phone (SDD §6.4): the server's status only triggers a
 * re-check, it is never trusted on its own. What was paid is read from the transaction itself — Transfer events
 * of the supported tokens, and the ETH the transaction carried. Polls every 2 s until confirmed or failed.
 */
export function usePaymentCheck(txHash: Hex | undefined, from: Address, to: Address, claimedAt: number) {
  const system = useSystemInfo();

  return useQuery({
    queryKey: ['payment-check', txHash?.toLowerCase()],
    enabled: !!txHash && !!system.data,
    queryFn: async (): Promise<PaymentCheck> => {
      const client = getPublicClient(system.data!);
      const [receipt, head] = await Promise.all([readReceipt(system.data!, txHash!), client.getBlockNumber()]);

      let summary: ReceiptSummary | null = null;
      if (receipt) {
        // Token contract → symbol. An older backend without an asset list still knows CHAT.
        const { ChatToken } = system.data!.contracts;
        const tokens = new Map(
          (system.data!.assets ?? (ChatToken ? [{ symbol: 'CHAT', address: ChatToken }] : [])).flatMap((asset) => (asset.address ? [[asset.address.toLowerCase(), asset.symbol] as const] : [])),
        );
        const transfers: ReceiptSummary['transfers'] = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs })
          .filter((log) => tokens.has(log.address.toLowerCase())) // an event from an unknown contract proves nothing
          .map((log) => ({ from: log.args.from, to: log.args.to, value: log.args.value, asset: tokens.get(log.address.toLowerCase())! }));

        // ETH has no event: it is the value the transaction itself carried.
        const tx = await client.getTransaction({ hash: txHash! }).catch(() => null);
        if (tx?.to && tx.value > 0n) transfers.push({ from: tx.from, to: tx.to, value: tx.value, asset: 'ETH' });

        summary = { succeeded: receipt.status === 'success', blockNumber: receipt.blockNumber, transfers };
      }

      return evaluatePayment(from, to, summary, head, CONFIRMATIONS, Date.now() - claimedAt > GIVE_UP_AFTER_MS);
    },
    refetchInterval: (query) => (query.state.data && query.state.data.status !== 'pending' ? false : 2_000),
  });
}
