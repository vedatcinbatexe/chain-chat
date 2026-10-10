import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Divider, Modal, Portal, Text, useTheme } from 'react-native-paper';

import type { ReactionSummary } from '@/api/conversations';
import { UserAvatar } from '@/components/UserAvatar';

interface Props {
  /** The message's reactions, or null to hide the sheet. */
  reactions: ReactionSummary[] | null;
  me: string;
  /** Display name for an address, e.g. "@bob". */
  nameOf: (address: string) => string;
  onDismiss: () => void;
}

/** Who reacted with which emoji, shown on long-press of a reaction. */
export function ReactionsSheet({ reactions, me, nameOf, onDismiss }: Props) {
  const theme = useTheme();
  const entries = (reactions ?? []).flatMap((reaction) => reaction.addresses.map((address) => ({ address, emoji: reaction.emoji })));

  return (
    <Portal>
      <Modal visible={reactions !== null} onDismiss={onDismiss} contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
        <Text variant="titleMedium" style={styles.title}>
          Reactions
        </Text>

        {entries.length === 0 ? (
          <Text variant="bodyMedium" style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
            No reactions on this message anymore.
          </Text>
        ) : (
          <>
            <View style={styles.summary}>
              {(reactions ?? []).map((reaction) => (
                <View key={reaction.emoji} style={[styles.chip, { backgroundColor: theme.colors.surfaceVariant }]}>
                  <Text style={styles.chipEmoji}>{reaction.emoji}</Text>
                  <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                    {reaction.addresses.length}
                  </Text>
                </View>
              ))}
            </View>
            <Divider />
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {entries.map((entry) => {
                const isMe = entry.address.toLowerCase() === me.toLowerCase();
                const name = isMe ? 'You' : nameOf(entry.address);
                return (
                  <View key={`${entry.emoji}-${entry.address}`} style={styles.row}>
                    <UserAvatar username={isMe ? 'Me' : name.replace(/^@/, '')} address={entry.address} size={36} />
                    <Text variant="bodyLarge" numberOfLines={1} style={styles.name}>
                      {name}
                    </Text>
                    <View style={styles.emojiBox}>
                      <Text style={styles.emoji}>{entry.emoji}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <Divider />
          </>
        )}

        <Button mode="contained-tonal" onPress={onDismiss} style={styles.close}>
          Close
        </Button>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: { marginHorizontal: 28, borderRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  title: { fontWeight: '700', textAlign: 'center' },
  empty: { textAlign: 'center', marginVertical: 20 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12, marginBottom: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16 },
  chipEmoji: { fontSize: 16, lineHeight: 22 },
  list: { maxHeight: 300, flexGrow: 0 },
  listContent: { paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52 },
  name: { flex: 1, minWidth: 0 },
  emojiBox: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22, lineHeight: 28, textAlign: 'center' },
  close: { marginTop: 14 },
});
