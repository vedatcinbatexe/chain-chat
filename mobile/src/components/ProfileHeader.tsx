import * as Clipboard from 'expo-clipboard';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Icon, Surface, Text, useTheme } from 'react-native-paper';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { shorten } from './CopyableValue';
import { avatarGradient, UserAvatar } from './UserAvatar';

/** Banner height; the avatar is centered exactly on its bottom edge. */
const BAND_HEIGHT = 132;
const AVATAR_SIZE = 100;
const RING = 5;
const AVATAR_TOP = BAND_HEIGHT - AVATAR_SIZE / 2 - RING;

export interface ProfileStat {
  icon: string;
  label: string;
  /** Undefined while it is loading. */
  value: string | undefined;
}

interface Props {
  username: string | null;
  address: string;
  /** Shows the green dot on the avatar. */
  online?: boolean;
  /** Badges under the name, e.g. "This is you". */
  chips?: ReactNode;
  /** Numbers at a glance: estimated value, badges, … */
  stats?: ProfileStat[];
  /** Primary actions under the header, e.g. "Send message". */
  actions?: ReactNode;
}

/** A card with a gradient banner in the user's colors, the avatar, @username, address and stats — shared by the profile and settings screens. */
export function ProfileHeader({ username, address, online, chips, stats, actions }: Props) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const [from, to] = avatarGradient(address);
  const gradientId = `band-${address.slice(-6)}`;

  const copy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1 }]} elevation={0}>
      <View style={styles.band}>
        <Svg width="100%" height="100%" viewBox="0 0 360 132" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect width="360" height="132" fill={`url(#${gradientId})`} />
          {/* Soft circles, so the banner is not a flat block of color. */}
          <Circle cx="310" cy="14" r="74" fill="white" opacity={0.1} />
          <Circle cx="48" cy="126" r="58" fill="white" opacity={0.08} />
          <Circle cx="206" cy="-18" r="44" fill="white" opacity={0.07} />
        </Svg>
      </View>

      <View style={styles.body}>
        <View style={[styles.avatarRing, { borderColor: theme.colors.elevation.level1, backgroundColor: theme.colors.elevation.level1 }]}>
          <UserAvatar username={username ?? '?'} address={address} size={AVATAR_SIZE} online={online} />
        </View>

        <Text variant="headlineSmall" style={styles.username} numberOfLines={1}>
          {username ? `@${username}` : 'Not registered'}
        </Text>

        <Chip icon={copied ? 'check' : 'content-copy'} onPress={copy} compact textStyle={styles.addressText} accessibilityLabel="Copy wallet address">
          {copied ? 'Address copied' : shorten(address, 6, 4)}
        </Chip>

        {chips && <View style={styles.chips}>{chips}</View>}

        {stats && stats.length > 0 && (
          <View style={styles.stats}>
            {stats.map((stat) => (
              <View key={stat.label} style={[styles.stat, { backgroundColor: theme.colors.surfaceVariant }]}>
                <Icon source={stat.icon} size={18} color={theme.colors.primary} />
                <Text variant="titleMedium" style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {stat.value ?? '—'}
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>
        )}

        {actions && <View style={styles.actions}>{actions}</View>}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, overflow: 'hidden' },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: BAND_HEIGHT },
  body: { alignItems: 'center', gap: 10, paddingTop: AVATAR_TOP, paddingHorizontal: 16, paddingBottom: 16 },
  avatarRing: { borderWidth: RING, borderRadius: AVATAR_SIZE / 2 + RING },
  username: { fontWeight: '700', maxWidth: '90%' },
  addressText: { fontFamily: 'Menlo', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  stats: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 4 },
  stat: { flex: 1, minWidth: 0, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 2 },
  statValue: { fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4, alignSelf: 'stretch' },
});
