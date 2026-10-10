import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Vibration, View } from 'react-native';
import { Icon, IconButton, Surface, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNotificationStore, type NotificationKind } from './store';

export const NOTIFICATION_ICONS: Record<NotificationKind, string> = {
  message: 'message-text-outline',
  payment: 'cash-fast',
  funds: 'cash-plus',
  badge: 'certificate-outline',
  group: 'account-group-outline',
  account: 'account-alert-outline',
  announcement: 'bullhorn-outline',
};

/** Announcements stay longer: they can be a few sentences. */
const visibleFor = (kind: NotificationKind) => (kind === 'announcement' ? 9_000 : 5_000);

/**
 * The banner for the newest notification, shown above whatever screen is open. Tap to open what it is about;
 * it disappears by itself after a few seconds and stays in the inbox.
 */
export function NotificationBanner() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const current = useNotificationStore((state) => state.current);
  const dismiss = useNotificationStore((state) => state.dismiss);

  useEffect(() => {
    if (!current) return;
    Vibration.vibrate(40);
    const timer = setTimeout(dismiss, visibleFor(current.kind));
    return () => clearTimeout(timer);
  }, [current, dismiss]);

  if (!current) return null;

  const open = () => {
    dismiss();
    if (current.route) router.push(current.route);
  };

  return (
    <View style={[styles.container, { top: insets.top + 6 }]} pointerEvents="box-none">
      <Surface elevation={4} style={[styles.banner, { backgroundColor: theme.colors.inverseSurface }]}>
        <Pressable style={styles.content} onPress={open} accessibilityRole="alert" accessibilityHint={current.route ? 'Opens it' : 'Dismisses it'}>
          <View style={[styles.icon, { backgroundColor: theme.colors.inversePrimary }]}>
            <Icon source={NOTIFICATION_ICONS[current.kind]} size={20} color={theme.colors.inverseSurface} />
          </View>
          <View style={styles.text}>
            <Text variant="titleSmall" numberOfLines={1} style={{ color: theme.colors.inverseOnSurface }}>
              {current.title}
            </Text>
            <Text variant="bodySmall" numberOfLines={current.kind === 'announcement' ? 4 : 2} style={{ color: theme.colors.inverseOnSurface }}>
              {current.body}
            </Text>
          </View>
        </Pressable>
        <IconButton icon="close" size={18} iconColor={theme.colors.inverseOnSurface} onPress={dismiss} accessibilityLabel="Dismiss notification" />
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 12, right: 12, zIndex: 100 },
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, paddingLeft: 12 },
  content: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 1 },
});
