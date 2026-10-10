import { describeVoice, formatDuration, formatVoicePayload, parseVoicePayload } from '../voice';

const voice = { id: 'ab'.repeat(16), key: `0x${'11'.repeat(32)}` as const, hash: `0x${'22'.repeat(32)}` as const, durationMs: 7400, size: 31000 };

describe('voice payload', () => {
  it('round-trips', () => {
    expect(parseVoicePayload(formatVoicePayload(voice))).toEqual({ $chainchat: 'voice', v: 1, ...voice });
  });

  it('treats text, payments and malformed payloads as not a voice message', () => {
    expect(parseVoicePayload('hello')).toBeNull();
    expect(parseVoicePayload(null)).toBeNull();
    expect(parseVoicePayload(JSON.stringify({ $chainchat: 'payment', amount: '1', txHash: voice.hash }))).toBeNull();
    expect(parseVoicePayload(JSON.stringify({ $chainchat: 'voice', ...voice, id: '../../etc/passwd' }))).toBeNull();
    expect(parseVoicePayload(JSON.stringify({ $chainchat: 'voice', ...voice, key: '0x1234' }))).toBeNull();
    expect(parseVoicePayload(JSON.stringify({ $chainchat: 'voice', ...voice, durationMs: 'long' }))).toBeNull();
  });

  it('describes a voice message in one line', () => {
    expect(describeVoice(formatVoicePayload(voice))).toBe('🎤 Voice message (0:07)');
    expect(describeVoice('hello')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('shows minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(7400)).toBe('0:07');
    expect(formatDuration(60_000)).toBe('1:00');
    expect(formatDuration(75_600)).toBe('1:16');
  });
});
