import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Surface, Text, useTheme } from 'react-native-paper';
import { formatUnits, type Address, type Hex } from 'viem';

import type { ReactionSummary } from '@/api/conversations';
import { parsePaymentPayload } from '../payment';
import { describeMedia, parseImagePayload } from '../image';
import { parseVoicePayload } from '../voice';
import { ImageContent } from './ImageContent';
import { VoiceContent } from './VoiceContent';
import { PaymentContent } from '../PaymentContent';
import { formatMessageTime } from '../usePeer';
import type { VerifiedMessage } from '../verify';

/** Messages from the same sender within this window are grouped (tighter spacing, one tail). */
const GROUP_WINDOW_MS = 3 * 60 * 1000;

export interface PendingMessage {
  key: string;
  text: string;
  paymentTxHash?: Hex;
  failed: boolean;
  /** Why it was not sent, when the server gave a reason the user can understand. */
  reason?: string | null;
}

export type Row =
  | { kind: 'message'; message: VerifiedMessage; groupedWithNext: boolean; firstOfRun: boolean }
  | { kind: 'pending'; pending: PendingMessage }
  | { kind: 'day'; label: string; key: string };

/** Chronological messages → rows for an inverted list (newest first), with day separators and grouping. */
export function buildRows(messages: VerifiedMessage[], pending: PendingMessage[]): Row[] {
  const chronological: Row[] = [];
  let lastDay = '';

  messages.forEach((message, index) => {
    const time = Number(message.dto.clientTimestamp);
    const day = new Date(time).toDateString();
    const newDay = day !== lastDay;
    if (newDay) {
      chronological.push({ kind: 'day', label: dayLabel(time), key: `day-${day}` });
      lastDay = day;
    }
    const sameRun = (a: VerifiedMessage | undefined, b: VerifiedMessage | undefined) =>
      !!a && !!b &&
      a.dto.sender.toLowerCase() === b.dto.sender.toLowerCase() &&
      Math.abs(Number(a.dto.clientTimestamp) - Number(b.dto.clientTimestamp)) < GROUP_WINDOW_MS &&
      new Date(Number(a.dto.clientTimestamp)).toDateString() === new Date(Number(b.dto.clientTimestamp)).toDateString();

    chronological.push({
      kind: 'message',
      message,
      groupedWithNext: sameRun(message, messages[index + 1]),
      firstOfRun: newDay || !sameRun(messages[index - 1], message),
    });
  });

  pending.forEach((p) => chronological.push({ kind: 'pending', pending: p }));
  return chronological.reverse();
}

function dayLabel(milliseconds: number): string {
  const date = new Date(milliseconds);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function DaySeparator({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.daySeparator}>
      <Text variant="labelSmall" style={[styles.dayLabel, { backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurfaceVariant }]}>
        {label}
      </Text>
    </View>
  );
}

interface BubbleProps {
  message: VerifiedMessage;
  groupedWithNext: boolean;
  /** Group chats: the sender's name above the first bubble of each run. */
  senderLabel?: string | null;
  /** Name used in the "message missing" warning. */
  senderName: string;
  /** For payment messages: who should have been paid. */
  recipient?: Address;
  me: Address;
  onPress: () => void;
  onLongPress: () => void;
  onToggleReaction: (emoji: string) => void;
  /** Long-press on a reaction: show who reacted. */
  onShowReactions: () => void;
  /** The live reaction list; reactions change without the message being verified again. */
  reactions?: ReactionSummary[];
}

