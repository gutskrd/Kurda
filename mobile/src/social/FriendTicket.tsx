import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { MIN_TOUCH_TARGET, hitSlopFor } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useI18n } from '../i18n/I18nContext';
import { Ticket, TicketBurst, TicketStamp, ticketTone, TEAR_MS } from '../play/Ticket';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useDirection } from '../reports/direction';
import { timing } from '../theme/animate';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { duration } from '../theme/motion';
import { PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/**
 * A friend request as a ticket, the other half of inviting somebody: the
 * same paper and stub as an invite to play (play/Ticket.tsx), in the brand's
 * ink rather than a game's colour.
 *
 * Received, it is a friendship ticket — their face and name, and that they
 * want to be friends. Accept tears its stub off with a small burst and
 * stamps it "Friends"; Decline folds it away. Sent, the Add button hands a
 * small ticket over (TicketSlip): it slips away from the button, which says
 * "Requested" with the ticket glyph; taking the request back slips it home
 * again. Under Reduce Motion nothing tears, bursts, folds or slips: the
 * stamp and the words change, and that is all.
 */

export type RequestAnswer = 'accepted' | 'declined';

/** How long an accepted request stays, stamped, before it leaves the list; and how long a declined one takes to fold away. */
export const ACCEPTED_HOLD_MS = 1300;
export const DECLINE_FOLD_MS = duration.base + 60;

export interface RequestPerson {
  userId: string;
  username: string;
  displayName?: string | null;
}

export function FriendRequestTicket({
  person,
  answer,
  compact = false,
  onOpen,
  onAccept,
  onDecline,
  acceptLabel,
  declineLabel,
}: {
  person: RequestPerson;
  /** answered on this phone a moment ago: stamped or folding, until the list lets it go */
  answer: RequestAnswer | null;
  /** a row in a longer list (Friends), rather than a card of its own (Friend requests) */
  compact?: boolean;
  onOpen: () => void;
  onAccept: () => void;
  onDecline: () => void;
  acceptLabel: string;
  declineLabel: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const accepted = answer === 'accepted';
  const wants = t('rail.wantsToBeFriendsWith', { name: person.displayName ?? person.username });

  // folded down and away, like a ticket put back in a pocket — and open again if the answer did not get through
  const fold = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (answer !== 'declined') {
      fold.setValue(0);
      return;
    }
    if (reduce) return;
    const run = timing(fold, 1, DECLINE_FOLD_MS, { easing: Easing.in(Easing.quad) });
    run.start();
    return () => run.stop();
  }, [answer, reduce, fold]);
  // the burst goes off as the stub comes away
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (!accepted) return;
    const id = setTimeout(() => setBurst((n) => n + 1), TEAR_MS / 2);
    return () => clearTimeout(id);
  }, [accepted]);

  const folding = {
    opacity: fold.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.6, 0] }),
    transform: [
      { perspective: 700 },
      { translateY: fold.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
      { rotateX: fold.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '70deg'] }) },
    ],
  };
  const tone = ticketTone(colors, 'friend');
  const who = (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={person.displayName ? `${person.username}, ${person.displayName}` : person.username}
      style={[styles.who, { flexDirection: dir.row }]}
    >
      <InitialsAvatar name={person.username} id={person.userId} size={compact ? 36 : 44} />
      <View style={styles.names}>
        <Text style={[styles.name, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
          {person.username}
        </Text>
        <Text style={[styles.wants, dir.text, { color: colors.textSecondary }]} numberOfLines={2}>
          {wants}
        </Text>
      </View>
    </Pressable>
  );
  const stamp = (
    <View style={styles.stampSpot}>
      <TicketStamp label={t('friends.title')} tone="success" land />
      <TicketBurst fired={burst} colour={colors.success} reach={52} />
    </View>
  );

  return (
    <Animated.View style={folding}>
      <Ticket
        tone="friend"
        size={compact ? 'mini' : 'regular'}
        torn={accepted}
        stub={<Icon name="user-plus" size={compact ? 18 : 24} color={tone.ink} />}
        bodyStyle={compact ? [styles.compactBody, { flexDirection: dir.row }] : styles.body}
      >
        {who}
        {accepted ? (
          stamp
        ) : compact ? (
          <View style={[styles.compactActions, { flexDirection: dir.row }]}>
            <PressableScale
              onPress={onAccept}
              disabled={answer !== null}
              hitSlop={hitSlopFor(MIN_TOUCH_TARGET, ACCEPT_HEIGHT)}
              style={[styles.accept, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel={acceptLabel}
            >
              <Text style={[styles.acceptText, { color: colors.textOnPrimary }]}>{t('friends.accept')}</Text>
            </PressableScale>
            <Pressable
              onPress={onDecline}
              disabled={answer !== null}
              style={styles.decline}
              accessibilityRole="button"
              accessibilityLabel={declineLabel}
            >
              <Icon name="close" size={18} color={colors.danger} />
            </Pressable>
          </View>
        ) : (
          <View style={[styles.actions, { flexDirection: dir.row }]}>
            <ClayButton label={t('friends.accept')} accessibilityLabel={acceptLabel} tone="primary" onPress={onAccept} disabled={answer !== null} style={styles.action} />
            <ClayButton label={t('friends.decline')} accessibilityLabel={declineLabel} onPress={onDecline} disabled={answer !== null} style={styles.action} />
          </View>
        )}
      </Ticket>
    </Animated.View>
  );
}

/** A row's Accept, a little under a fingertip's 44 and made up to it by its hit slop, so the row stays one line tall. */
const ACCEPT_HEIGHT = 36;

/** How long a slip takes to leave the button, or to come home to it. */
const SLIP_MS = 560;

/**
 * A button that hands a small ticket over. When `sent` turns true the ticket
 * pops out of the middle of the button and slips away, up and towards the
 * side a line ends on; when it turns false again (the request taken back) it
 * slips home into the button. Nothing on the first render, and nothing under
 * Reduce Motion, where the button's own words are the answer.
 */
export function TicketSlip({ sent, children }: { sent: boolean; children: ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const dir = useDirection();
  const last = useRef(sent);
  const p = useRef(new Animated.Value(0)).current;
  const [going, setGoing] = useState<'away' | 'home' | null>(null);
  useEffect(() => {
    if (sent === last.current) return;
    last.current = sent;
    if (reduce) return;
    setGoing(sent ? 'away' : 'home');
    p.setValue(0);
    const run = timing(p, 1, SLIP_MS, { easing: sent ? Easing.in(Easing.quad) : Easing.out(Easing.quad) });
    run.start(({ finished }) => {
      if (finished) setGoing(null);
    });
    return () => run.stop();
  }, [sent, reduce, p]);
  const side = dir.row === 'row-reverse' ? -1 : 1;
  // the same path both ways: out of the button and off, or in from off and into it
  const along = going === 'home' ? p.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : p;
  const tone = ticketTone(colors, 'friend');
  return (
    <View>
      {children}
      {going ? (
        <View pointerEvents="none" style={styles.slipSpot} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
          <Animated.View
            style={[
              styles.slip,
              {
                backgroundColor: colors.surface,
                borderColor: tone.face,
                opacity: along.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: along.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0, 84 * side] }) },
                  { translateY: along.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, -6, -54] }) },
                  { rotate: along.interpolate({ inputRange: [0, 0.25, 1], outputRange: ['0deg', `${-4 * side}deg`, `${16 * side}deg`] }) },
                  { scale: along.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.5, 1, 0.85] }) },
                ],
              },
            ]}
          >
            <View style={[styles.slipStub, { backgroundColor: tone.face }, side < 0 ? styles.slipStubRight : styles.slipStubLeft]}>
              <Icon name="ticket" size={14} color={tone.ink} />
            </View>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md - 4 },
  compactBody: { alignItems: 'center', gap: spacing.sm, minHeight: 52 },
  who: { flex: 1, alignItems: 'center', gap: spacing.md - 4 },
  names: { flex: 1, gap: 2 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  wants: { fontSize: typography.sizes.sm },
  actions: { gap: spacing.sm },
  action: { flex: 1 },
  compactActions: { alignItems: 'center', gap: spacing.xs },
  accept: { minHeight: ACCEPT_HEIGHT, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.sm },
  acceptText: { fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
  decline: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  stampSpot: { alignItems: 'center', justifyContent: 'center', minHeight: 44, alignSelf: 'flex-start', paddingHorizontal: spacing.xs },
  slipSpot: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  // a ticket in small: the paper edged in the stub's colour, the stub on the side a line starts from
  slip: { width: 64, height: 30, borderRadius: radii.xs, borderWidth: 2, overflow: 'hidden' },
  slipStub: { position: 'absolute', top: 0, bottom: 0, width: 22, alignItems: 'center', justifyContent: 'center' },
  slipStubLeft: { left: 0 },
  slipStubRight: { right: 0 },
});
