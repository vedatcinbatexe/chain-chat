import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Badge, Button, Card, DataTable, Input, Mono, Notice, PageHeader, Pagination, UserCell, type Column } from '@/components/ui';
import { api, query } from '@/lib/api';
import { formatBytes, formatDate, shorten } from '@/lib/format';
import type { MessageRow, Paged } from '@/lib/types';

const ANCHOR_TONE = { Anchored: 'green', Pending: 'amber', NotAnchored: 'gray' } as const;
const ANCHOR_LABEL = { Anchored: 'Anchored', Pending: 'Anchoring…', NotAnchored: 'Not anchored' } as const;

export function MessagesPage() {
  const [params, setParams] = useSearchParams();
  const conversationId = params.get('conversationId') ?? '';
  const sender = params.get('sender') ?? '';
  const [page, setPage] = useState(1);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };

  const senderValid = sender === '' || /^0x[0-9a-fA-F]{40}$/.test(sender.trim());
  const messages = useQuery({
    queryKey: ['messages', conversationId, sender, page],
    queryFn: () => api<Paged<MessageRow>>(`/messages${query({ conversationId: conversationId.trim(), sender: sender.trim(), page })}`),
    enabled: senderValid,
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });

  const columns: Column<MessageRow>[] = [
    { header: '#', cell: (m) => <span className="tabular-nums text-slate-500">{m.id}</span> },
    {
      header: 'Conversation',
      cell: (m) => (
        <div className="min-w-0">
          {m.groupName ? (
            <Link to={`/groups/${m.conversationId}`} className="block truncate font-medium text-slate-900 hover:text-indigo-600">
              {m.groupName}
            </Link>
          ) : (
            <span className="block font-medium text-slate-900">Direct chat</span>
          )}
          <button type="button" onClick={() => setFilter('conversationId', m.conversationId)} className="font-mono text-xs whitespace-nowrap text-slate-500 hover:text-indigo-600" title="Show only this conversation">
            {shorten(m.conversationId, 10, 6)}
          </button>
        </div>
      ),
    },
    { header: 'Sender', cell: (m) => <UserCell address={m.sender} username={m.senderUsername} /> },
    { header: 'Seq', align: 'right', cell: (m) => m.seq },
    { header: 'Type', cell: (m) => <Badge tone={m.type === 'Payment' ? 'indigo' : 'gray'}>{m.type}</Badge> },
    { header: 'Size', align: 'right', cell: (m) => formatBytes(m.sizeBytes) },
    { header: 'Integrity', cell: (m) => <Badge tone={ANCHOR_TONE[m.anchor]}>{ANCHOR_LABEL[m.anchor]}</Badge> },
    { header: 'Hash', cell: (m) => <Mono value={m.messageHash} head={8} tail={6} /> },
    { header: 'Received', cell: (m) => <span className="whitespace-nowrap">{formatDate(m.receivedAt)}</span> },
  ];

  return (
    <>
      <PageHeader title="Messages" description="Message metadata. Newest first." />
      <Notice>
        <span className="inline-flex items-start gap-2">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>
            Message content is end-to-end encrypted, so nobody can read it here — not even admins. Messages also cannot be edited or deleted from the dashboard: every message is
            signed, hash-chained and anchored on-chain, and any change would be detected by the apps.
          </span>
        </span>
      </Notice>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <Input value={conversationId} onChange={(event) => setFilter('conversationId', event.target.value)} placeholder="Conversation id (0x…)" className="max-w-xs font-mono" spellCheck={false} />
          <Input value={sender} onChange={(event) => setFilter('sender', event.target.value)} placeholder="Sender address (0x…)" className="max-w-xs font-mono" spellCheck={false} />
          {(conversationId || sender) && (
            <Button variant="ghost" onClick={() => setParams({}, { replace: true })}>
              Clear filters
            </Button>
          )}
          {!senderValid && <span className="text-sm text-red-600">Enter a full wallet address.</span>}
        </div>
        <DataTable columns={columns} rows={messages.data?.items} rowKey={(m) => m.id} loading={messages.isPending && senderValid} error={messages.error} empty="No messages match." />
        {messages.data && <Pagination page={messages.data.page} pageSize={messages.data.pageSize} total={messages.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
