import type { Href } from 'expo-router';
import { create } from 'zustand';

export type NotificationKind = 'message' | 'payment' | 'funds' | 'badge' | 'group' | 'account' | 'announcement';

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Milliseconds since the epoch. */
  createdAt: number;
  /** Where tapping the notification leads, if anywhere. */
  route?: Href;
}

/** How many notifications the inbox keeps (in memory, for this session). */
const HISTORY_LIMIT = 50;

interface NotificationState {
  /** The banner on screen right now. */
  current: AppNotification | null;
  /** Newest first. */
  history: AppNotification[];
  unread: number;
  /** The conversation the user is looking at: its messages need no banner. */
  activeConversationId: string | null;

  push: (notification: Omit<AppNotification, 'id' | 'createdAt'> & { createdAt?: number }) => void;
  dismiss: () => void;
  markAllRead: () => void;
  clear: () => void;
  setActiveConversation: (conversationId: string | null) => void;
}

let nextId = 1;

/**
 * In-app notifications (SDD §9): banners shown while the app is open, plus an inbox of the recent ones. Nothing
 * is stored on the phone or the server; closed apps are not notified (that would need a push service).
 */
export const useNotificationStore = create<NotificationState>()((set) => ({
  current: null,
  history: [],
  unread: 0,
  activeConversationId: null,

  push: (notification) =>
    set((state) => {
      const entry: AppNotification = { ...notification, id: nextId++, createdAt: notification.createdAt ?? Date.now() };
      return { current: entry, history: [entry, ...state.history].slice(0, HISTORY_LIMIT), unread: state.unread + 1 };
    }),
  dismiss: () => set({ current: null }),
  markAllRead: () => set({ unread: 0 }),
  clear: () => set({ current: null, history: [], unread: 0 }),
  setActiveConversation: (activeConversationId) => set({ activeConversationId }),
}));

export const notify = (notification: Parameters<NotificationState['push']>[0]) => useNotificationStore.getState().push(notification);
