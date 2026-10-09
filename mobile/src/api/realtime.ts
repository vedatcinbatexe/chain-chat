import { HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr';

import { ensureSession } from '@/auth/session';
import { env } from '@/config/env';

/**
 * Creates a SignalR connection to a backend hub (e.g. '/hubs/chat' in Phase 7).
 * Signs in on demand; the JWT is fetched on every (re)connect, and dropped connections retry with backoff.
 * WebSockets were confirmed to work from Expo Go in the Phase 1.2 spike.
 */
export function createHubConnection(hubPath: string): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(`${env.apiUrl}${hubPath}`, {
      accessTokenFactory: async () => (await ensureSession()).token,
    })
    .withAutomaticReconnect([0, 2_000, 5_000, 10_000, 30_000])
    .configureLogging(LogLevel.Warning)
    .build();
}
