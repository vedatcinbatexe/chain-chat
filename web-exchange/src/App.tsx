import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Coins, LogOut, Plus, Wallet as WalletIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, formatAmount, shorten, toUnits, type Asset, type Transfer, type Wallet } from './api';
import { Button, Choices, Copyable, Field, Input, Modal, Toasts, type Toast } from './ui';

const ACCOUNT_KEY = 'chainchat-exchange-account';

/** Small toast list owned by the page. */
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const show = useCallback((text: string, error = false) => {
    const id = next.current++;
    setToasts((current) => [...current, { id, text, error }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), error ? 6000 : 4000);
  }, []);
  return { toasts, show };
}

export function App() {
  const [account, setAccount] = useState(() => localStorage.getItem(ACCOUNT_KEY) ?? '');
  const signIn = (name: string) => {
    localStorage.setItem(ACCOUNT_KEY, name);
    setAccount(name);
  };
  const signOut = () => {
    localStorage.removeItem(ACCOUNT_KEY);
    setAccount('');
  };
  return account ? <Portal account={account} onSignOut={signOut} /> : <Welcome onContinue={signIn} />;
}

function Welcome({ onContinue }: { onContinue: (account: string) => void }) {
  const [name, setName] = useState('');
  const normalized = name.trim().toLowerCase();
  const valid = /^[a-z0-9_-]{2,32}$/.test(normalized);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-900 to-slate-900 p-4">
      <form
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onContinue(normalized);
        }}>
        <span className="flex size-12 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <ArrowLeftRight className="size-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-slate-900">ChainChat Exchange</h1>
        <p className="mt-1 text-sm text-slate-500">
          A <strong>simulated</strong> exchange for the demo. Create wallets with test balances, deposit them into ChainChat, and receive withdrawals from the app.
        </p>
        <div className="mt-6 space-y-3">
          <Field label="Account name" hint="Just a name, no password: anyone who types the same name sees the same wallets. Nothing here has real value.">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. vedat" autoFocus spellCheck={false} />
          </Field>
          <Button variant="primary" className="h-10 w-full" disabled={!valid} type="submit">
            Open my wallets
          </Button>
        </div>
      </form>
    </div>
  );
}

function Portal({ account, onSignOut }: { account: string; onSignOut: () => void }) {
  const queryClient = useQueryClient();
  const { toasts, show } = useToasts();
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');

  const assets = useQuery({ queryKey: ['assets'], queryFn: api.assets, staleTime: Infinity });
  // Balances come from the chain; polling shows withdrawals from the app as they arrive.
  const wallets = useQuery({ queryKey: ['wallets', account], queryFn: () => api.wallets(account), refetchInterval: 4000 });

  const create = useMutation({
    mutationFn: () => api.createWallet(account, label.trim()),
    onSuccess: (wallet) => {
      show(`Wallet "${wallet.label}" created with a little test ETH for gas.`);
      setCreating(false);
      setLabel('');
      queryClient.invalidateQueries({ queryKey: ['wallets', account] });
    },
    onError: (error) => show(error.message, true),
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-gradient-to-r from-emerald-800 to-emerald-700 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-white/15">
              <ArrowLeftRight className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">ChainChat Exchange</p>
              <p className="text-xs text-emerald-100">Simulated · local test chain · no real value</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-emerald-50">
              Account <strong>{account}</strong>
            </span>
            <button type="button" onClick={onSignOut} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20">
              <LogOut className="size-4" /> Switch
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My wallets</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Each wallet is a real address on the local blockchain; the exchange holds its key, as a real exchange would. Balances shown here are read from the chain, not from a
              database.
            </p>
          </div>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New wallet
          </Button>
        </div>

        <div className="mb-6 grid gap-3 rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200 sm:grid-cols-3">
          <p>
            <strong className="text-slate-900">1 · Add a balance.</strong> Pick an asset and an amount; the test tokens are minted to the wallet.
          </p>
          <p>
            <strong className="text-slate-900">2 · Deposit into ChainChat.</strong> Type a username: the wallet sends a real on-chain transfer, and the app shows a notification.
          </p>
          <p>
            <strong className="text-slate-900">3 · Withdraw from ChainChat.</strong> In the app: Settings → Withdraw, enter the account name <strong>{account}</strong> once and
            pick one of these wallets. It arrives within seconds.
          </p>
        </div>

        {wallets.isPending ? (
          <p className="py-16 text-center text-sm text-slate-500">Loading wallets…</p>
        ) : wallets.isError ? (
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-100">{wallets.error.message}</p>
        ) : wallets.data.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-300 py-16 text-center">
            <WalletIcon className="mx-auto size-10 text-slate-400" />
            <p className="mt-3 font-medium text-slate-900">No wallets yet</p>
            <p className="mt-1 text-sm text-slate-500">Create your first wallet to give it a test balance.</p>
            <Button variant="primary" className="mt-4" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New wallet
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {wallets.data.map((wallet) => (
              <WalletCard key={wallet.address} account={account} wallet={wallet} assets={assets.data ?? []} notify={show} />
            ))}
          </div>
        )}
      </main>

      <Modal
        open={creating}
        title="New wallet"
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" disabled={!label.trim()} loading={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Creating on the chain…' : 'Create wallet'}
            </Button>
          </>
        }>
        <Field label="Wallet name" hint="For you to recognise it, e.g. “Savings” or “Trading”. A new address is generated for it.">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={40} autoFocus />
        </Field>
      </Modal>
      <Toasts toasts={toasts} />
    </div>
  );
}

