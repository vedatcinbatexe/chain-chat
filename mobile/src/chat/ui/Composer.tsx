import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { notifyTyping } from '../connection';

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
}

/** Message input with send (and optional pay) button; tells the other participants when the user is typing. */
export function Composer({ conversationId, value, onChange, onSend, connected, onPay, payDisabled }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const lastSent = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  return (
    <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: theme.colors.background, borderTopColor: theme.colors.outlineVariant }]}>
      {onPay && (
        <IconButton icon="cash-fast" mode="contained-tonal" size={22} style={styles.button} onPress={onPay} disabled={!connected || payDisabled} accessibilityLabel="Send CHAT" />
      )}
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
      <IconButton icon="send" mode="contained" size={22} style={styles.button} onPress={send} disabled={!value.trim() || !connected} accessibilityLabel="Send" />
    </View>
  );
}

const styles = StyleSheet.create({
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingTop: 8, gap: 2, borderTopWidth: StyleSheet.hairlineWidth },
  button: { marginBottom: 4 },
  input: { flex: 1, maxHeight: 120, fontSize: 16 },
  inputOutline: { borderRadius: 22 },
});
