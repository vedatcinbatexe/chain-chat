import { Check, ChevronLeft, ChevronRight, Copy, Loader2, X } from 'lucide-react';
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { create } from 'zustand';

import { ApiError } from '@/lib/api';
import { shorten } from '@/lib/format';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

// ---- Buttons and inputs ----

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-white text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50 disabled:text-red-300',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
};

export function Button({
  variant = 'secondary',
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed',
        VARIANTS[variant],
        className,
      )}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'h-9 w-full rounded-lg border-0 bg-white px-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none',
        className,
      )}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-indigo-600' : 'bg-slate-300')}>
      <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
    </button>
  );
}

// ---- Layout pieces ----

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

type Tone = 'gray' | 'green' | 'red' | 'amber' | 'indigo';
const TONES: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-600',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  indigo: 'bg-indigo-50 text-indigo-700',
};

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone])}>{children}</span>;
}

export function Notice({ tone = 'indigo', children }: { tone?: 'indigo' | 'amber' | 'red'; children: ReactNode }) {
  const styles = { indigo: 'bg-indigo-50 text-indigo-800 ring-indigo-100', amber: 'bg-amber-50 text-amber-800 ring-amber-100', red: 'bg-red-50 text-red-800 ring-red-100' };
  return <div className={cx('mb-4 rounded-lg px-4 py-3 text-sm ring-1', styles[tone])}>{children}</div>;
}

// ---- Values ----

/** A hash or address, shortened, with copy-on-click. */
export function Mono({ value, head = 6, tail = 4, full }: { value: string | null | undefined; head?: number; tail?: number; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-slate-400">—</span>;
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button type="button" onClick={copy} title={`${value} (click to copy)`} className="group inline-flex max-w-full items-center gap-1 font-mono text-xs text-slate-600 hover:text-indigo-600">
      <span className={full ? 'break-all text-left' : 'truncate'}>{full ? value : shorten(value, head, tail)}</span>
      {copied ? <Check className="size-3 shrink-0 text-emerald-600" /> : <Copy className="size-3 shrink-0 opacity-0 group-hover:opacity-100" />}
    </button>
  );
}

const AVATAR_COLORS = ['bg-indigo-500', 'bg-cyan-600', 'bg-emerald-600', 'bg-orange-500', 'bg-fuchsia-600', 'bg-rose-600', 'bg-sky-600', 'bg-violet-600'];

/** A user as "avatar · @name · 0x1234…abcd", linking to their page. */
export function UserCell({ address, username, online }: { address: string; username?: string | null; online?: boolean }) {
  const color = AVATAR_COLORS[parseInt(address.slice(-2), 16) % AVATAR_COLORS.length];
  return (
    <Link to={`/users/${address}`} className="group flex min-w-0 items-center gap-3">
      <span className={cx('relative flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white', color)}>
        {(username ?? address.slice(2)).slice(0, 2).toUpperCase()}
        {online && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-900 group-hover:text-indigo-600">{username ? `@${username}` : 'Not registered'}</span>
        <span className="block font-mono text-xs whitespace-nowrap text-slate-500">{shorten(address)}</span>
      </span>
    </Link>
  );
}

// ---- Tables ----

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'right';
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  empty = 'Nothing here yet.',
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: Error | null;
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/60">
            {columns.map((column) => (
              <th key={column.header} className={cx('px-5 py-2.5 text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase', column.align === 'right' && 'text-right')}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows?.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-slate-50/60">
              {columns.map((column) => (
                <td key={column.header} className={cx('px-5 py-3 align-middle text-slate-700', column.align === 'right' && 'text-right whitespace-nowrap tabular-nums', column.className)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {error ? (
        <p className="px-5 py-10 text-center text-sm text-red-600">{error.message}</p>
      ) : loading && !rows ? (
        <p className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      ) : rows?.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">{empty}</p>
      ) : null}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString('en-US')}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// ---- Dialogs ----

export function Modal({ title, open, onClose, children, footer }: { title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-xl bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="size-4" />
          </button>
        </header>
        <div className="space-y-4 px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3.5">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }>
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  );
}

// ---- Toasts ----

interface Toast {
  id: number;
  text: string;
  error: boolean;
}

const useToasts = create<{ toasts: Toast[] }>()(() => ({ toasts: [] }));
let nextToast = 1;

export function toast(text: string, error = false) {
  const id = nextToast++;
  useToasts.setState((state) => ({ toasts: [...state.toasts, { id, text, error }] }));
  setTimeout(() => useToasts.setState((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), error ? 6000 : 3500);
}

export const toastError = (error: unknown) => toast(error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong.', true);

export function Toasts() {
  const toasts = useToasts((state) => state.toasts);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} role="status" className={cx('rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg', t.error ? 'bg-red-600' : 'bg-slate-900')}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
