import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Anchor } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button, Card, Input, Mono, Notice, PageHeader, Toggle, toast, toastError } from '@/components/ui';
import { api, post, put } from '@/lib/api';
import { formatAmount, formatDate, formatNumber } from '@/lib/format';
import type { RuntimeSettings, SystemInfo } from '@/lib/types';

const SECTION_TITLES: Record<string, string> = {
  anchoring: 'Anchoring job',
  indexer: 'Chain indexer',
  payments: 'Payment verifier',
  gasDrip: 'Gas drip',
  auth: 'Sign-in',
  rateLimiting: 'Rate limiting',
  groups: 'Groups',
};

/** "intervalSeconds" → "Interval seconds" */
const humanize = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/ (\w)/g, (m) => m.toLowerCase());

function SettingRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SystemPage() {
  const queryClient = useQueryClient();
  const system = useQuery({ queryKey: ['system'], queryFn: () => api<SystemInfo>('/system'), refetchInterval: 5_000 });
  const [maxMembers, setMaxMembers] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (changes: Partial<RuntimeSettings>) => put<RuntimeSettings>('/system/settings', changes),
    onSuccess: () => {
      toast('Setting saved. It applies immediately.');
      setMaxMembers(null);
      queryClient.invalidateQueries({ queryKey: ['system'] });
    },
    onError: toastError,
  });
  const anchorNow = useMutation({
    mutationFn: () => post('/system/anchor-now'),
    onSuccess: () => toast('Anchoring requested. New messages are written to the chain in a few seconds.'),
    onError: toastError,
  });

  const data = system.data;
  const settings = data?.settings;
  const limit = Number(data?.configuration.groups?.maxMembersLimit ?? 20);

  return (
    <>
      <PageHeader title="System" description="Runtime settings, chain connection and the server configuration." />
      {system.isError && <Notice tone="red">{system.error.message}</Notice>}

      {data && settings && (
        <div className="space-y-6">
          <Card title="Runtime settings">
            <div className="divide-y divide-slate-100">
              <SettingRow title="Pause messaging" description="Nobody can send messages while this is on. Reading history still works.">
                <Toggle checked={settings.messagingPaused} disabled={update.isPending} onChange={(value) => update.mutate({ messagingPaused: value })} />
              </SettingRow>
              <SettingRow title="Allow creating groups" description="Turn off to stop new groups. Existing groups keep working.">
                <Toggle checked={settings.groupCreationEnabled} disabled={update.isPending} onChange={(value) => update.mutate({ groupCreationEnabled: value })} />
              </SettingRow>
              <SettingRow title="Gas drip for new wallets" description={`Sends ${data.configuration.gasDrip?.amountEth ?? '—'} test ETH once to a new wallet so it can register.`}>
                <Toggle checked={settings.gasDripEnabled} disabled={update.isPending || data.configuration.gasDrip?.enabled === false} onChange={(value) => update.mutate({ gasDripEnabled: value })} />
              </SettingRow>
              <SettingRow title="Maximum members for new groups" description={`From 2 to ${limit}. Existing groups keep the limit they were created with.`}>
                <div className="flex items-center gap-2">
                  <Input type="number" min={2} max={limit} className="w-20" value={maxMembers ?? settings.groupMaxMembers} onChange={(event) => setMaxMembers(event.target.value)} />
                  <Button disabled={maxMembers === null || Number(maxMembers) === settings.groupMaxMembers} loading={update.isPending} onClick={() => update.mutate({ groupMaxMembers: Number(maxMembers) })}>
                    Save
                  </Button>
                </div>
              </SettingRow>
              <SettingRow title="Anchor messages now" description="Write the Merkle root of all waiting messages to the chain instead of waiting for the next interval.">
                <Button loading={anchorNow.isPending} onClick={() => anchorNow.mutate()}>
                  <Anchor className="size-4" /> Anchor now
                </Button>
              </SettingRow>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Blockchain">
              <dl className="divide-y divide-slate-100 text-sm">
                {[
                  ['Network', data.chain.network],
                  ['Chain id', data.chain.chainId],
                  ['Latest block', data.chain.blockNumber === null ? <Badge tone="red">Unreachable</Badge> : formatNumber(data.chain.blockNumber)],
                  ['RPC endpoints', data.chain.rpcUrls.join(', ')],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between gap-4 px-5 py-3">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="min-w-0 truncate text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card title="Funder wallet">
              {data.funder.enabled ? (
                <dl className="divide-y divide-slate-100 text-sm">
                  <div className="flex items-center justify-between gap-4 px-5 py-3">
                    <dt className="text-slate-500">Address</dt>
                    <dd>
                      <Mono value={data.funder.address} head={10} tail={8} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 px-5 py-3">
                    <dt className="text-slate-500">ETH balance</dt>
                    <dd className="tabular-nums text-slate-900">{formatAmount(data.funder.eth)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 px-5 py-3">
                    <dt className="text-slate-500">CHAT balance</dt>
                    <dd className="tabular-nums text-slate-900">{formatAmount(data.funder.chat, 2)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 px-5 py-3">
                    <dt className="text-slate-500">Limit per action</dt>
                    <dd className="text-slate-900">
                      {formatNumber(data.funder.maxFundEth)} ETH · {formatNumber(data.funder.maxFundChat)} CHAT
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="px-5 py-8 text-center text-sm text-slate-500">Funding is not configured (Admin:FunderPrivateKey is empty).</p>
              )}
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Contracts">
              <ul className="divide-y divide-slate-100 text-sm">
                {data.contracts.map((contract) => (
                  <li key={contract.name} className="flex items-center justify-between gap-4 px-5 py-3">
                    <span className="font-medium text-slate-900">{contract.name}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">block {contract.deployBlock}</span>
                      <Mono value={contract.address} head={8} tail={6} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="Indexer progress">
              {data.indexer.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">The indexer has not processed any block yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.indexer.map((state) => (
                    <li key={state.contract} className="flex items-center justify-between gap-4 px-5 py-3">
                      <span>
                        <span className="font-medium text-slate-900">{state.contract}</span>
                        <span className="block text-xs text-slate-500">updated {formatDate(state.updatedAt)}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums text-slate-700">block {formatNumber(state.lastProcessedBlock)}</span>
                        {state.behind !== null && <Badge tone={state.behind <= 5 ? 'green' : 'amber'}>{state.behind <= 5 ? 'In sync' : `${state.behind} behind`}</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title="Server configuration (read-only)">
            <p className="border-b border-slate-100 px-5 py-2.5 text-xs text-slate-500">
              Set with environment variables or appsettings and applied when the API starts. Secrets (private keys, the token signing key, database passwords) are never shown here.
            </p>
            <div className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(data.configuration).map(([section, values]) => (
                <div key={section}>
                  <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{SECTION_TITLES[section] ?? humanize(section)}</h3>
                  <dl className="mt-2 space-y-1.5 text-sm">
                    {Object.entries(values).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <dt className="text-slate-500">{humanize(key)}</dt>
                        <dd className="font-medium text-slate-900 tabular-nums">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
