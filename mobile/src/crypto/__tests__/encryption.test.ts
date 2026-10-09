import { hexToBytes, bytesToHex, size } from 'viem';

import { decrypt, encrypt, encryptionKeyPairFromSecret, generateEncryptionKeyPair } from '../encryption';

describe('encryption', () => {
  const alice = generateEncryptionKeyPair();
  const bob = generateEncryptionKeyPair();
  const message = 'Hi Bob, are you ready for the midterm? 🎓';

  it('round-trips between two key pairs', () => {
    const ciphertext = encrypt(message, bob.publicKey, alice.secretKey);
    expect(decrypt(ciphertext, alice.publicKey, bob.secretKey)).toBe(message);
  });

  it('uses the nonce ‖ box wire format', () => {
    const ciphertext = encrypt('abc', bob.publicKey, alice.secretKey);
    // 24-byte nonce + 3 plaintext bytes + 16-byte Poly1305 tag
    expect(size(ciphertext)).toBe(24 + 3 + 16);
  });

  it('uses a fresh nonce every time', () => {
    expect(encrypt(message, bob.publicKey, alice.secretKey)).not.toBe(encrypt(message, bob.publicKey, alice.secretKey));
  });

  it('rejects a tampered ciphertext', () => {
    const bytes = hexToBytes(encrypt(message, bob.publicKey, alice.secretKey));
    bytes[bytes.length - 1] ^= 1;
    expect(decrypt(bytesToHex(bytes), alice.publicKey, bob.secretKey)).toBeNull();
  });

  it('cannot be read by a third party', () => {
    const mallory = generateEncryptionKeyPair();
    const ciphertext = encrypt(message, bob.publicKey, alice.secretKey);
    expect(decrypt(ciphertext, alice.publicKey, mallory.secretKey)).toBeNull();
  });

  it('rejects input that is too short to be a ciphertext', () => {
    expect(decrypt('0x1234', alice.publicKey, bob.secretKey)).toBeNull();
  });

  it('restores the same key pair from the stored secret key', () => {
    expect(encryptionKeyPairFromSecret(alice.secretKey)).toEqual(alice);
  });
});
