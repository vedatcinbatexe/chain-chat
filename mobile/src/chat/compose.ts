import type { Address, Hex } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';

import { directConversationId, encrypt, encryptForGroup, messageHash, type GroupRecipient, type MessageHeader } from '@/crypto';
import type { ChainHead } from './chainHead';

/** What the app sends to ChatHub.SendMessage (backend SendMessageCommand). */
export interface SendMessageCommand {
  conversationId: Hex;
  /** The other participant of a 1:1 conversation; null for a group message. */
  recipient: Address | null;
  seq: string;
  prevHash: Hex;
  ciphertext: Hex;
  clientTimestamp: string;
  signature: Hex;
  /** For a payment message: the ChatToken transfer it claims. Not part of the signed hash — the server and the
   *  recipient check it against the chain, and it is also inside the encrypted, signed payload. */
  paymentTxHash?: Hex;
}

interface SignInput {
  account: PrivateKeyAccount;
  conversationId: Hex;
  recipient: Address | null;
  ciphertext: Hex;
  head: ChainHead;
  paymentTxHash?: Hex;
  now?: number;
}

/**
 * Wraps already-encrypted content into a signed, hash-chained message (SDD §6.3):
 * header linked to the sender's previous message → messageHash → EIP-191 signature. Same for 1:1 and groups.
 */
export async function signMessage({ account, conversationId, recipient, ciphertext, head, paymentTxHash, now = Date.now() }: SignInput) {
  const header: MessageHeader = {
    conversationId,
    sender: account.address,
    seq: head.seq + 1n,
    prevHash: head.messageHash,
    ciphertext,
    clientTimestamp: BigInt(now),
  };
  const hash = messageHash(header);
  const signature = await account.signMessage({ message: { raw: hash } });

  const command: SendMessageCommand = {
    conversationId: header.conversationId,
    recipient,
    seq: header.seq.toString(),
    prevHash: header.prevHash,
    ciphertext: header.ciphertext,
    clientTimestamp: header.clientTimestamp.toString(),
    signature,
    ...(paymentTxHash ? { paymentTxHash } : {}),
  };
  return { command, messageHash: hash, nextHead: { seq: header.seq, messageHash: hash } satisfies ChainHead };
}

export interface ComposeInput {
  account: PrivateKeyAccount;
  encryptionSecretKey: Hex;
  peer: { address: Address; encryptionKey: Hex };
  head: ChainHead;
  text: string;
  paymentTxHash?: Hex;
  now?: number;
}

/** A 1:1 message: encrypted for the peer's on-chain key, then signed and chained. */
export function composeMessage({ account, encryptionSecretKey, peer, head, text, paymentTxHash, now }: ComposeInput) {
  return signMessage({
    account,
    conversationId: directConversationId(account.address, peer.address),
    recipient: peer.address,
    ciphertext: encrypt(text, peer.encryptionKey, encryptionSecretKey),
    head,
    paymentTxHash,
    now,
  });
}

export interface ComposeGroupInput {
  account: PrivateKeyAccount;
  encryptionSecretKey: Hex;
  groupId: Hex;
  /** Every member including the sender, with keys read from the Registry contract. */
  members: GroupRecipient[];
  head: ChainHead;
  text: string;
  now?: number;
}

/** A group message: encrypted once and the key wrapped for each member (SDD §6.5), then signed and chained. */
export function composeGroupMessage({ account, encryptionSecretKey, groupId, members, head, text, now }: ComposeGroupInput) {
  return signMessage({
    account,
    conversationId: groupId,
    recipient: null,
    ciphertext: encryptForGroup(text, members, encryptionSecretKey),
    head,
    now,
  });
}
