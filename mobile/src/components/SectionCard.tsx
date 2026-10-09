import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Surface, Text, useTheme } from 'react-native-paper';

interface Props {
  title: string;
  icon: string;
  subtitle?: string;
  /** Tints the title (e.g. the danger zone). */
  tone?: 'default' | 'danger';
  children: ReactNode;
}

/** A titled section with consistent spacing — the building block of the profile and settings screens. */
export function SectionCard({ title, icon, subtitle, tone = 'default', children }: Props) {
  const theme = useTheme();
  const accent = tone === 'danger' ? theme.colors.error : theme.colors.primary;

  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1 }]} elevation={0}>
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: tone === 'danger' ? theme.colors.errorContainer : theme.colors.primaryContainer }]}>
          <Icon source={icon} size={18} color={accent} />
        </View>
        <View style={styles.titles}>
          <Text variant="titleMedium" style={[styles.title, tone === 'danger' && { color: accent }]}>
            {title}
          </Text>
          {subtitle && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.body}>{children}</View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 16, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBadge: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, minWidth: 0 },
  title: { fontWeight: '700' },
  body: { gap: 12 },
});
