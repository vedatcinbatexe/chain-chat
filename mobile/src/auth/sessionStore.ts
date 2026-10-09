import { create } from 'zustand';

interface SessionState {
  /** JWT from Sign-In with Ethereum (Phase 5). Kept in memory only; null until signed in. */
  token: string | null;
  setToken: (token: string | null) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  token: null,
  setToken: (token) => set({ token }),
}));
