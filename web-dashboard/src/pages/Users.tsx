import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Card, DataTable, Input, PageHeader, Pagination, UserCell, type Column } from '@/components/ui';
import { api, query } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import type { Paged, UserRow } from '@/lib/types';

const COLUMNS: Column<UserRow>[] = [
  { header: 'User', cell: (u) => <UserCell address={u.address} username={u.username} online={u.online} /> },
  {
    header: 'Status',
    cell: (u) => (
      <div className="flex gap-1.5">
        {u.banned ? <Badge tone="red">Banned</Badge> : <Badge tone={u.online ? 'green' : 'gray'}>{u.online ? 'Online' : 'Offline'}</Badge>}
      </div>
    ),
  },
  { header: 'Messages', align: 'right', cell: (u) => formatNumber(u.messages) },
  { header: 'Registered', cell: (u) => <span className="whitespace-nowrap">{formatDate(u.registeredAt)}</span> },
  { header: 'Block', align: 'right', cell: (u) => formatNumber(u.registeredAtBlock) },
  {
    header: '',
    align: 'right',
    cell: (u) => (
      <Link to={`/users/${u.address}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
        Manage
      </Link>
    ),
  },
];

export function UsersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const users = useQuery({
    queryKey: ['users', search, page],
    queryFn: () => api<Paged<UserRow>>(`/users${query({ q: search.trim(), page })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });

  return (
    <>
      <PageHeader title="Users" description="Wallets registered in the on-chain Registry, as mirrored by the indexer." />
      <Card>
        <div className="border-b border-slate-100 p-4">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by username or address…"
            className="max-w-sm"
            spellCheck={false}
          />
        </div>
        <DataTable columns={COLUMNS} rows={users.data?.items} rowKey={(u) => u.address} loading={users.isPending} error={users.error} empty="No users match." />
        {users.data && <Pagination page={users.data.page} pageSize={users.data.pageSize} total={users.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
