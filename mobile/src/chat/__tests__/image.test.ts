import { describeMedia, formatImagePayload, imageExtension, parseImagePayload } from '../image';
import { formatVoicePayload } from '../voice';

const image = { id: 'cd'.repeat(16), key: `0x${'33'.repeat(32)}` as const, hash: `0x${'44'.repeat(32)}` as const, mime: 'image/jpeg' as const, width: 1200, height: 800, size: 250_000 };

describe('image payload', () => {
  it('round-trips', () => {
    expect(parseImagePayload(formatImagePayload(image))).toEqual({ $chainchat: 'image', v: 1, ...image });
  });

  it('rejects other content and unknown file types', () => {
    expect(parseImagePayload('look at this')).toBeNull();
    expect(parseImagePayload(null)).toBeNull();
    expect(parseImagePayload(JSON.stringify({ $chainchat: 'image', ...image, mime: 'text/html' }))).toBeNull();
    expect(parseImagePayload(JSON.stringify({ $chainchat: 'image', ...image, id: 'not-an-id' }))).toBeNull();
    expect(parseImagePayload(JSON.stringify({ $chainchat: 'image', ...image, mime: 'constructor' }))).toBeNull();
  });

  it('falls back to a square when the dimensions make no sense', () => {
    const parsed = parseImagePayload(JSON.stringify({ $chainchat: 'image', ...image, width: -5, height: 1e9 }));
    expect(parsed).toMatchObject({ width: 1, height: 1 });
  });

  it('names the file by its type', () => {
    expect(imageExtension('image/gif')).toBe('gif');
    expect(imageExtension('image/jpeg')).toBe('jpg');
  });
});

describe('describeMedia', () => {
  it('describes photos, GIFs and voice messages, and leaves text alone', () => {
    expect(describeMedia(formatImagePayload(image))).toBe('📷 Photo');
    expect(describeMedia(formatImagePayload({ ...image, mime: 'image/gif' }))).toBe('🎞 GIF');
    expect(describeMedia(formatVoicePayload({ id: image.id, key: image.key, hash: image.hash, durationMs: 3000, size: 1 }))).toBe('🎤 Voice message (0:03)');
    expect(describeMedia('hello')).toBeNull();
  });
});
