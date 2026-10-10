import { create } from 'zustand';

export interface Session {
  /** JWT from Sign-In with Ethereum. Kept in memory only — signing in again is cheap and needs no password. */
  token: string;
  expiresAt: number;
  address: string;
}

interface SessionState {
  session: Session | null;
  /** The server refused this wallet because an administrator blocked it. */
  banned: boolean;
  setSession: (session: Session | null) => void;
  setBanned: (banned: boolean) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  session: null,
  banned: false,
  // A new or cleared session starts clean: another wallet on this phone is not blocked.
  setSession: (session) => set({ session, banned: false }),
  setBanned: (banned) => set({ banned }),
}));
