import { hexToString, size, stringToHex, type Address } from 'viem';

import { generateEncryptionKeyPair } from '../encryption';
import { decryptGroupMessage, encryptForGroup } from '../groupEncryption';

const member = (address: Address) => ({ address, keys: generateEncryptionKeyPair() });
const alice = member('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
const bob = member('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
const carol = member('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
const mallory = member('0x90F79bf6EB2c4f870365E785982E1f101E93b906');

const recipients = [alice, bob, carol].map((m) => ({ address: m.address, encryptionKey: m.keys.publicKey }));
const text = 'Group study at 19:00 in the library 📚';

describe('group encryption', () => {
  const ciphertext = encryptForGroup(text, recipients, alice.keys.secretKey);

  it('every member — including the sender — can read the message', () => {
    for (const m of [alice, bob, carol]) {
      expect(decryptGroupMessage(ciphertext, m.address, alice.keys.publicKey, m.keys.secretKey)).toBe(text);
    }
  });

  it('a non-member cannot read it', () => {
    expect(decryptGroupMessage(ciphertext, mallory.address, alice.keys.publicKey, mallory.keys.secretKey)).toBeNull();
  });

  it('a member cannot use someone else’s key wrapper', () => {
    // Mallory copies Bob's entry into her own slot: it is encrypted to Bob's key, so it does not open.
    const envelope = JSON.parse(hexToString(ciphertext));
    envelope.k[mallory.address.toLowerCase()] = envelope.k[bob.address.toLowerCase()];
    expect(decryptGroupMessage(stringToHex(JSON.stringify(envelope)), mallory.address, alice.keys.publicKey, mallory.keys.secretKey)).toBeNull();
  });

  it('detects a message not encrypted by the claimed sender', () => {
    expect(decryptGroupMessage(ciphertext, bob.address, carol.keys.publicKey, bob.keys.secretKey)).toBeNull();
  });

  it('detects tampered content', () => {
    const envelope = JSON.parse(hexToString(ciphertext));
    envelope.c = `${envelope.c.slice(0, -2)}${envelope.c.slice(-2) === '00' ? '01' : '00'}`;
    expect(decryptGroupMessage(stringToHex(JSON.stringify(envelope)), bob.address, alice.keys.publicKey, bob.keys.secretKey)).toBeNull();
  });

  it('rejects input that is not a group envelope', () => {
    expect(decryptGroupMessage(stringToHex('hello'), bob.address, alice.keys.publicKey, bob.keys.secretKey)).toBeNull();
  });

  it('stays small: the text once plus one ~72-byte wrapper per member', () => {
    const twenty = Array.from({ length: 20 }, () => ({ address: alice.address, encryptionKey: generateEncryptionKeyPair().publicKey }))
      .map((r, i) => ({ ...r, address: `0x${(i + 1).toString(16).padStart(40, '0')}` as Address }));
    expect(size(encryptForGroup('x'.repeat(2000), twenty, alice.keys.secretKey))).toBeLessThan(64 * 1024);
  });
});
