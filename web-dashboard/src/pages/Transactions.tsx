import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import { useState } from 'react';

import { FundDialog } from '@/components/FundDialog';
import { Badge, Button, Card, DataTable, Mono, PageHeader, Pagination, UserCell, type Column } from '@/components/ui';
import { api, query } from '@/lib/api';
import { formatAmount, formatDate, formatNumber } from '@/lib/format';
import type { AnchorRow, DripRow, FundingRow, Paged, PaymentRow } from '@/lib/types';

const STATUS_TONE = { Confirmed: 'green', Pending: 'amber', Submitted: 'amber', Failed: 'red' } as const;

const PAYMENTS: Column<PaymentRow>[] = [
  { header: 'From', cell: (p) => <UserCell address={p.from} username={p.fromUsername} /> },
  { header: 'To', cell: (p) => <UserCell address={p.to} username={p.toUsername} /> },
  { header: 'Amount', align: 'right', cell: (p) => (p.amount ? `${formatAmount(p.amount, 2)} CHAT` : '—') },
  {
    header: 'Status',
    cell: (p) => (
      <span title={p.failureReason ?? undefined}>
        <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
      </span>
    ),
  },
  { header: 'Block', align: 'right', cell: (p) => (p.blockNumber ? formatNumber(p.blockNumber) : '—') },
  { header: 'Transaction', cell: (p) => <Mono value={p.txHash} head={10} tail={6} /> },
  { header: 'Time', cell: (p) => <span className="whitespace-nowrap">{formatDate(p.createdAt)}</span> },
];

const FUNDINGS: Column<FundingRow>[] = [
  { header: 'Account', cell: (f) => <UserCell address={f.address} username={f.username} /> },
  { header: 'Amount', align: 'right', cell: (f) => `${formatAmount(f.amount)} ${f.asset}` },
  { header: 'Kind', cell: (f) => <Badge tone="indigo">{f.asset === 'CHAT' ? 'Mint' : 'Transfer'}</Badge> },
  { header: 'By admin', cell: (f) => <Mono value={f.admin} /> },
  { header: 'Transaction', cell: (f) => <Mono value={f.txHash} head={10} tail={6} /> },
  { header: 'Time', cell: (f) => <span className="whitespace-nowrap">{formatDate(f.createdAt)}</span> },
];

const DRIPS: Column<DripRow>[] = [
  { header: 'Account', cell: (d) => <UserCell address={d.address} username={d.username} /> },
  { header: 'Amount', align: 'right', cell: (d) => `${formatAmount(d.amount)} ETH` },
  { header: 'Transaction', cell: (d) => <Mono value={d.txHash} head={10} tail={6} /> },
  { header: 'Time', cell: (d) => <span className="whitespace-nowrap">{formatDate(d.createdAt)}</span> },
];

const ANCHORS: Column<AnchorRow>[] = [
  { header: 'Batch', cell: (a) => <span className="tabular-nums">{a.chainBatchId ?? `local #${a.id}`}</span> },
  { header: 'Messages', cell: (a) => `#${a.fromMessageId}–#${a.toMessageId} (${a.leafCount})` },
  { header: 'Merkle root', cell: (a) => <Mono value={a.root} head={10} tail={6} /> },
  { header: 'Status', cell: (a) => <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge> },
  { header: 'Block', align: 'right', cell: (a) => (a.blockNumber ? formatNumber(a.blockNumber) : '—') },
  { header: 'Transaction', cell: (a) => <Mono value={a.txHash} head={10} tail={6} /> },
  { header: 'Anchored', cell: (a) => <span className="whitespace-nowrap">{formatDate(a.anchoredAt ?? a.createdAt)}</span> },
];

const TABS = [
  { key: 'payments', label: 'Payments', hint: 'CHAT sent between users inside chats, confirmed from on-chain receipts.' },
  { key: 'fundings', label: 'Admin funding', hint: 'Balance added by admins from this dashboard.' },
  { key: 'drips', label: 'Gas drips', hint: 'One-time test ETH sent to new wallets so they can register.' },
  { key: 'anchors', label: 'Anchor batches', hint: 'Merkle roots of message batches written to the Anchor contract.' },
] as const;
type Tab = (typeof TABS)[number]['key'];

function TransactionTable<T>({ tab, columns, rowKey }: { tab: Tab; columns: Column<T>[]; rowKey: (row: T) => string | number }) {
  const [page, setPage] = useState(1);
  const rows = useQuery({
    queryKey: ['transactions', tab, page],
    queryFn: () => api<Paged<T>>(`/transactions/${tab}${query({ page })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 5_000,
  });
  return (
    <>
      <DataTable columns={columns} rows={rows.data?.items} rowKey={rowKey} loading={rows.isPending} error={rows.error} empty="No transactions yet." />
      {rows.data && <Pagination page={rows.data.page} pageSize={rows.data.pageSize} total={rows.data.total} onPage={setPage} />}
    </>
  );
}

export function TransactionsPage() {
  const [tab, setTab] = useState<Tab>('payments');
  const [funding, setFunding] = useState(false);

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Everything the backend sent to, or verified on, the blockchain."
        actions={
          <Button variant="primary" onClick={() => setFunding(true)}>
            <Coins className="size-4" /> Add balance
          </Button>
        }
      />
      <Card>
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="border-b border-slate-100 px-5 py-2.5 text-xs text-slate-500">{TABS.find((t) => t.key === tab)!.hint}</p>
        {tab === 'payments' && <TransactionTable tab="payments" columns={PAYMENTS} rowKey={(p) => p.txHash} />}
        {tab === 'fundings' && <TransactionTable tab="fundings" columns={FUNDINGS} rowKey={(f) => f.id} />}
        {tab === 'drips' && <TransactionTable tab="drips" columns={DRIPS} rowKey={(d) => d.address} />}
        {tab === 'anchors' && <TransactionTable tab="anchors" columns={ANCHORS} rowKey={(a) => a.id} />}
      </Card>
      <FundDialog open={funding} onClose={() => setFunding(false)} />
    </>
  );
}
