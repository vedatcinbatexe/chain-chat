import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Icon, Text, useTheme } from 'react-native-paper';

/** Full-screen spinner with a short explanation. */
export function LoadingScreen({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ActivityIndicator size="large" />
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {label}
      </Text>
    </View>
  );
}

/** Full-screen error with a retry button. */
export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Icon source="cloud-alert-outline" size={56} color={theme.colors.error} />
      <Text variant="titleMedium">Something went wrong</Text>
      <Text variant="bodyMedium" style={[styles.message, { color: theme.colors.onSurfaceVariant }]}>
        {message}
      </Text>
      <Button mode="contained" icon="refresh" onPress={onRetry}>
        Try again
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  message: { textAlign: 'center' },
});
