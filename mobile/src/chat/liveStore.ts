import { useEffect, useState } from 'react';
import { create } from 'zustand';

/** A typing indicator disappears after this long without a refresh, in case "stopped typing" is lost. */
const TYPING_TTL_MS = 6_000;

interface LiveState {
  /** conversationId → address → time the indicator expires. */
  typing: Record<string, Record<string, number>>;
  /** Lowercase addresses that are online right now. */
  online: Record<string, true>;
  setTyping: (conversationId: string, address: string, isTyping: boolean) => void;
  setOnline: (address: string, online: boolean) => void;
  setOnlineMany: (addresses: string[]) => void;
}

/** Real-time, in-memory state from the hub: who is typing where, and who is online. */
export const useLiveStore = create<LiveState>()((set) => ({
  typing: {},
  online: {},
  setTyping: (conversationId, address, isTyping) =>
    set((state) => {
      const id = conversationId.toLowerCase();
      const forConversation = { ...state.typing[id] };
      if (isTyping) forConversation[address.toLowerCase()] = Date.now() + TYPING_TTL_MS;
      else delete forConversation[address.toLowerCase()];
      return { typing: { ...state.typing, [id]: forConversation } };
    }),
  setOnline: (address, online) =>
    set((state) => {
      const next = { ...state.online };
      if (online) next[address.toLowerCase()] = true;
      else delete next[address.toLowerCase()];
      return { online: next };
    }),
  setOnlineMany: (addresses) =>
    set((state) => ({ online: { ...state.online, ...Object.fromEntries(addresses.map((a) => [a.toLowerCase(), true as const])) } })),
}));

export const useIsOnline = (address: string | undefined) => useLiveStore((state) => (address ? !!state.online[address.toLowerCase()] : false));

/** Addresses currently typing in a conversation (expired indicators are dropped automatically). */
export function useTypingAddresses(conversationId: string): string[] {
  const typing = useLiveStore((state) => state.typing[conversationId.toLowerCase()]);
  const [now, setNow] = useState(Date.now);

  const active = Object.entries(typing ?? {}).filter(([, expiresAt]) => expiresAt > now);

  // Re-render when the next indicator expires.
  useEffect(() => {
    if (active.length === 0) return;
    const nextExpiry = Math.min(...active.map(([, expiresAt]) => expiresAt));
    const timer = setTimeout(() => setNow(Date.now()), Math.max(nextExpiry - Date.now(), 0) + 50);
    return () => clearTimeout(timer);
  }, [active]);

  return active.map(([address]) => address);
}

/** "bob is typing…", "alice and bob are typing…", "3 people are typing…". */
export function describeTyping(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}
