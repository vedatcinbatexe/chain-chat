import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';

import { useMe } from '@/components/Layout';
import { Badge, Button, Card, ConfirmDialog, DataTable, Field, Input, Modal, Mono, Notice, PageHeader, UserCell, toast, toastError, type Column } from '@/components/ui';
import { api, del, post } from '@/lib/api';
import { displayName, formatDate } from '@/lib/format';
import type { AdminRow } from '@/lib/types';

export function AdminsPage() {
  const queryClient = useQueryClient();
  const me = useMe();
  const isRoot = me.data?.isRoot ?? false;
  const [adding, setAdding] = useState(false);
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [removing, setRemoving] = useState<AdminRow | null>(null);

  const admins = useQuery({ queryKey: ['admins'], queryFn: () => api<AdminRow[]>('/admins') });
  const refresh = () => queryClient.invalidateQueries();

  const add = useMutation({
    mutationFn: () => post('/admins', { address: address.trim(), note }),
    onSuccess: () => {
      toast('Admin added. They can sign in with that wallet now.');
      setAdding(false);
      setAddress('');
      setNote('');
      refresh();
    },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: (admin: AdminRow) => del(`/admins/${admin.address}`),
    onSuccess: () => {
      toast('Admin removed. Their access ends immediately.');
      setRemoving(null);
      refresh();
    },
    onError: toastError,
  });

  const columns: Column<AdminRow>[] = [
    { header: 'Admin', cell: (a) => <UserCell address={a.address} username={a.username} /> },
    { header: 'Role', cell: (a) => (a.isRoot ? <Badge tone="indigo">Root admin</Badge> : <Badge>Admin</Badge>) },
    { header: 'Note', cell: (a) => <span className="text-slate-500">{a.note ?? '—'}</span> },
    { header: 'Added by', cell: (a) => <Mono value={a.addedBy} /> },
    { header: 'Added', cell: (a) => formatDate(a.addedAt) },
    {
      header: '',
      align: 'right',
      cell: (a) =>
        !a.isRoot &&
        isRoot && (
          <Button variant="danger" onClick={() => setRemoving(a)}>
            Remove
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Admins"
        description="Wallets that can sign in to this dashboard."
        actions={
          isRoot && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <UserPlus className="size-4" /> Add admin
            </Button>
          )
        }
      />
      <Notice>
        <strong>Root admins</strong> are listed in the server configuration (<code className="font-mono text-xs">Admin:Addresses</code>) and can add or remove other admins.{' '}
        <strong>Admins</strong> can do everything else: manage users and groups, add balance, and change runtime settings.
        {!isRoot && me.data && ' You are signed in as an admin, so this list is read-only for you.'}
      </Notice>
      <Card>
        <DataTable columns={columns} rows={admins.data} rowKey={(a) => a.address} loading={admins.isPending} error={admins.error} />
      </Card>

      <Modal
        open={adding}
        title="Add an admin"
        onClose={() => setAdding(false)}
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button variant="primary" disabled={!/^0x[0-9a-fA-F]{40}$/.test(address.trim())} loading={add.isPending} onClick={() => add.mutate()}>
              Add admin
            </Button>
          </>
        }>
        <Field label="Wallet address" hint="The wallet signs in to the dashboard with Sign-In with Ethereum.">
          <Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="0x…" className="font-mono" spellCheck={false} />
        </Field>
        <Field label="Note (optional)">
          <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} placeholder="Who is this?" />
        </Field>
      </Modal>
      <ConfirmDialog
        open={removing !== null}
        title="Remove this admin?"
        message={removing && <>{displayName(removing.username, removing.address)} will lose access to the dashboard immediately.</>}
        confirmLabel="Remove admin"
        danger
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}
