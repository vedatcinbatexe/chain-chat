import { Avatar } from 'react-native-paper';

/** Distinct, readable background colors; each address always gets the same one. */
const COLORS = ['#3b5bdb', '#0c8599', '#2f9e44', '#e8590c', '#ae3ec9', '#c2255c', '#1971c2', '#5f3dc4'];

export function avatarColor(address: string): string {
  // The last byte of an address is effectively random, so it spreads users evenly over the palette.
  return COLORS[parseInt(address.slice(-2), 16) % COLORS.length];
}

/** Initials of the username on a color derived from the wallet address. */
export function UserAvatar({ username, address, size = 44 }: { username: string; address: string; size?: number }) {
  return <Avatar.Text size={size} label={username.slice(0, 2).toUpperCase()} color="white" style={{ backgroundColor: avatarColor(address) }} />;
}
