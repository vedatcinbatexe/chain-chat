import { bytesToHex, hexToBytes, keccak256, toHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { MessageDto } from '@/api/conversations';
import { generateEncryptionKeyPair } from '@/crypto';
import { GENESIS, type ChainHead } from '../chainHead';
import { composeMessage } from '../compose';
import { verifyMessages } from '../verify';

// Anvil's public development keys #0 and #1.
const alice = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const bob = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const aliceKeys = generateEncryptionKeyPair();
const bobKeys = generateEncryptionKeyPair();

let nextId = 1;

/** Simulates a conversation the way the server would store it. */
async function conversation(...turns: ['alice' | 'bob', string][]): Promise<MessageDto[]> {
  const heads: Record<'alice' | 'bob', ChainHead> = { alice: GENESIS, bob: GENESIS };
  const messages: MessageDto[] = [];
  for (const [who, text] of turns) {
    const [account, keys, peer] =
      who === 'alice'
        ? [alice, aliceKeys, { address: bob.address, encryptionKey: bobKeys.publicKey }]
        : [bob, bobKeys, { address: alice.address, encryptionKey: aliceKeys.publicKey }];
    const { command, messageHash, nextHead } = await composeMessage({ account, encryptionSecretKey: keys.secretKey, peer, head: heads[who], text, now: 1767225600000 + messages.length });
    heads[who] = nextHead;
    messages.push({ ...command, id: nextId++, sender: account.address, messageHash, serverReceivedAt: new Date().toISOString() });
  }
  return messages;
}

const asBob = (messages: MessageDto[]) => verifyMessages(messages, bob.address, aliceKeys.publicKey, bobKeys.secretKey);

describe('compose + verify', () => {
  it('both sides read and verify the whole conversation', async () => {
    const messages = await conversation(['alice', 'Hi Bob!'], ['bob', 'Hi Alice 👋'], ['alice', 'Ready for the midterm?']);

    const forBob = await asBob(messages);
    expect(forBob.map((m) => m.text)).toEqual(['Hi Bob!', 'Hi Alice 👋', 'Ready for the midterm?']);
    expect(forBob.map((m) => m.mine)).toEqual([false, true, false]);
    expect(forBob.every((m) => m.signatureValid && m.chainIntact)).toBe(true);

    // Alice can read her own sent messages too: NaCl box uses one shared key for both directions.
    const forAlice = await verifyMessages(messages, alice.address, bobKeys.publicKey, aliceKeys.secretKey);
    expect(forAlice.map((m) => m.text)).toEqual(['Hi Bob!', 'Hi Alice 👋', 'Ready for the midterm?']);
  });

  it('links each message to the sender’s previous one', async () => {
    const [first, , third] = await conversation(['alice', 'one'], ['bob', 'two'], ['alice', 'three']);
    expect(first.seq).toBe('1');
    expect(third.seq).toBe('2');
    expect(third.prevHash).toBe(first.messageHash);
  });

  it('detects a ciphertext changed by the server', async () => {
    const messages = await conversation(['alice', 'Pay me back 10 CHAT']);
    const bytes = hexToBytes(messages[0].ciphertext);
    bytes[bytes.length - 1] ^= 1;
    const [tampered] = await asBob([{ ...messages[0], ciphertext: bytesToHex(bytes) }]);

    expect(tampered.signatureValid).toBe(false);
    expect(tampered.text).toBeNull();
  });

  it('does not trust the messageHash claimed by the server', async () => {
    const messages = await conversation(['alice', 'hello']);
    const [result] = await asBob([{ ...messages[0], messageHash: keccak256(toHex('fake')) as Hex }]);
    expect(result.signatureValid).toBe(false);
  });

  it('detects a message deleted by the server', async () => {
    const messages = await conversation(['alice', 'one'], ['alice', 'two'], ['alice', 'three']);
    const result = await asBob([messages[0], messages[2]]); // "two" withheld

    expect(result[0].chainIntact).toBe(true);
    expect(result[1].chainIntact).toBe(false);
    expect(result[1].signatureValid).toBe(true); // the message itself is genuine — only the gap is suspicious
  });

  it('detects a message attributed to the wrong sender', async () => {
    const messages = await conversation(['alice', 'hello']);
    const [result] = await asBob([{ ...messages[0], sender: bob.address }]);
    expect(result.signatureValid).toBe(false);
  });

  it('cannot be decrypted by a third party', async () => {
    const messages = await conversation(['alice', 'secret']);
    const mallory = generateEncryptionKeyPair();
    const [result] = await verifyMessages(messages, bob.address, aliceKeys.publicKey, mallory.secretKey);
    expect(result.text).toBeNull();
  });
});
