import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { useState } from 'react';

import { Button, Card, DataTable, Field, Input, Mono, Notice, PageHeader, Pagination, toast, toastError, type Column } from '@/components/ui';
import { api, post, query } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { AnnouncementRow, Overview, Paged } from '@/lib/types';

const COLUMNS: Column<AnnouncementRow>[] = [
  { header: 'Sent', cell: (a) => <span className="whitespace-nowrap">{formatDate(a.createdAt)}</span> },
  {
    header: 'Announcement',
    cell: (a) => (
      <div className="max-w-xl">
        <p className="font-medium text-slate-900">{a.title}</p>
        <p className="mt-0.5 text-slate-500">{a.body}</p>
      </div>
    ),
  },
  { header: 'Online then', align: 'right', cell: (a) => a.onlineRecipients },
  { header: 'By admin', cell: (a) => <Mono value={a.admin} /> },
];

export function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [page, setPage] = useState(1);

  const overview = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/overview'), refetchInterval: 5_000 });
  const announcements = useQuery({
    queryKey: ['announcements', page],
    queryFn: () => api<Paged<AnnouncementRow>>(`/announcements${query({ page })}`),
    placeholderData: keepPreviousData,
  });

  const send = useMutation({
    mutationFn: () => post<{ onlineRecipients: number }>('/announcements', { title: title.trim(), body: body.trim() }),
    onSuccess: (result) => {
      toast(`Announcement sent to ${result.onlineRecipients} online ${result.onlineRecipients === 1 ? 'user' : 'users'}.`);
      setTitle('');
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError: toastError,
  });

  const online = overview.data?.onlineNow;
  return (
    <>
      <PageHeader title="Announcements" description="Send a notification to everyone who has the app open." />
      <Notice>
        An announcement appears as a banner in every connected app, and in its notification inbox. It reaches <strong>only users who are online right now</strong>
        {online !== undefined && ` (${online} at the moment)`}: announcements are not queued for later, and they are not chat messages — they are plain text from the server, not
        end-to-end encrypted.
      </Notice>

      <Card title="New announcement" className="mb-6">
        <div className="space-y-4 p-5">
          <Field label="Title" hint={`${title.length}/80`}>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="e.g. Maintenance tonight" />
          </Field>
          <Field label="Message" hint={`${body.length}/500`}>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="What should users know?"
              className="w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </Field>
          <div className="flex justify-end">
            <Button variant="primary" disabled={!title.trim() || !body.trim()} loading={send.isPending} onClick={() => send.mutate()}>
              <Megaphone className="size-4" /> Send to online users
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Sent announcements">
        <DataTable columns={COLUMNS} rows={announcements.data?.items} rowKey={(a) => a.id} loading={announcements.isPending} error={announcements.error} empty="No announcements sent yet." />
        {announcements.data && <Pagination page={announcements.data.page} pageSize={announcements.data.pageSize} total={announcements.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
