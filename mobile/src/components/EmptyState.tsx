import { StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

interface Props {
  icon: string;
  title: string;
  description: string;
}

/** Centered icon + message for screens that have no content yet. */
export function EmptyState({ icon, title, description }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Icon source={icon} size={56} color={theme.colors.outline} />
      <Text variant="titleMedium">{title}</Text>
      <Text variant="bodyMedium" style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
        {description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  description: { textAlign: 'center' },
});
