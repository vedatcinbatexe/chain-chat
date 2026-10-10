import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { post } from '@/lib/api';
import { formatAmount } from '@/lib/format';
import type { Asset, FundingRow } from '@/lib/types';

import { Button, Field, Input, Modal, toast, toastError } from './ui';

const PRESETS: Record<Asset, string[]> = { CHAT: ['100', '500', '1000'], ETH: ['0.05', '0.5', '1'] };

/** Adds balance to an account: sends test ETH from the funder wallet, or mints CHAT. A real transaction on the chain. */
export function FundDialog({ open, onClose, address: fixedAddress }: { open: boolean; onClose: () => void; address?: string }) {
  const queryClient = useQueryClient();
  const [address, setAddress] = useState('');
  const [asset, setAsset] = useState<Asset>('CHAT');
  const [amount, setAmount] = useState('100');
  const target = fixedAddress ?? address.trim();

  const fund = useMutation({
    mutationFn: () => post<FundingRow>('/funding', { address: target, asset, amount: Number(amount) }),
    onSuccess: (funding) => {
      toast(`Sent ${formatAmount(funding.amount)} ${asset} — the balance is updated on-chain.`);
      queryClient.invalidateQueries();
      onClose();
    },
    onError: toastError,
  });

  const valid = /^0x[0-9a-fA-F]{40}$/.test(target) && Number(amount) > 0;

  return (
    <Modal
      open={open}
      title="Add balance"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} loading={fund.isPending} onClick={() => fund.mutate()}>
            {fund.isPending ? 'Waiting for the transaction…' : `Send ${asset}`}
          </Button>
        </>
      }>
      {fixedAddress ? (
        <Field label="Account">
          <p className="font-mono text-xs break-all text-slate-600">{fixedAddress}</p>
        </Field>
      ) : (
        <Field label="Account address">
          <Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="0x…" spellCheck={false} className="font-mono" />
        </Field>
      )}

      <Field label="Asset" hint={asset === 'CHAT' ? 'Mints new CHAT tokens to the account (ERC-20 mint by the contract owner).' : 'Sends test ETH from the funder wallet, for gas.'}>
        <div className="grid grid-cols-2 gap-2">
          {(['CHAT', 'ETH'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setAsset(option);
                setAmount(PRESETS[option][0]);
              }}
              className={`h-9 rounded-lg text-sm font-medium ring-1 ring-inset ${asset === option ? 'bg-indigo-50 text-indigo-700 ring-indigo-300' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'}`}>
              {option}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Amount">
        <Input type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} />
        <div className="flex gap-2 pt-1">
          {PRESETS[asset].map((preset) => (
            <button key={preset} type="button" onClick={() => setAmount(preset)} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">
              {preset}
            </button>
          ))}
        </div>
      </Field>
    </Modal>
  );
}
