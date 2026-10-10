import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Card, DataTable, Mono, PageHeader, Pagination, UserCell, type Column } from '@/components/ui';
import { api, query } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { AuditRow, Paged } from '@/lib/types';

const ACTIONS: Record<string, string> = {
  BanUser: 'Banned a user',
  UnbanUser: 'Lifted a ban',
  FundAccount: 'Added balance',
  RemoveGroupMember: 'Removed a group member',
  RotateGroupInvite: 'Replaced an invite link',
  AddAdmin: 'Added an admin',
  RemoveAdmin: 'Removed an admin',
  UpdateSettings: 'Changed settings',
  AnchorNow: 'Triggered anchoring',
};

const COLUMNS: Column<AuditRow>[] = [
  { header: 'Time', cell: (e) => <span className="whitespace-nowrap">{formatDate(e.createdAt)}</span> },
  { header: 'Admin', cell: (e) => <UserCell address={e.admin} username={e.adminUsername} /> },
  { header: 'Action', cell: (e) => <Badge tone="indigo">{ACTIONS[e.action] ?? e.action}</Badge> },
  { header: 'Target', cell: (e) => <Mono value={e.target} head={10} tail={6} /> },
  { header: 'Details', cell: (e) => <span className="break-all text-slate-500">{e.details ?? '—'}</span> },
];

export function AuditPage() {
  const [page, setPage] = useState(1);
  const audit = useQuery({
    queryKey: ['audit', page],
    queryFn: () => api<Paged<AuditRow>>(`/audit${query({ page })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });

  return (
    <>
      <PageHeader title="Audit log" description="Every change made from this dashboard, with the admin who made it. Entries cannot be edited." />
      <Card>
        <DataTable columns={COLUMNS} rows={audit.data?.items} rowKey={(e) => e.id} loading={audit.isPending} error={audit.error} empty="No admin actions yet." />
        {audit.data && <Pagination page={audit.data.page} pageSize={audit.data.pageSize} total={audit.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
