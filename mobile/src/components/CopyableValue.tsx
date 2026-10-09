import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';

interface Props {
  label: string;
  value: string;
}

/** Shows a long value (address, key) shortened, with a button that copies the full value. */
export function CopyableValue({ label, value }: Props) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const onCopy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
  };

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {label}
        </Text>
        <Text variant="bodyLarge" style={styles.value}>
          {shorten(value)}
        </Text>
      </View>
      <IconButton
        icon={copied ? 'check' : 'content-copy'}
        iconColor={copied ? theme.colors.secondary : undefined}
        onPress={onCopy}
        accessibilityLabel={`Copy ${label}`}
      />
    </View>
  );
}

/** 0x1234abcd…cdef — keeps the start and end, which is how people compare addresses. */
export function shorten(value: string, start = 10, end = 8): string {
  return value.length <= start + end + 1 ? value : `${value.slice(0, start)}…${value.slice(-end)}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  value: { fontFamily: 'Menlo' },
});
