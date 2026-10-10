import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Award, Ban, Coins, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { FundDialog } from '@/components/FundDialog';
import { MintBadgeDialog } from './Badges';
import { Badge, Button, Card, Field, Input, Modal, Mono, Notice, PageHeader, Stat, toast, toastError } from '@/components/ui';
import { api, del, post } from '@/lib/api';
import { formatAmount, formatDate, formatNumber } from '@/lib/format';
import type { UserDetail } from '@/lib/types';

export function UserDetailPage() {
  const { address = '' } = useParams();
  const queryClient = useQueryClient();
  const [funding, setFunding] = useState(false);
  const [banning, setBanning] = useState(false);
  const [mintingBadge, setMintingBadge] = useState(false);
  const [reason, setReason] = useState('');

  const user = useQuery({ queryKey: ['user', address], queryFn: () => api<UserDetail>(`/users/${address}`), refetchInterval: 10_000 });
  const refresh = () => queryClient.invalidateQueries();

  const ban = useMutation({
    mutationFn: () => post(`/users/${address}/ban`, { reason }),
    onSuccess: () => {
      toast('User banned.');
      setBanning(false);
      setReason('');
      refresh();
    },
    onError: toastError,
  });
  const unban = useMutation({
    mutationFn: () => del(`/users/${address}/ban`),
    onSuccess: () => {
      toast('Ban lifted.');
      refresh();
    },
    onError: toastError,
  });

  const data = user.data;
  return (
    <>
      <Link to="/users" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Users
      </Link>
      <PageHeader
        title={data?.username ? `@${data.username}` : 'Account'}
        description={address}
        actions={
          data && (
            <>
              <Button variant="primary" onClick={() => setFunding(true)}>
                <Coins className="size-4" /> Add balance
              </Button>
              <Button onClick={() => setMintingBadge(true)} title="Mints one badge (ERC-721) to this wallet">
                <Award className="size-4" /> Mint badge
              </Button>
              {data.ban ? (
                <Button loading={unban.isPending} onClick={() => unban.mutate()}>
                  Lift ban
                </Button>
              ) : (
                <Button variant="danger" disabled={data.isAdmin} title={data.isAdmin ? 'Admins cannot be banned' : undefined} onClick={() => setBanning(true)}>
                  <Ban className="size-4" /> Ban
                </Button>
              )}
            </>
          )
        }
      />

      {user.isError && <Notice tone="red">{user.error.message}</Notice>}
      {data?.ban && (
        <Notice tone="red">
          <strong>Banned</strong> on {formatDate(data.ban.bannedAt)}
          {data.ban.reason ? ` — ${data.ban.reason}` : ''}. This wallet cannot sign in, send messages or join groups.
        </Notice>
      )}
      {data && !data.registered && <Notice tone="amber">This address has no username in the Registry contract.</Notice>}

      {data && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge tone={data.online ? 'green' : 'gray'}>{data.online ? 'Online' : 'Offline'}</Badge>
            {data.isAdmin && (
              <Badge tone="indigo">
                <ShieldCheck className="size-3" /> Admin
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.assets.length > 0 ? (
              data.assets.map((asset) => <Stat key={asset.symbol} label={`${asset.symbol} balance`} value={formatAmount(asset.amount)} hint={asset.symbol === 'ETH' ? 'For gas' : 'ERC-20'} />)
            ) : (
              <Stat label="Balances" value="—" hint="The chain is not reachable" />
            )}
            <Stat label="Badges" value={data.balances?.badges ?? '—'} hint={data.badges.length ? data.badges.map((b) => (b.count > 1 ? `${b.name} ×${b.count}` : b.name)).join(', ') : 'ERC-721, for gated groups'} />
            <Stat label="Messages sent" value={formatNumber(data.messages)} hint={`${data.conversations} conversations`} />
            <Stat label="Payments" value={formatNumber(data.paymentsSent + data.paymentsReceived)} hint={`${data.paymentsSent} sent · ${data.paymentsReceived} received`} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="On-chain identity">
              <dl className="divide-y divide-slate-100 text-sm">
                {[
                  ['Address', <Mono key="a" value={data.address} full />],
                  ['Encryption key (X25519)', <Mono key="k" value={data.encryptionPublicKey} full />],
                  ['Registered', formatDate(data.registeredAt)],
                  ['Registration block', data.registeredAtBlock ?? '—'],
                  ['Registration transaction', <Mono key="t" value={data.registrationTxHash} full />],
                ].map(([label, value]) => (
                  <div key={label as string} className="grid grid-cols-3 gap-3 px-5 py-3">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="col-span-2 min-w-0 text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card title={`Groups (${data.groups.length})`}>
              {data.groups.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">Not a member of any group.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.groups.map((group) => (
                    <li key={group.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <Link to={`/groups/${group.id}`} className="truncate font-medium text-slate-900 hover:text-indigo-600">
                        {group.name}
                      </Link>
                      <span className="shrink-0 text-xs text-slate-500">joined {formatDate(group.joinedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      <FundDialog open={funding} onClose={() => setFunding(false)} address={address} />
      <MintBadgeDialog open={mintingBadge} onClose={() => setMintingBadge(false)} address={address} />
      <Modal
        open={banning}
        title="Ban this user?"
        onClose={() => setBanning(false)}
        footer={
          <>
            <Button onClick={() => setBanning(false)}>Cancel</Button>
            <Button variant="danger" loading={ban.isPending} onClick={() => ban.mutate()}>
              Ban user
            </Button>
          </>
        }>
        <p className="text-sm text-slate-600">
          The wallet will not be able to sign in, send messages or join groups. Its username and funds stay on-chain — the server cannot take those away.
        </p>
        <Field label="Reason (optional)">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} placeholder="Shown to other admins" />
        </Field>
      </Modal>
    </>
  );
}
