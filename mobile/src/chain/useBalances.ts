import { useQuery } from '@tanstack/react-query';
import { erc20Abi, erc721Abi, formatEther, formatUnits, type Address } from 'viem';

import { useSystemInfo } from '@/api/system';
import { getPublicClient } from './publicClient';

export interface Balances {
  /** Native ETH, used for gas. */
  eth: string;
  /** ChatToken (CHAT, ERC-20); null when the token is not deployed on this network. */
  chat: string | null;
  /** ClassBadge NFTs (CCB, ERC-721) owned; null when the badge is not deployed on this network. */
  badges: number | null;
}

/** Everything `address` holds on ChainChat's network — ETH, CHAT and ClassBadge NFTs — read directly from the chain. */
export function useBalances(address: Address | null | undefined) {
  const { data: system } = useSystemInfo();

  return useQuery({
    queryKey: ['balances', system?.chainId, address?.toLowerCase()],
    enabled: !!system && !!address,
    queryFn: async (): Promise<Balances> => {
      const client = getPublicClient(system!);
      const { ChatToken, ClassBadge } = system!.contracts;

      const [eth, chat, badges] = await Promise.all([
        client.getBalance({ address: address! }),
        ChatToken ? client.readContract({ address: ChatToken, abi: erc20Abi, functionName: 'balanceOf', args: [address!] }) : null,
        ClassBadge ? client.readContract({ address: ClassBadge, abi: erc721Abi, functionName: 'balanceOf', args: [address!] }) : null,
      ]);

      return {
        eth: formatEther(eth),
        chat: chat === null ? null : formatUnits(chat, 18),
        badges: badges === null ? null : Number(badges),
      };
    },
  });
}