export function MessageBubble({ message, groupedWithNext, senderLabel, senderName, recipient, me, onPress, onLongPress, onToggleReaction, onShowReactions, reactions: liveReactions }: BubbleProps) {
  const theme = useTheme();
  const { mine, text, signatureValid, chainIntact, dto } = message;
  // A payment only counts if the signed, encrypted payload names the same transaction the server recorded.
  const parsed = parsePaymentPayload(text);
  const payment = parsed && recipient && (!dto.payment || dto.payment.txHash.toLowerCase() === parsed.txHash.toLowerCase()) ? parsed : null;
  const voice = parseVoicePayload(text);
  const image = parseImagePayload(text);

  const background = !signatureValid
    ? theme.colors.errorContainer
    : payment
      ? mine
        ? theme.colors.primaryContainer
        : theme.colors.secondaryContainer
      : mine
        ? theme.colors.primary
        : theme.colors.surfaceVariant;
  const foreground = !signatureValid
    ? theme.colors.onErrorContainer
    : payment
      ? mine
        ? theme.colors.onPrimaryContainer
        : theme.colors.onSecondaryContainer
      : mine
        ? theme.colors.onPrimary
        : theme.colors.onSurfaceVariant;

  // The "tail" corner only on the last bubble of a group.
  const tail = groupedWithNext ? null : mine ? styles.tailMine : styles.tailTheirs;
  const reactions = liveReactions ?? dto.reactions ?? [];

  return (
    <View style={[styles.bubbleRow, mine ? styles.mine : styles.theirs, groupedWithNext ? styles.grouped : styles.ungrouped]}>
      {senderLabel && (
        <Text variant="labelMedium" style={[styles.senderLabel, { color: theme.colors.primary }]}>
          {senderLabel}
        </Text>
      )}
      {!chainIntact && (
        <Text variant="labelSmall" style={[styles.warning, { color: theme.colors.error }]}>
          ⚠ A message from {mine ? 'you' : senderName} is missing before this one
        </Text>
      )}
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={300}
        accessibilityHint="Tap to verify, long-press to react"
        style={[styles.bubble, tail, payment && styles.paymentBubble, { backgroundColor: background }]}>
        {payment && recipient ? (
          <PaymentContent payload={payment} dto={dto} recipient={recipient} color={foreground} />
        ) : voice ? (
          <VoiceContent voice={voice} color={foreground} />
        ) : image ? (
          <ImageContent image={image} color={foreground} onLongPress={onLongPress} />
        ) : (
          <Text variant="bodyLarge" style={{ color: foreground, fontStyle: text === null ? 'italic' : 'normal' }}>
            {text ?? 'Could not decrypt this message'}
          </Text>
        )}
        <View style={styles.meta}>
          <Text variant="labelSmall" style={[styles.metaText, { color: foreground }]}>
            {formatMessageTime(Number(dto.clientTimestamp))}
          </Text>
          <Icon source={signatureValid ? 'check-decagram' : 'alert-decagram'} size={13} color={foreground} />
        </View>
        {!signatureValid && (
          <Text variant="labelSmall" style={{ color: foreground }}>
            Signature invalid — not sent by this wallet, or changed in transit
          </Text>
        )}
      </Pressable>
      {reactions.length > 0 && <ReactionChips reactions={reactions} me={me} onToggle={onToggleReaction} onShowAll={onShowReactions} />}
    </View>
  );
}

