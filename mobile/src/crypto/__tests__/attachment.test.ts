import { decryptAttachment, encryptAttachment } from '../attachment';

const audio = new Uint8Array(5000).map((_, index) => (index * 31) % 256);

describe('attachment encryption', () => {
  it('round-trips, and the upload is not the plaintext', () => {
    const encrypted = encryptAttachment(audio);
    expect(encrypted.blob.length).toBe(audio.length + 24 + 16);
    expect(Buffer.from(encrypted.blob).includes(Buffer.from(audio.subarray(0, 64)))).toBe(false);

    const result = decryptAttachment(encrypted.blob, encrypted.key, encrypted.hash);
    expect(result).toEqual({ ok: true, content: audio });
  });

  it('uses a fresh key and nonce every time', () => {
    const a = encryptAttachment(audio);
    const b = encryptAttachment(audio);
    expect(a.key).not.toBe(b.key);
    expect(a.hash).not.toBe(b.hash);
  });

  it('detects a file that was changed on the server', () => {
    const encrypted = encryptAttachment(audio);
    const changed = Uint8Array.from(encrypted.blob);
    changed[100] ^= 1;
    expect(decryptAttachment(changed, encrypted.key, encrypted.hash)).toEqual({ ok: false, reason: 'tampered' });
  });

  it('detects a file that was swapped for another one', () => {
    const real = encryptAttachment(audio);
    const other = encryptAttachment(new Uint8Array(5000));
    expect(decryptAttachment(other.blob, real.key, real.hash)).toEqual({ ok: false, reason: 'tampered' });
  });

  it('does not decrypt with the wrong key', () => {
    const encrypted = encryptAttachment(audio);
    const other = encryptAttachment(audio);
    expect(decryptAttachment(encrypted.blob, other.key, encrypted.hash)).toEqual({ ok: false, reason: 'undecryptable' });
    expect(decryptAttachment(encrypted.blob, '0x1234', encrypted.hash)).toEqual({ ok: false, reason: 'undecryptable' });
  });
});
