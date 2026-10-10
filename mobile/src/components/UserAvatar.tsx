import { StyleSheet, View } from 'react-native';
import { Avatar, useTheme } from 'react-native-paper';

/** Distinct, readable background colors; each address always gets the same one. */
const COLORS = ['#3b5bdb', '#0c8599', '#2f9e44', '#e8590c', '#ae3ec9', '#c2255c', '#1971c2', '#5f3dc4'];

export function avatarColor(address: string): string {
  // The last byte of an address (or id) is effectively random, so it spreads users evenly over the palette.
  return COLORS[parseInt(address.slice(-2), 16) % COLORS.length];
}

interface Props {
  username: string;
  address: string;
  size?: number;
  /** Shows a green dot when the user is online. */
  online?: boolean;
  /** Group avatars use an icon instead of initials. */
  icon?: string;
}

/** Initials (or an icon) on a color derived from the wallet address, with an optional online dot. */
export function UserAvatar({ username, address, size = 44, online, icon }: Props) {
  const theme = useTheme();
  const dot = Math.max(10, Math.round(size * 0.28));
  const style = { backgroundColor: avatarColor(address) };

  return (
    <View>
      {icon ? (
        <Avatar.Icon size={size} icon={icon} color="white" style={style} />
      ) : (
        <Avatar.Text size={size} label={username.slice(0, 2).toUpperCase()} color="white" style={style} />
      )}
      {online && (
        <View
          accessibilityLabel="Online"
          style={[styles.dot, { width: dot, height: dot, borderRadius: dot / 2, borderColor: theme.colors.background }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', right: 0, bottom: 0, backgroundColor: '#2f9e44', borderWidth: 2 },
});
