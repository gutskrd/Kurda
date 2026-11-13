import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatMessage } from '../gifts/api';
import { useI18n } from '../i18n/I18nContext';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { Bubble, RUN_FACE, useBubbleInk } from './Bubble';
import { MessageContent, hasControls, isCardMessage } from './MessageContent';
import { messageA11y, openMessageOptions } from './messageOptions';
import { DayPill } from './ThreadParts';
import { isEmojiOnly, timeLabel, type Place } from './thread';

/** A message as a thread shows it: the server's, or one sent from here that it has not answered for yet. */
export type RowMessage = ChatMessage & { pending?: boolean };

/**
 * One message of a thread, drawn where it sits in the conversation
 * (`thread.ts` says where): the same row in a chat with one friend and in a
 * group's, so the two cannot drift apart.
 *
 * Messages from one person in a row read as one turn. Their face stands once,
 * at the foot of the run beside its last bubble, rather than beside every
 * line; their name is printed once, over the first, and only where there is
 * more than one person it could be (`named`: a group). The time is printed
 * once a moment, under the run the conversation paused after, with "Read"
 * beside it for your own.
 *
 * A message that is only a few emoji is shown large with no bubble, and a
 * card (a gift, a game) is its own surface: neither wears a bubble or a tail.
 * A deleted message keeps its place, since removing the row would renumber
 * the conversation around whoever was moderated.
 *
 * Held, a message offers its words to copy and, if it is someone else's, a
 * report; a screen reader finds the same among the message's own actions.
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
  /** print whose message it is over the first of a run: a group */
  named?: boolean;
  /** who sent it, for a card that says so and for the face */
  senderName: string;
  /** what to say beside the time of your own message once it has been read */
  receipt?: string | null;
  onOpenGift: (giftId: string) => void;
  /** report this message; undefined for your own */
  onReport?: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const ink = useBubbleInk(mine);
  // in Soranî and Arabic the thread is mirrored: your own words on the left, theirs on the right
  const mirrored = dir.row === 'row-reverse';
  const side = mine !== mirrored ? 'right' : 'left';
  const deleted = message.deleted === true;
  const card = isCardMessage(message) && !deleted;
  const emoji = !card && !deleted && isEmojiOnly(message.body);
  // one element for a screen reader, with Copy and Report among its actions, unless it holds a control of its own
  const whole = deleted || !hasControls(message);
  // the controls inside a message (a gift, an invite link) report it too
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
        accessible={whole}
        {...(whole ? messageA11y(t, options) : null)}
        // on its way: said to a screen reader as busy, and drawn fainter until the server has it
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
          // the name is over the run, or in the header: the face alone would be read out as a second name
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="run-face">
            <InitialsAvatar name={senderName} id={message.senderId} size={RUN_FACE} photoUrl={message.avatarUrl} />
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
  // a run stands a little apart from the one before it; its own messages sit close
  newRun: { marginTop: 10 },
  sameRun: { marginTop: 2 },
  row: { alignItems: 'flex-end', gap: spacing.sm, maxWidth: '86%' },
  // your own words at the end of the line and theirs (with their face) at its start, whichever side that is
  rowRight: { alignSelf: 'flex-end' },
  rowLeft: { alignSelf: 'flex-start' },
  // a held message sinks a little under the finger, so the hold is felt to be doing something
  held: { transform: [{ scale: 0.97 }] },
  // a message still on its way, as a comment being posted is drawn
  sending: { opacity: 0.6 },
  // the room the face takes at the foot of the run, kept beside the bubbles above it so they line up
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
  // under the bubbles, not under the face beside them
  metaPastFace: { marginHorizontal: RUN_FACE + spacing.sm + spacing.xs },
});
