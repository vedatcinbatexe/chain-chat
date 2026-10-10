import { create } from 'zustand';

interface Session {
  token: string;
  address: string;
  expiresAt: string;
}

const STORAGE_KEY = 'chainchat-admin-session';

function load(): Session | null {
  try {
    const session = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as Session | null;
    return session && new Date(session.expiresAt).getTime() > Date.now() ? session : null;
  } catch {
    return null;
  }
}

/** The signed-in admin. Kept in sessionStorage, so it ends when the tab is closed (tokens last one hour). */
export const useSession = create<{ session: Session | null; signIn: (session: Session) => void; signOut: () => void }>()((set) => ({
  session: load(),
  signIn: (session) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    set({ session });
  },
  signOut: () => {
    sessionStorage.removeItem(STORAGE_KEY);
    set({ session: null });
  },
}));
