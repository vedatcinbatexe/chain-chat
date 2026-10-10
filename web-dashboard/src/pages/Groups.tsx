import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Card, DataTable, Input, PageHeader, Pagination, UserCell, type Column } from '@/components/ui';
import { api, query } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import type { GroupRow, Paged } from '@/lib/types';

const COLUMNS: Column<GroupRow>[] = [
  {
    header: 'Group',
    cell: (g) => (
      <Link to={`/groups/${g.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
        {g.name}
      </Link>
    ),
  },
  { header: 'Access', cell: (g) => (g.requiresBadge ? <Badge tone="indigo">{g.requiredBadgeTypes.length === 1 ? '1 badge required' : `${g.requiredBadgeTypes.length} badges required`}</Badge> : <Badge>Invite link</Badge>) },
  { header: 'Created by', cell: (g) => <UserCell address={g.createdBy} username={g.creatorUsername} /> },
  { header: 'Members', align: 'right', cell: (g) => `${g.members} / ${g.maxMembers}` },
  { header: 'Messages', align: 'right', cell: (g) => formatNumber(g.messages) },
  { header: 'Created', cell: (g) => <span className="whitespace-nowrap">{formatDate(g.createdAt)}</span> },
  {
    header: '',
    align: 'right',
    cell: (g) => (
      <Link to={`/groups/${g.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
        Manage
      </Link>
    ),
  },
];

export function GroupsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const groups = useQuery({
    queryKey: ['groups', search, page],
    queryFn: () => api<Paged<GroupRow>>(`/groups${query({ q: search.trim(), page })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });

  return (
    <>
      <PageHeader title="Groups" description="Group conversations joined through invite links." />
      <Card>
        <div className="border-b border-slate-100 p-4">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by group name…"
            className="max-w-sm"
          />
        </div>
        <DataTable columns={COLUMNS} rows={groups.data?.items} rowKey={(g) => g.id} loading={groups.isPending} error={groups.error} empty="No groups yet." />
        {groups.data && <Pagination page={groups.data.page} pageSize={groups.data.pageSize} total={groups.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
