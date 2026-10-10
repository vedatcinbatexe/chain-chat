import { useQuery } from '@tanstack/react-query';
import type { Address, Hex } from 'viem';

import { authedRequest } from './authed';

export interface RequiredBadge {
  id: number;
  name: string;
  /** Only in invite previews. */
  held?: boolean | null;
}

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
  /** NFT-gated group: the ERC-721 contract whose badges members must hold (SDD §6.5). */
  requiredBadgeContract: Address | null;
  /** The badge types every member must hold; empty for an open group. */
  requiredBadges: RequiredBadge[];
}

/** What an invite link leads to, before joining. */
export interface InvitePreview {
  conversationId: Hex;
  name: string;
  memberCount: number;
  maxMembers: number;
  createdByUsername: string | null;
  alreadyMember: boolean;
  requiredBadgeContract: Address | null;
  /** For gated groups: each required badge type, with the server's reading of whether this wallet holds it. */
  requiredBadges: RequiredBadge[];
}

export const groupQueryKey = (id: string) => ['group', id.toLowerCase()] as const;

/** `requiredBadgeTypes`: badge type ids every member must hold (NFT-gated group); empty for an open group. */
export const createGroup = (name: string, requiredBadgeTypes: number[] = []) =>
  authedRequest<GroupInfo>('/api/v1/groups', { method: 'POST', body: JSON.stringify({ name, requiredBadgeTypes }) });

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
