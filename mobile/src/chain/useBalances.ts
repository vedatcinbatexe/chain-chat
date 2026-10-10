import { useQuery } from '@tanstack/react-query';
import { erc721Abi, formatEther, formatUnits, type Address } from 'viem';

import { useSystemInfo } from '@/api/system';
import { readAssetBalances } from './assets';
import { getPublicClient } from './publicClient';

export interface AssetBalance {
  symbol: string;
  name: string;
  /** In wei. */
  wei: bigint;
  /** In whole units, as a decimal string. */
  amount: string;
  /** False for native ETH. */
  token: boolean;
}

export interface Balances {
  /** Native ETH, used for gas. */
  eth: string;
  /** ChatToken (CHAT, ERC-20); null when the token is not deployed on this network. */
  chat: string | null;
  /** ClassBadge NFTs (CCB, ERC-721) owned; null when the badge is not deployed on this network. */
  badges: number | null;
  /** Every asset the wallet can hold (ETH, CHAT, tUSD, tBTC, …), in the backend's order. */
  assets: AssetBalance[];
}

/** Everything `address` holds on ChainChat's network — ETH, the ERC-20 tokens and badges — read directly from the chain. */
export function useBalances(address: Address | null | undefined) {
  const { data: system } = useSystemInfo();

  return useQuery({
    queryKey: ['balances', system?.chainId, address?.toLowerCase()],
    enabled: !!system && !!address,
    queryFn: async (): Promise<Balances> => {
      const client = getPublicClient(system!);
      const { ClassBadge } = system!.contracts;

      const [wei, badges] = await Promise.all([
        readAssetBalances(system!, address!),
        ClassBadge ? client.readContract({ address: ClassBadge, abi: erc721Abi, functionName: 'balanceOf', args: [address!] }) : null,
      ]);
      // An older backend without an asset list: fall back to ETH only.
      const eth = wei.ETH ?? (await client.getBalance({ address: address! }));

      return {
        eth: formatEther(eth),
        chat: wei.CHAT === undefined ? null : formatUnits(wei.CHAT, 18),
        badges: badges === null ? null : Number(badges),
        assets: (system!.assets ?? []).map((asset) => ({
          symbol: asset.symbol,
          name: asset.name,
          wei: wei[asset.symbol],
          amount: formatUnits(wei[asset.symbol], asset.decimals),
          token: asset.address !== null,
        })),
      };
    },
  });
}
