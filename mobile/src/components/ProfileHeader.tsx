import * as Clipboard from 'expo-clipboard';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Text, useTheme } from 'react-native-paper';

import { shorten } from './CopyableValue';
import { avatarColor, UserAvatar } from './UserAvatar';

/** Banner height; the avatar is centered exactly on its bottom edge. */
const BAND_HEIGHT = 128;
const AVATAR_SIZE = 96;
const RING = 4;
const AVATAR_TOP = BAND_HEIGHT - AVATAR_SIZE / 2 - RING;

interface Props {
  username: string | null;
  address: string;
  /** Badges under the name, e.g. "This is you". */
  chips?: ReactNode;
  /** Primary actions under the header, e.g. "Send message". */
  actions?: ReactNode;
}

/** Avatar, @username and a tappable address chip — shared by the profile and settings screens. */
export function ProfileHeader({ username, address, chips, actions }: Props) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.container}>
      {/* A banner in the user's avatar color; the avatar sits centered on its bottom edge. */}
      <View style={[styles.band, { backgroundColor: avatarColor(address) }]}>
        <View style={[styles.bandShade, { backgroundColor: theme.colors.background }]} />
      </View>
      <View style={[styles.avatarRing, { borderColor: theme.colors.background, backgroundColor: theme.colors.background }]}>
        <UserAvatar username={username ?? '?'} address={address} size={AVATAR_SIZE} />
      </View>

      <Text variant="headlineSmall" style={styles.username} numberOfLines={1}>
        {username ? `@${username}` : 'Not registered'}
      </Text>

      <Chip icon={copied ? 'check' : 'content-copy'} onPress={copy} compact textStyle={styles.addressText} accessibilityLabel="Copy wallet address">
        {copied ? 'Address copied' : shorten(address, 6, 4)}
      </Chip>

      {chips && <View style={styles.chips}>{chips}</View>}
      {actions && <View style={styles.actions}>{actions}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 10, paddingTop: AVATAR_TOP, paddingBottom: 4 },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: BAND_HEIGHT, borderRadius: 24, overflow: 'hidden' },
  // Softens the banner color so it works in light and dark mode.
  bandShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 },
  avatarRing: { borderWidth: RING, borderRadius: AVATAR_SIZE / 2 + RING },
  username: { fontWeight: '700', maxWidth: '90%' },
  addressText: { fontFamily: 'Menlo', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4, alignSelf: 'stretch' },
});
