import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import type { ChatMessage } from '../gifts/api';
import { useI18n } from '../i18n/I18nContext';
import { Avatar } from '../profile/Avatar';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { Bubble, RUN_FACE, useBubbleInk } from './Bubble';
import { MessageContent, hasControls, isCardMessage } from './MessageContent';
import { messageA11y, openMessageOptions } from './messageOptions';
import { DayPill } from './ThreadParts';
import { isEmojiOnly, timeLabel, type Place } from './thread';

/** A message as a thread shows it: the server's, or one sent from here still awaiting its answer. */
export type RowMessage = ChatMessage & { pending?: boolean };

/**
 * One message of a thread, drawn where it sits in the conversation (`thread.ts`), shared by DMs and group chats.
 *
 * Consecutive messages from one person read as one turn: their face appears once at the run's foot, their name
 * once over the first and only when there could be several people (`named`: a group), and the time once per
 * pause, under the run before it, with "Read" beside your own.
 *
 * A message of only a few emoji is shown large without a bubble, and a card (gift, game) is its own surface. A
 * deleted message keeps its place, so removing it does not reshuffle the conversation around whoever was
 * moderated. Held, a message offers Copy and, for someone else's, Report; screen readers find the same among its
 * actions.
 */
export function MessageRow({
  message,
  mine,
  place,
  named = false,
  senderName,
  receipt,
  onOpenGift,
  onReport,
}: {
  message: RowMessage;
  mine: boolean;
  place: Place;
  /** Print whose message it is over the first of a run: a group. */
  named?: boolean;
  /** Who sent it, for a card that says so and for the face. */
  senderName: string;
  /** What to say beside the time of your own message once it has been read. */
  receipt?: string | null;
  onOpenGift: (giftId: string) => void;
  /** Report this message; undefined for your own. */
  onReport?: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const ink = useBubbleInk(mine);
  // In Soranî and Arabic the thread is mirrored: your own words on the left, theirs on the right.
  const mirrored = dir.row === 'row-reverse';
  const side = mine !== mirrored ? 'right' : 'left';
  const deleted = message.deleted === true;
  const card = isCardMessage(message) && !deleted;
  const emoji = !card && !deleted && isEmojiOnly(message.body);
  // One element for screen readers, with Copy and Report among its actions, unless it holds a control of its own.
  const whole = deleted || !hasControls(message);
  // The controls inside a message (a gift, an invite link) report it too.
  const report = mine || deleted ? undefined : onReport;
  const options = { words: card || deleted ? null : message.body, onReport: report };
  const time = place.timed && !message.pending ? timeLabel(message.createdAt, locale) : '';
  const content = <MessageContent message={message} mine={mine} senderName={senderName} onOpenGift={onOpenGift} onReport={report} />;

  return (
    <View style={place.first ? styles.newRun : styles.sameRun}>
      {place.day ? <DayPill label={place.day} /> : null}
      <Pressable
        onLongPress={() => openMessageOptions(t, options)}
        delayLongPress={350}
        // Held, never tapped, and two points from the next bubble: reaching past its edges would only take the neighbour's hold.
        reach="none"
        accessible={whole}
        {...(whole ? messageA11y(t, options) : null)}
        // On its way: said to a screen reader as busy, and drawn fainter until the server has it.
        accessibilityState={message.pending ? { busy: true } : undefined}
        testID={message.pending ? 'message-sending' : undefined}
        style={({ pressed }) => [
          styles.row,
          { flexDirection: dir.row },
          side === 'right' ? styles.rowRight : styles.rowLeft,
          message.pending && styles.sending,
          pressed && styles.held,
        ]}
      >
        {mine ? null : place.last ? (
          // The name is over the run, or in the header: the face alone would be read out as a second name.
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="run-face">
            <Avatar name={senderName} size={RUN_FACE} photoUrl={message.avatarUrl} />
          </View>
        ) : (
          <View style={styles.noFace} />
        )}
        <View style={[styles.main, side === 'right' ? styles.alignRight : styles.alignLeft]}>
          {named && !mine && place.first ? <Text style={[styles.sender, dir.text, { color: colors.textSecondary }]}>{senderName}</Text> : null}
          {deleted ? (
            <Bubble mine={mine} side={side} first={place.first} last={place.last}>
              <View style={styles.deletedRow}>
                <Icon name="close" size={13} color={ink} />
                <Text style={[styles.deleted, { color: ink }]}>{t('groups.messageDeleted')}</Text>
              </View>
            </Bubble>
          ) : card ? (
            content
          ) : emoji ? (
            <Text style={styles.emoji}>{message.body}</Text>
          ) : (
            <Bubble mine={mine} side={side} first={place.first} last={place.last}>
              {content}
            </Bubble>
          )}
        </View>
      </Pressable>
      {time ? (
        <Text style={[styles.meta, side === 'right' ? styles.metaRight : styles.metaLeft, mine ? null : styles.metaPastFace, { color: colors.textSecondary }]}>
          {receipt ? `${time} · ${receipt}` : time}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // A run stands a little apart from the one before it; its own messages sit close.
  newRun: { marginTop: 10 },
  sameRun: { marginTop: 2 },
  row: { alignItems: 'flex-end', gap: spacing.sm, maxWidth: '86%' },
  // Your words at the line's end and theirs (with their face) at its start, whichever side that is.
  rowRight: { alignSelf: 'flex-end' },
  rowLeft: { alignSelf: 'flex-start' },
  // A held message sinks a little under the finger, so the hold is felt to be doing something.
  held: { transform: [{ scale: 0.97 }] },
  // A message still on its way, as a comment being posted is drawn.
  sending: { opacity: 0.6 },
  // The room the face takes at the foot of the run, kept beside the bubbles above it so they line up.
  noFace: { width: RUN_FACE },
  main: { flexShrink: 1 },
  alignRight: { alignItems: 'flex-end' },
  alignLeft: { alignItems: 'flex-start' },
  sender: { fontSize: typography.sizes.xs, marginBottom: 2, marginHorizontal: spacing.xs },
  deletedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, opacity: 0.75 },
  deleted: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
  emoji: { fontSize: 40, lineHeight: 48, paddingHorizontal: spacing.xs },
  meta: { fontSize: 12, marginTop: 3, marginHorizontal: spacing.xs },
  metaRight: { alignSelf: 'flex-end' },
  metaLeft: { alignSelf: 'flex-start' },
  // Under the bubbles, not under the face beside them.
  metaPastFace: { marginHorizontal: RUN_FACE + spacing.sm + spacing.xs },
});
