import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, IconButton, Text } from 'react-native-paper';

import { loadAttachmentFile, type AttachmentFile } from '../attachmentFile';
import { formatDuration, type VoicePayload } from '../voice';

type Loaded = { state: 'idle' } | { state: 'loading' } | AttachmentFile;

/** A voice message inside a chat bubble: a play button, a progress line and the length. */
export function VoiceContent({ voice, color }: { voice: VoicePayload; color: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'idle' });

  const load = async () => {
    setLoaded({ state: 'loading' });
    try {
      // Nothing is downloaded until the user taps play.
      setLoaded(await loadAttachmentFile(voice, 'm4a', 'audio'));
    } catch (error) {
      console.warn('Could not load the voice message', error);
      setLoaded({ state: 'failed', reason: 'The audio could not be downloaded. Tap to try again.', tampered: false });
    }
  };

  if (loaded.state === 'ready') return <Player uri={loaded.uri} durationMs={voice.durationMs} color={color} />;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {loaded.state === 'loading' ? (
          <ActivityIndicator size={22} color={color} style={styles.spinner} />
        ) : (
          <IconButton icon={loaded.state === 'failed' ? 'refresh' : 'play'} iconColor={color} size={26} style={styles.button} onPress={load} accessibilityLabel="Play voice message" />
        )}
        <Track progress={0} color={color} />
        <Text variant="labelMedium" style={[styles.time, { color }]}>
          {formatDuration(voice.durationMs)}
        </Text>
      </View>
      <View style={styles.row}>
        <Icon source="microphone" size={13} color={color} />
        <Text variant="labelSmall" style={[styles.note, { color }]}>
          {loaded.state === 'failed' ? loaded.reason : loaded.state === 'loading' ? 'Downloading and decrypting…' : 'Voice message · end-to-end encrypted'}
        </Text>
      </View>
    </View>
  );
}

/** Created only once the decrypted file exists, so chats with many voice messages do not hold many players. */
function Player({ uri, durationMs, color }: { uri: string; durationMs: number; color: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  // Start as soon as the file is loaded: the user tapped play to get here.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !status.isLoaded) return;
    started.current = true;
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
      .catch(() => undefined)
      .then(() => player.play());
  }, [status.isLoaded, player]);

  // Back to the start when it finishes, ready to be played again.
  useEffect(() => {
    if (!status.didJustFinish) return;
    player.pause();
    player.seekTo(0).catch(() => undefined);
  }, [status.didJustFinish, player]);

  const total = status.duration > 0 ? status.duration * 1000 : durationMs;
  const position = status.currentTime * 1000;
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <IconButton
          icon={status.playing ? 'pause' : 'play'}
          iconColor={color}
          size={26}
          style={styles.button}
          onPress={() => (status.playing ? player.pause() : player.play())}
          accessibilityLabel={status.playing ? 'Pause' : 'Play voice message'}
        />
        <Track progress={total > 0 ? Math.min(1, position / total) : 0} color={color} />
        <Text variant="labelMedium" style={[styles.time, { color }]}>
          {formatDuration(status.playing || position > 0 ? position : total)}
        </Text>
      </View>
      <View style={styles.row}>
        <Icon source="check-decagram" size={13} color={color} />
        <Text variant="labelSmall" style={[styles.note, { color }]}>
          Matches the signed message
        </Text>
      </View>
    </View>
  );
}

function Track({ progress, color }: { progress: number; color: string }) {
  return (
    <View style={styles.track}>
      <View style={[styles.trackBackground, { backgroundColor: color }]} />
      <View style={[styles.fill, { backgroundColor: color, width: `${progress * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 2, minWidth: 210 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  button: { margin: 0 },
  spinner: { margin: 10 },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  trackBackground: { ...StyleSheet.absoluteFill, opacity: 0.25 },
  fill: { height: 4, borderRadius: 2 },
  time: { fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'right' },
  note: { flexShrink: 1, opacity: 0.85 },
});
