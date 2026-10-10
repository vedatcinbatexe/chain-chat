import { AudioQuality, IOSOutputFormat, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type RecordingOptions } from 'expo-audio';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, IconButton, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDuration, MAX_VOICE_MS } from '../voice';

/** Speech-quality AAC, mono: about 250 KB per minute, so a full-length recording stays small. */
const VOICE_PRESET: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

export interface Recording {
  /** The recorded audio file on this phone. */
  uri: string;
  durationMs: number;
}

interface Props {
  /** Encrypts, uploads and sends the recording; rejects if that fails. */
  onSend: (recording: Recording) => Promise<void>;
  /** Closes the recorder (after sending, or when cancelled). */
  onClose: () => void;
}

/**
 * Replaces the message input while a voice message is recorded: it starts recording as soon as it appears, shows
 * the time, and offers Cancel and Send. Recording stops by itself at the maximum length.
 */
export function VoiceRecorder({ onSend, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(VOICE_PRESET);
  const state = useAudioRecorderState(recorder, 200);
  const [phase, setPhase] = useState<'starting' | 'recording' | 'stopped' | 'sending'>('starting');
  const [error, setError] = useState<string | null>(null);
  /** Length of the finished recording (the recorder reports 0 again once stopped). */
  const [recordedMs, setRecordedMs] = useState(0);
  const startedAt = useRef(0);
  const limitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Ask for the microphone and start recording when the bar appears.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          setError('Allow microphone access in Settings to record voice messages.');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (cancelled) return;
        recorder.record();
        startedAt.current = Date.now();
        setPhase('recording');
        // Stop by itself at the maximum length; the user then sends or cancels.
        limitTimer.current = setTimeout(() => {
          recorder.stop().catch(() => undefined);
          setRecordedMs(MAX_VOICE_MS);
          setPhase('stopped');
        }, MAX_VOICE_MS);
      } catch (e) {
        console.warn('Could not start recording', e);
        setError('Recording could not be started on this device.');
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(limitTimer.current);
      // Give the speaker back to playback when the recorder goes away.
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    };
  }, [recorder]);

  const discard = () => {
    try {
      if (recorder.uri) new File(recorder.uri).delete();
    } catch {
      // nothing to delete
    }
  };

  const cancel = async () => {
    clearTimeout(limitTimer.current);
    if (phase === 'recording') await recorder.stop().catch(() => undefined);
    discard();
    onClose();
  };

  const send = async () => {
    setError(null);
    try {
      let durationMs = recordedMs;
      if (phase === 'recording') {
        clearTimeout(limitTimer.current);
        durationMs = Math.min(Date.now() - startedAt.current, MAX_VOICE_MS);
        await recorder.stop();
        setRecordedMs(durationMs);
      }
      const uri = recorder.uri;
      if (!uri || durationMs < 500) {
        setError('That was too short. Record a little longer.');
        setPhase('stopped');
        return;
      }
      setPhase('sending');
      await onSend({ uri, durationMs });
      discard();
      onClose();
    } catch (e) {
      console.warn('Sending the voice message failed', e);
      setError(e instanceof Error && e.message ? e.message : 'The voice message could not be sent.');
      setPhase('stopped');
    }
  };

  const shown = phase === 'recording' ? Math.min(state.durationMillis, MAX_VOICE_MS) : recordedMs;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: theme.colors.background, borderTopColor: theme.colors.outlineVariant }]}>
      <View style={styles.row}>
        <IconButton icon="close" size={22} onPress={cancel} disabled={phase === 'sending'} accessibilityLabel="Cancel recording" />
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: phase === 'recording' ? theme.colors.error : theme.colors.outline }]} />
          <Text variant="titleMedium" style={styles.time}>
            {formatDuration(shown)}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
            {phase === 'starting' ? 'Starting…' : phase === 'recording' ? `Recording · up to ${formatDuration(MAX_VOICE_MS)}` : phase === 'sending' ? 'Encrypting and sending…' : 'Recorded'}
          </Text>
        </View>
        <Button mode="contained" icon="send" onPress={send} loading={phase === 'sending'} disabled={phase === 'starting' || phase === 'sending' || !!(error && phase !== 'stopped')}>
          Send
        </Button>
      </View>
      {error && (
        <Text variant="bodySmall" style={[styles.error, { color: theme.colors.error }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  status: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  time: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  error: { paddingHorizontal: 12 },
});
