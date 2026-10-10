/** Shapes returned by /api/v1/admin (AdminEndpoints.cs). Token amounts are wei as decimal strings. */

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Me {
  address: string;
  username: string | null;
  isRoot: boolean;
}

export interface Overview {
  users: number;
  onlineNow: number;
  bannedUsers: number;
  groups: number;
  directConversations: number;
  messages: number;
  messagesLast24h: number;
  unanchoredMessages: number;
  anchorBatches: number;
  payments: number;
  paymentVolume: string;
  blockNumber: number | null;
  messagesPerDay: { date: string; count: number }[];
}

export interface UserRow {
  address: string;
  username: string;
  registeredAt: string;
  registeredAtBlock: number;
  messages: number;
  banned: boolean;
  online: boolean;
}

export interface UserDetail {
  address: string;
  username: string | null;
  registered: boolean;
  encryptionPublicKey: string | null;
  registeredAt: string | null;
  registeredAtBlock: number | null;
  registrationTxHash: string | null;
  online: boolean;
  isAdmin: boolean;
  ban: { reason: string | null; bannedBy: string; bannedAt: string } | null;
  balances: { eth: string; chat: string | null; badges: number | null } | null;
  messages: number;
  conversations: number;
  paymentsSent: number;
  paymentsReceived: number;
  /** Badges the wallet holds, by type (read from the chain). */
  badges: { id: number; name: string; count: number }[];
  groups: { id: string; name: string; joinedAt: string }[];
}

export interface BadgeTypes {
  /** The ClassBadge contract, or null when it is not deployed. */
  contract: string | null;
  /** `groups`: how many groups require this badge. */
  types: { id: number; name: string; groups: number }[];
}

export interface GroupRow {
  id: string;
  name: string;
  createdBy: string;
  creatorUsername: string | null;
  createdAt: string;
  maxMembers: number;
  requiresBadge: boolean;
  requiredBadgeTypes: number[];
  members: number;
  messages: number;
}

export interface GroupDetail {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  maxMembers: number;
  inviteCode: string;
  /** NFT-gated group: the ERC-721 contract whose badge members must hold. */
  requiredBadgeContract: string | null;
  requiredBadges: { id: number; name: string }[];
  messages: number;
  members: { address: string; username: string | null; joinedAt: string; online: boolean }[];
}

export interface MessageRow {
  id: number;
  conversationId: string;
  conversationType: 'Direct' | 'Group';
  groupName: string | null;
  sender: string;
  senderUsername: string | null;
  seq: string;
  type: 'Text' | 'Payment';
  sizeBytes: number;
  messageHash: string;
  receivedAt: string;
  paymentTxHash: string | null;
  anchor: 'NotAnchored' | 'Pending' | 'Anchored';
  reactions: number;
}

export interface PaymentRow {
  txHash: string;
  from: string;
  fromUsername: string | null;
  to: string;
  toUsername: string | null;
  amount: string | null;
  status: 'Pending' | 'Confirmed' | 'Failed';
  failureReason: string | null;
  blockNumber: number | null;
  createdAt: string;
}

export interface DripRow {
  address: string;
  username: string | null;
  txHash: string;
  amount: string;
  createdAt: string;
}

export interface AnchorRow {
  id: number;
  chainBatchId: number | null;
  root: string;
  fromMessageId: number;
  toMessageId: number;
  leafCount: number;
  status: 'Pending' | 'Submitted' | 'Confirmed' | 'Failed';
  txHash: string | null;
  blockNumber: number | null;
  createdAt: string;
  anchoredAt: string | null;
}

export type Asset = 'ETH' | 'CHAT';

export interface FundingRow {
  id: number;
  address: string;
  username: string | null;
  /** BADGE: one ClassBadge (ERC-721) was minted; the amount is 1. */
  asset: Asset | 'BADGE';
  amount: string;
  txHash: string;
  admin: string;
  createdAt: string;
}

export interface AdminRow {
  address: string;
  username: string | null;
  isRoot: boolean;
  note: string | null;
  addedBy: string | null;
  addedAt: string | null;
}

export interface AnnouncementRow {
  id: number;
  title: string;
  body: string;
  admin: string;
  /** How many wallets were connected when it was sent. */
  onlineRecipients: number;
  createdAt: string;
}

export interface AuditRow {
  id: number;
  admin: string;
  adminUsername: string | null;
  action: string;
  target: string | null;
  details: string | null;
  createdAt: string;
}

export interface RuntimeSettings {
  messagingPaused: boolean;
  groupCreationEnabled: boolean;
  groupMaxMembers: number;
  gasDripEnabled: boolean;
}

export interface SystemInfo {
  chain: { network: string; chainId: number; rpcUrls: string[]; blockNumber: number | null };
  contracts: { name: string; address: string; deployBlock: number }[];
  indexer: { contract: string; lastProcessedBlock: number; updatedAt: string; behind: number | null }[];
  funder: { enabled: boolean; address: string | null; eth: string | null; chat: string | null; maxFundEth: number; maxFundChat: number };
  settings: RuntimeSettings;
  configuration: Record<string, Record<string, string | number | boolean>>;
}
