import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Button, Modal, Portal, Text, useTheme } from 'react-native-paper';

import { EMOJI_CATEGORIES } from '../emojiData';

const COLUMNS = 8;

interface Props {
  visible: boolean;
  title: string;
  /** Called with the chosen emoji; the picker stays open only if `keepOpen` is set. */
  onSelect: (emoji: string) => void;
  onDismiss: () => void;
  /** For typing several emojis into a message. */
  keepOpen?: boolean;
}

/** A scrollable emoji picker with category tabs, for reactions and for typing emojis into a message. */
export function EmojiPicker({ visible, title, onSelect, onDismiss, keepOpen }: Props) {
  const theme = useTheme();
  const [categoryKey, setCategoryKey] = useState(EMOJI_CATEGORIES[0].key);
  const category = EMOJI_CATEGORIES.find((c) => c.key === categoryKey) ?? EMOJI_CATEGORIES[0];

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
        <Text variant="titleMedium" style={styles.title}>
          {title}
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {EMOJI_CATEGORIES.map((item) => {
            const active = item.key === category.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setCategoryKey(item.key)}
                accessibilityLabel={item.label}
                style={[styles.tab, { backgroundColor: active ? theme.colors.primaryContainer : 'transparent', borderColor: active ? theme.colors.primary : theme.colors.outlineVariant }]}>
                <Text style={styles.tabIcon}>{item.icon}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {category.label}
        </Text>

        <FlatList
          key={category.key}
          data={category.emojis}
          keyExtractor={(emoji) => emoji}
          numColumns={COLUMNS}
          style={styles.grid}
          renderItem={({ item }) => (
            <Pressable
              style={styles.cell}
              accessibilityLabel={item}
              onPress={() => {
                onSelect(item);
                if (!keepOpen) onDismiss();
              }}>
              <Text style={styles.emoji}>{item}</Text>
            </Pressable>
          )}
        />

        <Button mode="contained-tonal" onPress={onDismiss}>
          {keepOpen ? 'Done' : 'Close'}
        </Button>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: { marginHorizontal: 16, borderRadius: 24, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 8 },
  title: { fontWeight: '700', textAlign: 'center' },
  tabs: { gap: 6, paddingVertical: 2 },
  tab: { width: 40, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { fontSize: 18, lineHeight: 24 },
  grid: { height: 300 },
  cell: { width: `${100 / COLUMNS}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 26, lineHeight: 32 },
});
