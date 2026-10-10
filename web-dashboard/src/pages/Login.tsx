import { MessageSquareLock, Wallet, Wrench } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui';
import { devLoginEnabled, hasInjectedWallet, signInWithDevAccount, signInWithWallet } from '@/lib/auth';

export function LoginPage() {
  const [pending, setPending] = useState<'wallet' | 'dev' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (kind: 'wallet' | 'dev', signIn: () => Promise<void>) => async () => {
    setPending(kind);
    setError(null);
    try {
      await signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <span className="flex size-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <MessageSquareLock className="size-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-slate-900">ChainChat Admin</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in with an admin wallet. You sign a short text to prove you own it — no password, no transaction.</p>

        <div className="mt-6 space-y-3">
          <Button variant="primary" className="h-10 w-full" loading={pending === 'wallet'} disabled={pending !== null} onClick={run('wallet', signInWithWallet)}>
            <Wallet className="size-4" /> Sign in with browser wallet
          </Button>
          {!hasInjectedWallet() && <p className="text-xs text-slate-500">No browser wallet detected (e.g. MetaMask).</p>}

          {devLoginEnabled && (
            <>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" /> local development <span className="h-px flex-1 bg-slate-200" />
              </div>
              <Button className="h-10 w-full" loading={pending === 'dev'} disabled={pending !== null} onClick={run('dev', signInWithDevAccount)}>
                <Wrench className="size-4" /> Use the local dev account
              </Button>
              <p className="text-xs text-slate-500">Signs in as Anvil account #0, the root admin of the local environment. Only works on the local chain.</p>
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
