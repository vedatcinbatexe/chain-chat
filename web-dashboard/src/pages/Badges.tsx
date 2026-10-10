import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Plus } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button, Card, DataTable, Field, Input, Modal, Mono, Notice, PageHeader, toast, toastError, type Column } from '@/components/ui';
import { api, post } from '@/lib/api';
import type { BadgeTypes } from '@/lib/types';

type Row = BadgeTypes['types'][number];

export const useBadgeTypes = () => useQuery({ queryKey: ['badge-types'], queryFn: () => api<BadgeTypes>('/badges') });

/** Mints one badge of a chosen type to a wallet. With `address`, the wallet is fixed (user page). */
export function MintBadgeDialog({ open, onClose, address: fixedAddress, typeId: initialType }: { open: boolean; onClose: () => void; address?: string; typeId?: number }) {
  const queryClient = useQueryClient();
  const badges = useBadgeTypes();
  const [address, setAddress] = useState('');
  const [chosen, setChosen] = useState<number | null>(null);
  const target = fixedAddress ?? address.trim();
  const typeId = chosen ?? initialType ?? badges.data?.types[0]?.id ?? null;
  const type = badges.data?.types.find((t) => t.id === typeId);

  const mint = useMutation({
    mutationFn: () => post(`/users/${target}/badge`, { typeId }),
    onSuccess: () => {
      toast(`${type?.name ?? 'Badge'} minted. The wallet holds it on-chain now.`);
      queryClient.invalidateQueries();
      setChosen(null);
      onClose();
    },
    onError: toastError,
  });

  return (
    <Modal
      open={open}
      title="Mint a badge"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!/^0x[0-9a-fA-F]{40}$/.test(target) || typeId === null} loading={mint.isPending} onClick={() => mint.mutate()}>
            {mint.isPending ? 'Waiting for the transaction…' : 'Mint badge'}
          </Button>
        </>
      }>
      {fixedAddress ? (
        <Field label="Wallet">
          <p className="font-mono text-xs break-all text-slate-600">{fixedAddress}</p>
        </Field>
      ) : (
        <Field label="Wallet address">
          <Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="0x…" spellCheck={false} className="font-mono" />
        </Field>
      )}
      <Field label="Badge" hint="Mints one ERC-721 badge of this type (ClassBadge.mint, contract owner only). Groups can require it to join.">
        <div className="flex flex-wrap gap-2">
          {badges.data?.types.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setChosen(t.id)}
              className={`h-9 rounded-lg px-3 text-sm font-medium ring-1 ring-inset ${t.id === typeId ? 'bg-indigo-50 text-indigo-700 ring-indigo-300' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'}`}>
              {t.name}
            </button>
          ))}
          {badges.data?.types.length === 0 && <span className="text-sm text-slate-500">No badge types yet. Create one on the Badges page.</span>}
        </div>
      </Field>
    </Modal>
  );
}

export function BadgesPage() {
  const queryClient = useQueryClient();
  const badges = useBadgeTypes();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [minting, setMinting] = useState<number | null>(null);

  const create = useMutation({
    mutationFn: () => post<Row>('/badges', { name: name.trim() }),
    onSuccess: (created) => {
      toast(`Badge "${created.name}" created on-chain.`);
      setCreating(false);
      setName('');
      queryClient.invalidateQueries();
    },
    onError: toastError,
  });

  const columns: Column<Row>[] = [
    { header: 'Id', cell: (t) => <span className="tabular-nums text-slate-500">#{t.id}</span> },
    {
      header: 'Badge',
      cell: (t) => (
        <span className="inline-flex items-center gap-2 font-medium text-slate-900">
          <Award className="size-4 text-indigo-500" /> {t.name}
        </span>
      ),
    },
    { header: 'Required by', cell: (t) => (t.groups > 0 ? <Badge tone="indigo">{t.groups === 1 ? '1 group' : `${t.groups} groups`}</Badge> : <span className="text-slate-400">No group</span>) },
    {
      header: '',
      align: 'right',
      cell: (t) => <Button onClick={() => setMinting(t.id)}>Mint to a wallet</Button>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Badges"
        description="Badge types in the ClassBadge contract (ERC-721). Groups can require one or more of them to join."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New badge
          </Button>
        }
      />
      <Notice>
        A badge is an NFT in a user&apos;s wallet. A group&apos;s creator chooses which badges are required; a wallet must hold <strong>all</strong> of them to join, and is
        removed when it transfers one away. Badge types live on the blockchain: once created they cannot be renamed or deleted.
        {badges.data?.contract && (
          <>
            {' '}
            Contract: <Mono value={badges.data.contract} head={8} tail={6} />
          </>
        )}
      </Notice>
      <Card>
        <DataTable columns={columns} rows={badges.data?.types} rowKey={(t) => t.id} loading={badges.isPending} error={badges.error} empty="No badge types yet." />
      </Card>

      <Modal
        open={creating}
        title="New badge"
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Waiting for the transaction…' : 'Create badge'}
            </Button>
          </>
        }>
        <Field label="Name" hint="Up to 32 characters, e.g. “Student” or “Project team”. Stored on-chain and permanent.">
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} autoFocus />
        </Field>
      </Modal>
      <MintBadgeDialog open={minting !== null} onClose={() => setMinting(null)} typeId={minting ?? undefined} key={minting ?? 'none'} />
    </>
  );
}
