import { Pressable, StyleSheet, View } from 'react-native';
import { Modal, Portal, Text, useTheme } from 'react-native-paper';

/** Same set the server accepts (ReactionService.Allowed). */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🙏'];

/** A row of emojis shown on long-press of a message. */
export function ReactionPicker({ visible, onSelect, onDismiss }: { visible: boolean; onSelect: (emoji: string) => void; onDismiss: () => void }) {
  const theme = useTheme();
  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
        <Text variant="labelLarge" style={[styles.title, { color: theme.colors.onSurfaceVariant }]}>
          React
        </Text>
        <View style={styles.row}>
          {REACTIONS.map((emoji) => (
            <Pressable key={emoji} onPress={() => onSelect(emoji)} style={styles.emoji} accessibilityLabel={`React with ${emoji}`}>
              <Text style={styles.emojiText}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: { marginHorizontal: 24, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 10, gap: 8 },
  title: { textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  emoji: { padding: 8 },
  emojiText: { fontSize: 30 },
});