function ReactionChips({ reactions, me, onToggle, onShowAll }: { reactions: ReactionSummary[]; me: Address; onToggle: (emoji: string) => void; onShowAll: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.reactions}>
      {reactions.map((reaction) => {
        const mine = reaction.addresses.some((a) => a.toLowerCase() === me.toLowerCase());
        return (
          <Pressable
            key={reaction.emoji}
            onPress={() => onToggle(reaction.emoji)}
            onLongPress={onShowAll}
            delayLongPress={300}
            accessibilityHint="Tap to toggle your reaction, long-press to see who reacted"
            accessibilityLabel={`${reaction.emoji} ${reaction.addresses.length}${mine ? ', including you' : ''}`}
            style={[
              styles.reactionChip,
              { backgroundColor: mine ? theme.colors.primaryContainer : theme.colors.surfaceVariant, borderColor: mine ? theme.colors.primary : 'transparent' },
            ]}>
            <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
            {reaction.addresses.length > 1 && (
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {reaction.addresses.length}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function PendingBubble({ pending, onRetry }: { pending: PendingMessage; onRetry: () => void }) {
  const theme = useTheme();
  const color = pending.failed ? theme.colors.onErrorContainer : theme.colors.onPrimary;
  return (
    <Pressable style={[styles.bubbleRow, styles.mine, styles.ungrouped]} onPress={pending.failed ? onRetry : undefined} disabled={!pending.failed}>
      <View style={[styles.bubble, styles.tailMine, { backgroundColor: pending.failed ? theme.colors.errorContainer : theme.colors.primary, opacity: pending.failed ? 1 : 0.65 }]}>
        <Text variant="bodyLarge" style={{ color }}>
          {describePending(pending)}
        </Text>
        <View style={styles.meta}>
          <Icon source={pending.failed ? 'alert-circle-outline' : 'clock-outline'} size={13} color={color} />
          <Text variant="labelSmall" style={[styles.metaText, { color }]}>
            {pending.failed ? (pending.reason ? 'Not sent' : 'Not sent — tap to retry') : 'Encrypting & sending…'}
          </Text>
        </View>
        {pending.failed && pending.reason && (
          <Text variant="labelSmall" style={{ color }}>
            {pending.reason} Tap to retry.
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function describePending(pending: PendingMessage): string {
  const payment = parsePaymentPayload(pending.text);
  if (payment) return `💸 Sending ${formatUnits(BigInt(payment.amount), 18)} ${payment.token}…`;
  return describeMedia(pending.text) ?? pending.text;
}

/** Slim bar shown while the real-time connection is not up. */
export function ConnectionBar({ reconnecting }: { reconnecting: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.statusBar, { backgroundColor: theme.colors.tertiaryContainer }]}>
      <Icon source="lan-pending" size={14} color={theme.colors.onTertiaryContainer} />
      <Text variant="labelMedium" style={{ color: theme.colors.onTertiaryContainer }}>
        {reconnecting ? 'Connection lost — reconnecting…' : 'Connecting to the chat server…'}
      </Text>
    </View>
  );
}

/** Shown (flipped back) in the inverted list until the history is fetched and verified. */
export function LoadingHistory() {
  const theme = useTheme();
  return (
    <View style={styles.flippedCenter}>
      <ActivityIndicator />
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        Loading and verifying messages…
      </Text>
    </View>
  );
}

/** A centered card for an empty conversation (flipped back in the inverted list). */
export function EmptyConversation({ icon, title, points }: { icon: string; title: string; points: { icon: string; text: string }[] }) {
  const theme = useTheme();
  return (
    <View style={styles.flippedWrapper}>
      <Surface style={[styles.emptyCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={0}>
        <View style={[styles.emptyIcon, { backgroundColor: theme.colors.primaryContainer }]}>
          <Icon source={icon} size={30} color={theme.colors.primary} />
        </View>
        <Text variant="titleMedium" style={styles.emptyTitle}>
          {title}
        </Text>
        {points.map((point) => (
          <View key={point.icon} style={styles.emptyPoint}>
            <Icon source={point.icon} size={18} color={theme.colors.secondary} />
            <Text variant="bodySmall" style={[styles.emptyPointText, { color: theme.colors.onSurfaceVariant }]}>
              {point.text}
            </Text>
          </View>
        ))}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  statusBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  daySeparator: { alignItems: 'center', marginVertical: 12 },
  dayLabel: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  bubbleRow: { maxWidth: '80%', gap: 2 },
  grouped: { marginTop: 2 },
  ungrouped: { marginTop: 8 },
  mine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  senderLabel: { paddingHorizontal: 12, fontWeight: '700' },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, gap: 3 },
  tailMine: { borderBottomRightRadius: 6 },
  tailTheirs: { borderBottomLeftRadius: 6 },
  paymentBubble: { paddingVertical: 12, paddingHorizontal: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  metaText: { opacity: 0.75 },
  warning: { paddingHorizontal: 6, marginBottom: 2 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  reactionChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 12, borderWidth: 1 },
  reactionEmoji: { fontSize: 14 },
  // The inverted list flips its children; flip these states back.
  flippedCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, transform: [{ scaleY: -1 }] },
  flippedWrapper: { flex: 1, justifyContent: 'center', padding: 8, transform: [{ scaleY: -1 }] },
  emptyCard: { borderRadius: 24, padding: 20, gap: 12, alignItems: 'center' },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontWeight: '700' },
  emptyPoint: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', alignSelf: 'stretch' },
  emptyPointText: { flex: 1 },
});
