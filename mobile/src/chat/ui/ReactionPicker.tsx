import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Modal, Portal, Text, useTheme } from 'react-native-paper';

import { EmojiPicker } from './EmojiPicker';

/** The quick choices; "more" opens the full picker. The server accepts any single emoji. */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🙏'];

/** A row of emojis shown on long-press of a message, with a button to pick any other emoji. */
export function ReactionPicker({ visible, onSelect, onDismiss }: { visible: boolean; onSelect: (emoji: string) => void; onDismiss: () => void }) {
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
        <Text variant="labelLarge" style={[styles.title, { color: theme.colors.onSurfaceVariant }]}>
          React
        </Text>
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
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: { marginHorizontal: 24, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 10, gap: 8 },
  title: { textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  emoji: { padding: 8 },
  emojiText: { fontSize: 30 },
  more: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', margin: 4 },
});
