import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Badge, Button, Card, ConfirmDialog, DataTable, Mono, Notice, PageHeader, Stat, UserCell, toast, toastError, type Column } from '@/components/ui';
import { api, del, post } from '@/lib/api';
import { displayName, formatDate, formatNumber } from '@/lib/format';
import type { GroupDetail } from '@/lib/types';

type Member = GroupDetail['members'][number];

export function GroupDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<Member | null>(null);
  const [rotating, setRotating] = useState(false);

  const group = useQuery({ queryKey: ['group', id], queryFn: () => api<GroupDetail>(`/groups/${id}`), refetchInterval: 10_000 });
  const refresh = () => queryClient.invalidateQueries();

  const remove = useMutation({
    mutationFn: (member: Member) => del(`/groups/${id}/members/${member.address}`),
    onSuccess: () => {
      toast('Member removed. New messages are no longer encrypted to them.');
      setRemoving(null);
      refresh();
    },
    onError: toastError,
  });
  const rotate = useMutation({
    mutationFn: () => post<{ inviteCode: string }>(`/groups/${id}/rotate-invite`),
    onSuccess: () => {
      toast('New invite link created. The old link no longer works.');
      setRotating(false);
      refresh();
    },
    onError: toastError,
  });

  const columns: Column<Member>[] = [
    { header: 'Member', cell: (m) => <UserCell address={m.address} username={m.username} online={m.online} /> },
    {
      header: 'Role',
      cell: (m) => (m.address.toLowerCase() === group.data?.createdBy.toLowerCase() ? <Badge tone="indigo">Creator</Badge> : <Badge>Member</Badge>),
    },
    { header: 'Joined', cell: (m) => formatDate(m.joinedAt) },
    {
      header: '',
      align: 'right',
      cell: (m) => (
        <Button variant="danger" onClick={() => setRemoving(m)}>
          Remove
        </Button>
      ),
    },
  ];

  const data = group.data;
  return (
    <>
      <Link to="/groups" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Groups
      </Link>
      <PageHeader title={data?.name ?? 'Group'} description={data ? `Created ${formatDate(data.createdAt)}` : undefined} />
      {group.isError && <Notice tone="red">{group.error.message}</Notice>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Stat label="Members" value={`${data.members.length} / ${data.maxMembers}`} hint={`${data.members.filter((m) => m.online).length} online`} />
            <Stat label="Messages" value={formatNumber(data.messages)} hint="End-to-end encrypted" />
            <div className="col-span-2 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-500">Invite code</p>
                <Button variant="ghost" className="h-7 px-2" onClick={() => setRotating(true)}>
                  <RefreshCw className="size-3.5" /> New link
                </Button>
              </div>
              <div className="mt-2">
                <Mono value={data.inviteCode} full />
              </div>
              <p className="mt-1 text-xs text-slate-500">Anyone with chainchat://join/&lt;code&gt; can join.</p>
            </div>
          </div>

          <Card title="Group" className="mt-6">
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="grid grid-cols-3 gap-3 px-5 py-3">
                <dt className="text-slate-500">Conversation id</dt>
                <dd className="col-span-2 min-w-0">
                  <Mono value={data.id} full />
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-3 px-5 py-3">
                <dt className="text-slate-500">Access</dt>
                <dd className="col-span-2 min-w-0 space-y-1">
                  {data.requiredBadgeContract ? (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {data.requiredBadges.map((badge) => (
                          <Badge key={badge.id} tone="indigo">
                            {badge.name}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500">
                        NFT-gated: members must hold {data.requiredBadges.length > 1 ? 'all of these badges' : 'this badge'} (ERC-721). A member who transfers a required
                        badge away is removed automatically. Contract: <Mono value={data.requiredBadgeContract} head={8} tail={6} />
                      </p>
                    </>
                  ) : (
                    <Badge>Invite link</Badge>
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-3 px-5 py-3">
                <dt className="text-slate-500">Messages</dt>
                <dd className="col-span-2">
                  <Link to={`/messages?conversationId=${data.id}`} className="font-medium text-indigo-600 hover:text-indigo-500">
                    View message metadata
                  </Link>
                </dd>
              </div>
            </dl>
          </Card>

          <Card title={`Members (${data.members.length})`} className="mt-6">
            <DataTable columns={columns} rows={data.members} rowKey={(m) => m.address} empty="This group has no members left." />
          </Card>
        </>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this member?"
        message={
          removing && (
            <>
              <strong>{displayName(removing.username, removing.address)}</strong> will be removed from the group. Other members stop encrypting new messages to them. They can
              rejoin with the invite link unless you also create a new link.
            </>
          )
        }
        confirmLabel="Remove member"
        danger
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
        onClose={() => setRemoving(null)}
      />
      <ConfirmDialog
        open={rotating}
        title="Create a new invite link?"
        message="The current invite link stops working immediately. Existing members stay in the group."
        confirmLabel="Create new link"
        loading={rotate.isPending}
        onConfirm={() => rotate.mutate()}
        onClose={() => setRotating(false)}
      />
    </>
  );
}
