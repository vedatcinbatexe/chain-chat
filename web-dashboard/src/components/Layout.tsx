import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Award, LayoutDashboard, Megaphone, LogOut, MessageSquareLock, MessagesSquare, ScrollText, Settings, ShieldCheck, Users, UsersRound } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

import { api } from '@/lib/api';
import { shorten } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Me } from '@/lib/types';

import { Badge, Toasts } from './ui';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/groups', label: 'Groups', icon: UsersRound },
  { to: '/badges', label: 'Badges', icon: Award },
  { to: '/messages', label: 'Messages', icon: MessagesSquare },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/admins', label: 'Admins', icon: ShieldCheck },
  { to: '/audit', label: 'Audit log', icon: ScrollText },
  { to: '/system', label: 'System', icon: Settings },
];

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me'), staleTime: 60_000 });

export function Layout() {
  const signOut = useSession((state) => state.signOut);
  const me = useMe();

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col bg-slate-900 text-slate-300 lg:sticky lg:top-0 lg:h-screen lg:w-60">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-500 text-white">
            <MessageSquareLock className="size-4.5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">ChainChat</p>
            <p className="text-xs text-slate-400">Admin dashboard</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'}`
              }>
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden border-t border-slate-800 p-4 lg:block">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{me.data?.username ? `@${me.data.username}` : 'Admin'}</p>
              <p className="font-mono text-xs text-slate-400">{me.data ? shorten(me.data.address) : '…'}</p>
            </div>
            {me.data?.isRoot && <Badge tone="indigo">Root</Badge>}
          </div>
          <button type="button" onClick={signOut} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="flex items-center justify-end border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
          <button type="button" onClick={signOut} className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </div>
      </main>
      <Toasts />
    </div>
  );
}
