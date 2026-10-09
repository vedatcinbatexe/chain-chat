import { useQuery } from '@tanstack/react-query';
import { erc20Abi, formatEther, formatUnits, type Address } from 'viem';

import { useSystemInfo } from '@/api/system';
import { getPublicClient } from './publicClient';

export interface Balances {
  /** Native ETH, used for gas. */
  eth: string;
  /** ChatToken (CHAT); null when the token is not deployed on this network yet. */
  chat: string | null;
}

/** ETH and CHAT balances of `address`, read directly from the chain. */
export function useBalances(address: Address | null) {
  const { data: system } = useSystemInfo();

  return useQuery({
    queryKey: ['balances', system?.chainId, address],
    enabled: !!system && !!address,
    queryFn: async (): Promise<Balances> => {
      const client = getPublicClient(system!);
      const token = system!.contracts.ChatToken;

      const [eth, chat] = await Promise.all([
        client.getBalance({ address: address! }),
        token ? client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address!] }) : null,
      ]);

      return { eth: formatEther(eth), chat: chat === null ? null : formatUnits(chat, 18) };
    },
  });
}
