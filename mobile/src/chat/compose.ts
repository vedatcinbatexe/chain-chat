import type { Address, Hex } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';

import { directConversationId, encrypt, messageHash, type MessageHeader } from '@/crypto';
import type { ChainHead } from './chainHead';

/** What the app sends to ChatHub.SendMessage (backend SendMessageCommand). */
export interface SendMessageCommand {
  conversationId: Hex;
  recipient: Address;
  seq: string;
  prevHash: Hex;
  ciphertext: Hex;
  clientTimestamp: string;
  signature: Hex;
}

export interface ComposeInput {
  account: PrivateKeyAccount;
  encryptionSecretKey: Hex;
  peer: { address: Address; encryptionKey: Hex };
  head: ChainHead;
  text: string;
  now?: number;
}

/**
 * Builds a signed, encrypted, hash-chained message (SDD §6.3):
 * encrypt for the peer → header linked to the previous message → messageHash → EIP-191 signature.
 */
export async function composeMessage({ account, encryptionSecretKey, peer, head, text, now = Date.now() }: ComposeInput) {
  const header: MessageHeader = {
    conversationId: directConversationId(account.address, peer.address),
    sender: account.address,
    seq: head.seq + 1n,
    prevHash: head.messageHash,
    ciphertext: encrypt(text, peer.encryptionKey, encryptionSecretKey),
    clientTimestamp: BigInt(now),
  };
  const hash = messageHash(header);
  const signature = await account.signMessage({ message: { raw: hash } });

  const command: SendMessageCommand = {
    conversationId: header.conversationId,
    recipient: peer.address,
    seq: header.seq.toString(),
    prevHash: header.prevHash,
    ciphertext: header.ciphertext,
    clientTimestamp: header.clientTimestamp.toString(),
    signature,
  };
  return { command, messageHash: hash, nextHead: { seq: header.seq, messageHash: hash } satisfies ChainHead };
}