const PRESETS: Record<string, string[]> = { ETH: ['0.1', '1', '5'], tBTC: ['0.1', '1', '5'] };
const presetsFor = (symbol: string) => PRESETS[symbol] ?? ['100', '1000', '10000'];

function WalletCard({ account, wallet, assets, notify }: { account: string; wallet: Wallet; assets: Asset[]; notify: (text: string, error?: boolean) => void }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'balance' | 'deposit' | null>(null);
  const symbols = assets.map((a) => a.symbol);
  const [asset, setAsset] = useState('tUSD');
  const [amount, setAmount] = useState('100');
  const [recipient, setRecipient] = useState('');

  const history = useQuery({ queryKey: ['history', account, wallet.address], queryFn: () => api.history(account, wallet.address), refetchInterval: 4000 });

  // A toast when a withdrawal from the app arrives while the page is open.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!history.data) return;
    if (seen.current === null) {
      seen.current = new Set(history.data.map((t) => t.txHash));
      return;
    }
    for (const transfer of history.data) {
      if (seen.current.has(transfer.txHash)) continue;
      seen.current.add(transfer.txHash);
      if (transfer.kind === 'Withdrawal') {
        notify(`"${wallet.label}" received ${formatAmount(transfer.amount)} ${transfer.asset} from ${transfer.fromUsername ? `@${transfer.fromUsername}` : shorten(transfer.from)}.`);
      }
    }
  }, [history.data, notify, wallet.label]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['wallets', account] });
    queryClient.invalidateQueries({ queryKey: ['history', account, wallet.address] });
  };
  const open = (kind: 'balance' | 'deposit') => {
    const first = kind === 'deposit' ? (symbols.find((s) => s !== 'ETH' && BigInt(wallet.balances[s] ?? '0') > 0n) ?? asset) : asset;
    setAsset(first);
    setAmount(kind === 'balance' ? presetsFor(first)[0] : '');
    setDialog(kind);
  };

  const addBalance = useMutation({
    mutationFn: () => api.addBalance(account, wallet.address, asset, amount),
    onSuccess: (transfer) => {
      notify(`Added ${formatAmount(transfer.amount)} ${transfer.asset} to "${wallet.label}".`);
      setDialog(null);
      refresh();
    },
    onError: (error) => notify(error.message, true),
  });
  const deposit = useMutation({
    mutationFn: () => api.deposit(account, wallet.address, recipient.trim(), asset, amount),
    onSuccess: (transfer) => {
      notify(`Deposited ${formatAmount(transfer.amount)} ${transfer.asset}. The user is notified in the app.`);
      setDialog(null);
      refresh();
    },
    onError: (error) => notify(error.message, true),
  });

  const validAmount = Number(amount) > 0;
  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-slate-900">{wallet.label}</h2>
          <Copyable value={wallet.address} full />
        </div>
        <WalletIcon className="size-5 shrink-0 text-emerald-600" />
      </header>

      <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
        {symbols.map((symbol) => (
          <div key={symbol} className="bg-white px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{symbol}</p>
            <p className="mt-0.5 truncate text-lg font-semibold text-slate-900 tabular-nums" title={formatAmount(wallet.balances[symbol], 18)}>
              {formatAmount(wallet.balances[symbol])}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-t border-slate-100 px-5 py-3">
        <Button onClick={() => open('balance')} className="flex-1">
          <Coins className="size-4" /> Add balance
        </Button>
        <Button variant="primary" onClick={() => open('deposit')} className="flex-1">
          <ArrowUpRight className="size-4" /> Deposit to ChainChat
        </Button>
      </div>

      <div className="border-t border-slate-100">
        <p className="px-5 pt-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">History</p>
        {history.data?.length ? (
          <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto px-5 py-1">
            {history.data.map((transfer) => (
              <HistoryRow key={transfer.txHash} transfer={transfer} wallet={wallet.address} />
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-slate-500">Nothing yet.</p>
        )}
      </div>

      <Modal
        open={dialog === 'balance'}
        title={`Add balance to “${wallet.label}”`}
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" disabled={!validAmount} loading={addBalance.isPending} onClick={() => addBalance.mutate()}>
              {addBalance.isPending ? 'Waiting for the transaction…' : `Add ${asset}`}
            </Button>
          </>
        }>
        <Field label="Asset" hint="Test tokens are minted to the wallet; test ETH is sent from the funder wallet. Both are real transactions on the local chain.">
          <Choices
            options={symbols}
            value={asset}
            onChange={(next) => {
              setAsset(next);
              setAmount(presetsFor(next)[0]);
            }}
          />
        </Field>
        <Field label="Amount">
          <Input type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <span className="flex gap-2 pt-1">
            {presetsFor(asset).map((preset) => (
              <button key={preset} type="button" onClick={() => setAmount(preset)} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">
                {preset}
              </button>
            ))}
          </span>
        </Field>
      </Modal>

      <Modal
        open={dialog === 'deposit'}
        title={`Deposit from “${wallet.label}”`}
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" disabled={!validAmount || !recipient.trim()} loading={deposit.isPending} onClick={() => deposit.mutate()}>
              {deposit.isPending ? 'Waiting for the transaction…' : 'Deposit'}
            </Button>
          </>
        }>
        <Field label="To ChainChat user" hint="A username (like bob) or a wallet address. The transfer goes straight to their wallet on the chain.">
          <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="username or 0x…" spellCheck={false} autoFocus />
        </Field>
        <Field label="Asset">
          <Choices options={symbols} value={asset} onChange={setAsset} detail={(symbol) => `${formatAmount(wallet.balances[symbol])} available`} />
        </Field>
        <Field label="Amount">
          <div className="flex gap-2">
            <Input type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.0" />
            <Button onClick={() => setAmount(toUnits(wallet.balances[asset] ?? '0'))} disabled={asset === 'ETH'} title={asset === 'ETH' ? 'ETH must keep a little for gas' : undefined}>
              Max
            </Button>
          </div>
        </Field>
      </Modal>
    </section>
  );
}

function HistoryRow({ transfer, wallet }: { transfer: Transfer; wallet: string }) {
  const incoming = transfer.to.toLowerCase() === wallet.toLowerCase();
  const other = incoming ? transfer.from : transfer.to;
  const otherName = incoming ? transfer.fromUsername : transfer.toUsername;
  const label =
    transfer.kind === 'Funding'
      ? 'Balance added'
      : transfer.kind === 'Deposit'
        ? `Deposit to ${otherName ? `@${otherName}` : shorten(other)}`
        : `Withdrawal from ${otherName ? `@${otherName}` : shorten(other)}`;

  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${incoming ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
        {incoming ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">
          {new Date(transfer.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · <Copyable value={transfer.txHash} />
        </span>
      </span>
      <span className={`shrink-0 font-medium tabular-nums ${incoming ? 'text-emerald-700' : 'text-slate-900'}`}>
        {incoming ? '+' : '−'}
        {formatAmount(transfer.amount)} {transfer.asset}
      </span>
    </li>
  );
}
