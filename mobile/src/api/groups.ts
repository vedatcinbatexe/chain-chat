import { useQuery } from '@tanstack/react-query';
import type { Address, Hex } from 'viem';

import { authedRequest } from './authed';

export interface GroupMember {
  address: Address;
  username: string | null;
  joinedAt: string;
}

/** Matches GroupInfo from the backend (members only). */
export interface GroupInfo {
  conversationId: Hex;
  name: string;
  createdBy: Address;
  createdAt: string;
  maxMembers: number;
  inviteCode: string;
  members: GroupMember[];
}

/** What an invite link leads to, before joining. */
export interface InvitePreview {
  conversationId: Hex;
  name: string;
  memberCount: number;
  maxMembers: number;
  createdByUsername: string | null;
  alreadyMember: boolean;
}

export const groupQueryKey = (id: string) => ['group', id.toLowerCase()] as const;

export const createGroup = (name: string) => authedRequest<GroupInfo>('/api/v1/groups', { method: 'POST', body: JSON.stringify({ name }) });

export const getInvitePreview = (code: string) => authedRequest<InvitePreview>(`/api/v1/groups/invites/${encodeURIComponent(code)}`);

export const joinGroup = (inviteCode: string) => authedRequest<GroupInfo>('/api/v1/groups/join', { method: 'POST', body: JSON.stringify({ inviteCode }) });

export const leaveGroup = (id: string) => authedRequest<void>(`/api/v1/groups/${id}/leave`, { method: 'POST' });

export function useGroup(id: string | undefined) {
  return useQuery({
    queryKey: groupQueryKey(id ?? ''),
    enabled: !!id,
    queryFn: () => authedRequest<GroupInfo>(`/api/v1/groups/${id}`),
  });
}

/** Accepts a full invite link (chainchat://join/CODE, exp://…/--/join/CODE) or just the code. */
export function parseInviteCode(input: string): string | null {
  const match = input.trim().match(/(?:join\/)?([A-Za-z0-9]{16,32})\/?$/);
  return match ? match[1] : null;
}
