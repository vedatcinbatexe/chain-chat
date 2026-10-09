import { useQuery } from '@tanstack/react-query';
import type { Address, Hex } from 'viem';

import { useSystemInfo } from '@/api/system';
import { chatTokenAddress, chatTokenTransfers, readReceipt } from '@/chain/chatToken';
import { getPublicClient } from '@/chain/publicClient';
import { evaluatePayment, type PaymentCheck } from './payment';

/** Same values as the backend's PaymentOptions (Development uses 1 confirmation on Anvil). */
const CONFIRMATIONS = 1n;
const GIVE_UP_AFTER_MS = 5 * 60 * 1000;

/**
 * Checks a payment claim against the chain from this phone (SDD §6.4): the server's status only triggers a
 * re-check, it is never trusted on its own. Polls every 2 s until the payment is confirmed or failed.
 */
export function usePaymentCheck(txHash: Hex | undefined, from: Address, to: Address, claimedAt: number) {
  const system = useSystemInfo();

  return useQuery({
    queryKey: ['payment-check', txHash?.toLowerCase()],
    enabled: !!txHash && !!system.data,
    queryFn: async (): Promise<PaymentCheck> => {
      const client = getPublicClient(system.data!);
      const [receipt, head] = await Promise.all([readReceipt(system.data!, txHash!), client.getBlockNumber()]);
      const summary = receipt && {
        succeeded: receipt.status === 'success',
        blockNumber: receipt.blockNumber,
        transfers: chatTokenTransfers(receipt, chatTokenAddress(system.data!)),
      };
      return evaluatePayment(from, to, summary, head, CONFIRMATIONS, Date.now() - claimedAt > GIVE_UP_AFTER_MS);
    },
    refetchInterval: (query) => (query.state.data && query.state.data.status !== 'pending' ? false : 2_000),
  });
}
