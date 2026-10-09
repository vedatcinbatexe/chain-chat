import { create } from 'zustand';

export interface Session {
  /** JWT from Sign-In with Ethereum. Kept in memory only — signing in again is cheap and needs no password. */
  token: string;
  expiresAt: number;
  address: string;
}

interface SessionState {
  session: Session | null;
  setSession: (session: Session | null) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  session: null,
  setSession: (session) => set({ session }),
}));
