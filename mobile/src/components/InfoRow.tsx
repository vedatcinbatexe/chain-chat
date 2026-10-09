import * as Clipboard from 'expo-clipboard';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, IconButton, Text, useTheme } from 'react-native-paper';

interface Props {
  icon: string;
  label: string;
  value: string;
  /** Hex values (addresses, keys, hashes) use a monospace font and are shortened in the middle. */
  mono?: boolean;
  /** Shows a copy button that copies the full value. */
  copyable?: boolean;
  /** Extra content under the value, e.g. a verification line. */
  footer?: ReactNode;
}

/**
 * Label above value, so long values can never push into other elements. Values stay on one line and are
 * truncated in the middle ("0x8c9e…d81c"), which is how people compare addresses.
 */
export function InfoRow({ icon, label, value, mono = false, copyable = false, footer }: Props) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
  };

  return (
    <View style={styles.row}>
      <Icon source={icon} size={20} color={theme.colors.onSurfaceVariant} />
      <View style={styles.text}>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {label}
        </Text>
        <Text variant="bodyLarge" numberOfLines={1} ellipsizeMode="middle" style={mono ? styles.mono : undefined}>
          {value}
        </Text>
        {footer}
      </View>
      {copyable && (
        <IconButton
          icon={copied ? 'check' : 'content-copy'}
          size={18}
          iconColor={copied ? theme.colors.secondary : theme.colors.onSurfaceVariant}
          onPress={copy}
          accessibilityLabel={`Copy ${label}`}
          style={styles.copy}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  mono: { fontFamily: 'Menlo', fontSize: 14 },
  copy: { margin: 0 },
});
