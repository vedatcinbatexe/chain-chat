import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Divider, Icon, Modal, Portal, Text, useTheme } from 'react-native-paper';

import { EmojiPicker } from './EmojiPicker';

/** The quick choices; "more" opens the full picker. The server accepts any single emoji. */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🙏'];

export interface MessageAction {
  icon: string;
  label: string;
  /** Drawn in the error color (delete). */
  danger?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onDismiss: () => void;
  /** Reply, copy, verify, delete… listed under the emojis. */
  actions?: MessageAction[];
  /** False for a deleted message, which takes no reactions. */
  canReact?: boolean;
}

/** Shown on long-press of a message: a row of emojis (with a button to pick any other), and what can be done with the message. */
export function ReactionPicker({ visible, onSelect, onDismiss, actions = [], canReact = true }: Props) {
  const theme = useTheme();
  const [showAll, setShowAll] = useState(false);

  const close = () => {
    setShowAll(false);
    onDismiss();
  };

  if (showAll) return <EmojiPicker visible={visible} title="React with…" onSelect={onSelect} onDismiss={close} />;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={close} contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
        {canReact && (
        <View style={styles.row}>
          {REACTIONS.map((emoji) => (
            <Pressable key={emoji} onPress={() => onSelect(emoji)} style={styles.emoji} accessibilityLabel={`React with ${emoji}`}>
              <Text style={styles.emojiText}>{emoji}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setShowAll(true)} style={[styles.emoji, styles.more, { backgroundColor: theme.colors.surfaceVariant }]} accessibilityLabel="More emojis">
            <Icon source="plus" size={24} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        </View>
        )}
        {canReact && actions.length > 0 && <Divider />}
        {actions.map((action) => {
          const color = action.danger ? theme.colors.error : theme.colors.onSurface;
          return (
            <Pressable
              key={action.label}
              style={styles.action}
              onPress={() => {
                close();
                action.onPress();
              }}>
              <Icon source={action.icon} size={22} color={color} />
              <Text variant="bodyLarge" style={{ color }}>
                {action.label}
              </Text>
            </Pressable>
          );
        })}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: { marginHorizontal: 24, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 10, gap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  emoji: { padding: 8 },
  emojiText: { fontSize: 30 },
  more: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', margin: 4 },
});
