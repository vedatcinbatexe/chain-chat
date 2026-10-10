import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Badge, Button, Divider, Icon, IconButton, Modal, Portal, Text, useTheme } from 'react-native-paper';

import { NOTIFICATION_ICONS } from './NotificationBanner';
import { useNotificationStore, type AppNotification } from './store';

const timeOf = (timestamp: number) => new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** The bell in the header: a count of new notifications, and the inbox of this session's notifications. */
export function NotificationBell() {
  const theme = useTheme();
  const router = useRouter();
  const history = useNotificationStore((state) => state.history);
  const unread = useNotificationStore((state) => state.unread);
  const markAllRead = useNotificationStore((state) => state.markAllRead);
  const clear = useNotificationStore((state) => state.clear);
  const [open, setOpen] = useState(false);

  const show = () => {
    setOpen(true);
    markAllRead();
  };
  const openNotification = (notification: AppNotification) => {
    setOpen(false);
    if (notification.route) router.push(notification.route);
  };

  return (
    <View>
      <IconButton icon={unread > 0 ? 'bell-ring-outline' : 'bell-outline'} onPress={show} accessibilityLabel={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'} />
      {unread > 0 && (
        <Badge size={16} style={styles.count}>
          {unread > 9 ? '9+' : unread}
        </Badge>
      )}

      <Portal>
        <Modal visible={open} onDismiss={() => setOpen(false)} contentContainerStyle={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
          <Text variant="titleMedium" style={styles.title}>
            Notifications
          </Text>
          <Text variant="bodySmall" style={[styles.centered, { color: theme.colors.onSurfaceVariant }]}>
            What happened while the app was open. Notifications are not stored, and none arrive while the app is closed.
          </Text>
          <Divider style={styles.divider} />

          {history.length === 0 ? (
            <Text variant="bodyMedium" style={[styles.centered, styles.empty, { color: theme.colors.onSurfaceVariant }]}>
              Nothing yet. New messages, payments, badges and announcements appear here.
            </Text>
          ) : (
            <ScrollView style={styles.list}>
              {history.map((notification) => (
                <Pressable key={notification.id} style={styles.row} onPress={() => openNotification(notification)} disabled={!notification.route}>
                  <View style={[styles.icon, { backgroundColor: theme.colors.primaryContainer }]}>
                    <Icon source={NOTIFICATION_ICONS[notification.kind]} size={18} color={theme.colors.primary} />
                  </View>
                  <View style={styles.rowText}>
                    <Text variant="titleSmall" numberOfLines={1}>
                      {notification.title}
                    </Text>
                    <Text variant="bodySmall" numberOfLines={3} style={{ color: theme.colors.onSurfaceVariant }}>
                      {notification.body}
                    </Text>
                  </View>
                  <Text variant="labelSmall" style={{ color: theme.colors.outline }}>
                    {timeOf(notification.createdAt)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={styles.actions}>
            {history.length > 0 && (
              <Button onPress={clear} style={styles.flex}>
                Clear all
              </Button>
            )}
            <Button mode="contained-tonal" onPress={() => setOpen(false)} style={styles.flex}>
              Close
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  count: { position: 'absolute', top: 6, right: 6 },
  sheet: { marginHorizontal: 20, borderRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, gap: 6 },
  title: { fontWeight: '700', textAlign: 'center' },
  centered: { textAlign: 'center' },
  divider: { marginVertical: 6 },
  empty: { marginVertical: 24 },
  list: { maxHeight: 380, flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  flex: { flex: 1 },
});
