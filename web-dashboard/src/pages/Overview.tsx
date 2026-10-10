import { useQuery } from '@tanstack/react-query';
import { Anchor, Blocks, Coins, MessagesSquare, Radio, Users, UsersRound } from 'lucide-react';

import { Card, Notice, PageHeader, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { formatAmount, formatNumber } from '@/lib/format';
import type { Overview } from '@/lib/types';

export function OverviewPage() {
  const overview = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/overview'), refetchInterval: 5_000 });
  const data = overview.data;
  const max = Math.max(1, ...(data?.messagesPerDay.map((d) => d.count) ?? [1]));

  return (
    <>
      <PageHeader title="Overview" description="Live numbers from the ChainChat backend and the chain it is connected to." />
      {overview.isError && <Notice tone="red">{overview.error.message}</Notice>}
      {data && data.blockNumber === null && <Notice tone="amber">The blockchain node is not reachable right now.</Notice>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Users" value={data ? formatNumber(data.users) : '—'} hint={data ? `${data.bannedUsers} banned` : undefined} icon={<Users className="size-4" />} />
        <Stat label="Online now" value={data ? formatNumber(data.onlineNow) : '—'} hint="Wallets with an open connection" icon={<Radio className="size-4" />} />
        <Stat label="Groups" value={data ? formatNumber(data.groups) : '—'} hint={data ? `${formatNumber(data.directConversations)} direct chats` : undefined} icon={<UsersRound className="size-4" />} />
        <Stat label="Messages" value={data ? formatNumber(data.messages) : '—'} hint={data ? `${formatNumber(data.messagesLast24h)} in the last 24 h` : undefined} icon={<MessagesSquare className="size-4" />} />
        <Stat label="Payments" value={data ? formatNumber(data.payments) : '—'} hint={data ? `In chats, all assets · ${formatAmount(data.paymentVolume, 2)} CHAT of it` : undefined} icon={<Coins className="size-4" />} />
        <Stat label="Anchor batches" value={data ? formatNumber(data.anchorBatches) : '—'} hint="Merkle roots confirmed on-chain" icon={<Anchor className="size-4" />} />
        <Stat label="Waiting for anchor" value={data ? formatNumber(data.unanchoredMessages) : '—'} hint="Messages not in a batch yet" icon={<Anchor className="size-4" />} />
        <Stat label="Block height" value={data?.blockNumber != null ? formatNumber(data.blockNumber) : '—'} hint="Latest block seen" icon={<Blocks className="size-4" />} />
      </div>

      <Card title="Messages per day (last 14 days, UTC)" className="mt-6">
        <div className="flex h-48 items-end gap-2 px-5 pt-6 pb-4">
          {data?.messagesPerDay.map((day) => (
            <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${day.date}: ${day.count} messages`}>
              <span className="text-xs text-slate-500 tabular-nums">{day.count || ''}</span>
              <div className="w-full rounded-t bg-indigo-500" style={{ height: `${(day.count / max) * 100}%`, minHeight: day.count ? 4 : 1, opacity: day.count ? 1 : 0.25 }} />
              <span className="text-[10px] text-slate-400">{day.date.slice(8)}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
