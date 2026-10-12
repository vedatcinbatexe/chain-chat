import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, IconButton, Searchbar, Text, useTheme } from 'react-native-paper';

import { KIND_FILTERS, type MessageFilter } from '../content';

interface Props {
  filter: MessageFilter;
  onChange: (filter: MessageFilter) => void;
  /** How many messages pass the filter; shown once something is being filtered. */
  matchCount: number | null;
  onClose: () => void;
}

/**
 * Search and filter inside one conversation. Messages are end-to-end encrypted, so the server cannot search them:
 * the phone matches the text it has already decrypted.
 */
export function ChatSearchBar({ filter, onChange, matchCount, onClose }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.elevation.level1, borderBottomColor: theme.colors.outlineVariant }]}>
      <View style={styles.inputRow}>
        <Searchbar
          placeholder="Search this chat"
          value={filter.query}
          onChangeText={(query) => onChange({ ...filter, query })}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          elevation={0}
          style={[styles.searchbar, { backgroundColor: theme.colors.surfaceVariant }]}
          inputStyle={styles.input}
        />
        <IconButton icon="close" onPress={onClose} accessibilityLabel="Close search" style={styles.close} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
        {KIND_FILTERS.map((option) => {
          const selected = filter.kind === option.value;
          return (
            <Chip key={option.value} compact icon={option.icon} selected={selected} showSelectedCheck={false} mode={selected ? 'flat' : 'outlined'} onPress={() => onChange({ ...filter, kind: option.value })}>
              {option.label}
            </Chip>
          );
        })}
      </ScrollView>
      {matchCount !== null && (
        <Text variant="labelSmall" style={[styles.count, { color: theme.colors.onSurfaceVariant }]}>
          {matchCount === 0 ? 'No messages match' : `${matchCount} ${matchCount === 1 ? 'message' : 'messages'} · tap one to see it in the conversation`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 8, paddingBottom: 8, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12 },
  searchbar: { flex: 1, height: 44, borderRadius: 14 },
  input: { minHeight: 0, alignSelf: 'center' },
  close: { margin: 0, marginHorizontal: 4 },
  chips: { gap: 8, paddingHorizontal: 12 },
  count: { paddingHorizontal: 16 },
});
