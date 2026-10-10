import { Check, Copy, Loader2, X } from 'lucide-react';
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-emerald-300',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
};

export function Button({ variant = 'secondary', loading, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={cx('inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed', VARIANTS[variant], className)}>
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
        'h-10 w-full rounded-lg border-0 bg-white px-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none',
        className,
      )}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

/** A row of choices where one is selected (assets). */
export function Choices<T extends string>({ options, value, onChange, detail }: { options: T[]; value: T; onChange: (value: T) => void; detail?: (option: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cx(
            'rounded-lg px-3 py-1.5 text-left text-sm font-medium ring-1 ring-inset',
            option === value ? 'bg-emerald-50 text-emerald-800 ring-emerald-400' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50',
          )}>
          {option}
          {detail && <span className="block text-xs font-normal text-slate-500">{detail(option)}</span>}
        </button>
      ))}
    </div>
  );
}

/** An address or hash, shortened, with copy-on-click. */
export function Copyable({ value, full }: { value: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button type="button" onClick={copy} title={`${value} (click to copy)`} className="group inline-flex max-w-full items-center gap-1.5 font-mono text-xs text-slate-600 hover:text-emerald-700">
      <span className={full ? 'break-all text-left' : 'truncate'}>{full ? value : `${value.slice(0, 8)}…${value.slice(-6)}`}</span>
      {copied ? <Check className="size-3.5 shrink-0 text-emerald-600" /> : <Copy className="size-3.5 shrink-0 opacity-50 group-hover:opacity-100" />}
    </button>
  );
}

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
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
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

export interface Toast {
  id: number;
  text: string;
  error: boolean;
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} role="status" className={cx('rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg', toast.error ? 'bg-red-600' : 'bg-slate-900')}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}
