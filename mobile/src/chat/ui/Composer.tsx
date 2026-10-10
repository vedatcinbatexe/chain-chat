import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { ActivityIndicator, IconButton, Menu, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { notifyTyping } from '../connection';
import { EmojiPicker } from './EmojiPicker';
import { VoiceRecorder, type Recording } from './VoiceRecorder';

const MAX_LENGTH = 2000;
/** Send "typing" at most this often while the user types… */
const TYPING_REFRESH_MS = 3_000;
/** …and "stopped" after this long without a keystroke. */
const TYPING_IDLE_MS = 4_000;

interface Props {
  conversationId: string;
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  connected: boolean;
  /** Shows the 💸 button (1:1 chats only). */
  onPay?: () => void;
  payDisabled?: boolean;
  /** Shows the microphone button: encrypts, uploads and sends a recording. */
  onSendVoice?: (recording: Recording) => Promise<void>;
  /** Adds "Photo or GIF" to the + menu: lets the user pick a picture, then encrypts, uploads and sends it. */
  onSendImage?: () => Promise<void>;
}

/**
 * Message input with a + menu (photo or GIF, payment), an emoji picker, and a send or microphone button; tells the
 * other participants when the user is typing. While a voice message is recorded, the recorder bar takes its place.
 */
export function Composer({ conversationId, value, onChange, onSend, connected, onPay, payDisabled, onSendVoice, onSendImage }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const lastSent = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [recording, setRecording] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attaching, setAttaching] = useState(false);

  const stopTyping = () => {
    clearTimeout(idleTimer.current);
    if (lastSent.current !== 0) {
      lastSent.current = 0;
      notifyTyping(conversationId, false);
    }
  };

  // Stop the indicator when leaving the screen.
  useEffect(() => () => {
    clearTimeout(idleTimer.current);
    if (lastSent.current !== 0) notifyTyping(conversationId, false);
  }, [conversationId]);

  const onChangeText = (text: string) => {
    onChange(text);
    if (!text.trim()) return stopTyping();

    if (Date.now() - lastSent.current > TYPING_REFRESH_MS) {
      lastSent.current = Date.now();
      notifyTyping(conversationId, true);
    }
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  const send = () => {
    stopTyping();
    onSend();
  };

  const attachImage = async () => {
    setMenuOpen(false);
    if (!onSendImage) return;
    setAttaching(true);
    try {
      await onSendImage();
    } catch (error) {
      console.warn('Sending the picture failed', error);
      Alert.alert('Picture not sent', error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.');
    } finally {
      setAttaching(false);
    }
  };

  if (recording && onSendVoice) return <VoiceRecorder onSend={onSendVoice} onClose={() => setRecording(false)} />;

  return (
    <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: theme.colors.background, borderTopColor: theme.colors.outlineVariant }]}>
      {(onPay || onSendImage) &&
        (attaching ? (
          <ActivityIndicator style={styles.spinner} />
        ) : (
          <Menu
            visible={menuOpen}
            onDismiss={() => setMenuOpen(false)}
            anchorPosition="top"
            anchor={<IconButton icon="plus" mode="contained-tonal" size={22} style={styles.button} onPress={() => setMenuOpen(true)} disabled={!connected} accessibilityLabel="Attach" />}>
            {onSendImage && <Menu.Item leadingIcon="image-outline" title="Photo or GIF" onPress={attachImage} />}
            {onPay && (
              <Menu.Item
                leadingIcon="cash-fast"
                title="Send a payment"
                disabled={payDisabled}
                onPress={() => {
                  setMenuOpen(false);
                  onPay();
                }}
              />
            )}
          </Menu>
        ))}
      <IconButton icon="emoticon-outline" size={24} style={styles.button} onPress={() => setEmojiOpen(true)} accessibilityLabel="Emojis" />
      <TextInput
        mode="outlined"
        placeholder="Encrypted message"
        value={value}
        onChangeText={onChangeText}
        multiline
        maxLength={MAX_LENGTH}
        dense
        style={styles.input}
        outlineStyle={styles.inputOutline}
      />
      <EmojiPicker visible={emojiOpen} title="Emojis" keepOpen onSelect={(emoji) => onChangeText(`${value}${emoji}`.slice(0, MAX_LENGTH))} onDismiss={() => setEmojiOpen(false)} />
      {onSendVoice && !value.trim() ? (
        <IconButton icon="microphone" mode="contained" size={22} style={styles.button} onPress={() => setRecording(true)} disabled={!connected} accessibilityLabel="Record a voice message" />
      ) : (
        <IconButton icon="send" mode="contained" size={22} style={styles.button} onPress={send} disabled={!value.trim() || !connected} accessibilityLabel="Send" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingTop: 8, gap: 2, borderTopWidth: StyleSheet.hairlineWidth },
  button: { marginBottom: 4, marginHorizontal: 0 },
  spinner: { width: 40, marginBottom: 14 },
  input: { flex: 1, maxHeight: 120, fontSize: 16 },
  inputOutline: { borderRadius: 22 },
});
