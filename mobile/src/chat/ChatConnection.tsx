import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { startChatConnection, stopChatConnection } from './connection';

/** Delays between attempts when the first connection fails (SignalR only auto-reconnects after a successful start). */
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000];

/**
 * Keeps the real-time chat connection open while the user is in the app: connects on mount (retrying with
 * backoff if the server is unreachable), reconnects when the app returns to the foreground, disconnects on
 * sign-out. Renders nothing.
 */
export function ChatConnection() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let active = true;

    const connect = () => {
      clearTimeout(retryTimer);
      startChatConnection(queryClient)
        .then(() => {
          attempt = 0;
        })
        .catch((error) => {
          if (!active) return;
          const delay = RETRY_DELAYS_MS[Math.min(attempt++, RETRY_DELAYS_MS.length - 1)];
          console.warn(`Chat connection failed, retrying in ${delay / 1000}s`, error);
          retryTimer = setTimeout(connect, delay);
        });
    };
    connect();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        attempt = 0;
        connect();
        // Catch up on anything that arrived while the app was in the background.
        queryClient.invalidateQueries({ queryKey: ['messages'] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    });

    return () => {
      active = false;
      clearTimeout(retryTimer);
      subscription.remove();
      stopChatConnection();
    };
  }, [queryClient]);

  return null;
}
