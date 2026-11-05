import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { PlayGame } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useDirection } from '../reports/direction';
import { springTo, timing, useShake } from '../theme/animate';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { Ticket, TicketBurst, ticketTone } from './Ticket';

/**
 * The invite sheet's tickets (InviteSheet.tsx): each friend picked is a small
 * ticket written out for them — their face on the stub in the game's colour,
 * their name on the paper — and Send hands them over.
 *
 * Picking one writes its ticket out: it drops into the row with a little
 * turn and settles. While the invites are on their way the tickets lift a
 * little, held out; once the server has them each ticket flies off towards
 * its friend, one after another, from a small burst where it stood. A
 * refusal (a limit, no connection) sets them back down with a shake, beside
 * the reason. A game posted in a group is one more ticket, pinned to the
 * group, with the group's glyph on its stub.
 *
 * Under Reduce Motion nothing lifts, flies, bursts or shakes: the tickets
 * are there, and then the sent ones are.
 *
 * The row shows three tickets at most; more picked than that stack into the
 * third, which counts them. The friend rows above say who is picked to a
 * screen reader, so these are not read twice.
 */

/** Whom a ticket is written out for: a friend, or the group a game is posted in. */
export interface TicketHolder {
  id: string;
  name: string;
  photoUrl: string | null;
  group?: boolean;
}

export type SendPhase = 'picking' | 'sending' | 'flying';

/** How long one ticket's flight takes, and how far behind the one before it each sets off. */
const FLY_MS = 520;
const FLY_STAGGER_MS = 90;
/** The most tickets the row shows side by side. */
const SHOWN = 3;
/** The sent tickets fanned out: each one's width, and how far along from the one before it. */
const FANNED = 112;
const FAN_STEP = 96;

/** How long the whole send takes to fly off, for the sheet to wait on before it says they were sent. */
export function flightMs(count: number, reduce: boolean): number {
  if (reduce || count === 0) return 0;
  return FLY_MS + (Math.min(count, SHOWN) - 1) * FLY_STAGGER_MS;
}

export function PickedTickets({
  game,
  holders,
  phase,
  refused,
}: {
  game: PlayGame;
  holders: readonly TicketHolder[];
  phase: SendPhase;
  /** goes up each time a send is refused, to set the tickets back down with a shake */
  refused: number;
}): React.JSX.Element | null {
  const dir = useDirection();
  const shake = useShake();
  const seen = useRef(refused);
  useEffect(() => {
    if (refused === seen.current) return;
    seen.current = refused;
    shake.run();
  }, [refused, shake]);
  // the ones there as the sheet opened (a friend already picked from a profile or a DM) are simply there
  const first = useRef(new Set(holders.map((h) => h.id))).current;
  if (holders.length === 0) return null;
  const shown = holders.length > SHOWN ? holders.slice(0, SHOWN - 1) : holders;
  const extra = holders.length - shown.length;
  return (
    <Animated.View
      style={[styles.row, { flexDirection: dir.row, transform: [{ translateX: shake.translateX }] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      {shown.map((h, i) => (
        <HolderTicket key={h.id} game={game} holder={h} index={i} phase={phase} enter={!first.has(h.id)} />
      ))}
      {extra > 0 ? <HolderTicket key="more" game={game} more={extra} index={shown.length} phase={phase} enter={false} /> : null}
    </Animated.View>
  );
}

function HolderTicket({
  game,
  holder,
  more,
  index,
  phase,
  enter,
}: {
  game: PlayGame;
  holder?: TicketHolder;
  /** the stack at the end of the row: how many more tickets are in it */
  more?: number;
  index: number;
  phase: SendPhase;
  enter: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const dir = useDirection();
  const [burst, setBurst] = useState(0);

  // written out: dropped into the row with a turn, settling on the bouncy spring
  const writing = useRef(enter && !reduce).current;
  const arrive = useRef(new Animated.Value(writing ? 0 : 1)).current;
  useEffect(() => {
    if (!writing) return;
    const run = springTo(arrive, 1, 'bouncy');
    run.start();
    return () => run.stop();
    // once, as it is written out
  }, []);

  // held out while the invites are on their way, and set down again if they are refused
  const lift = useRef(new Animated.Value(0)).current;
  const fly = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    if (phase === 'sending') springTo(lift, 1).start();
    if (phase === 'picking') springTo(lift, 0, 'bouncy').start();
    if (phase !== 'flying') return;
    const delay = Math.min(index, SHOWN - 1) * FLY_STAGGER_MS;
    const id = setTimeout(() => setBurst((n) => n + 1), delay);
    const run = timing(fly, 1, FLY_MS, { delay, easing: Easing.in(Easing.quad) });
    run.start();
    return () => {
      clearTimeout(id);
      run.stop();
    };
  }, [phase, reduce, index, lift, fly]);

  const side = dir.row === 'row-reverse' ? -1 : 1;
  const writtenOut = {
    opacity: arrive.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
    transform: [
      { translateY: arrive.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
      { rotate: arrive.interpolate({ inputRange: [0, 1], outputRange: [`${-8 * side}deg`, '0deg'] }) },
    ],
  };
  const heldOut = {
    transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }, { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
  };
  // off towards the friend: up, and out to the side a line ends on, turning as it goes
  const handedOver = {
    opacity: fly.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 1, 0] }),
    transform: [
      { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, -150] }) },
      { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, (24 + index * 10) * side] }) },
      { rotate: fly.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${17 * side}deg`] }) },
      { scale: fly.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) },
    ],
  };

  const tone = ticketTone(colors, game);
  return (
    <View style={more ? styles.moreSlot : styles.slot}>
      <Animated.View style={writtenOut}>
        <Animated.View style={heldOut}>
          <Animated.View style={handedOver}>
            <Ticket
              tone={game}
              size="mini"
              stub={
                more ? (
                  <Text style={[styles.count, { color: tone.ink }]}>+{more}</Text>
                ) : holder?.group ? (
                  <Icon name="people" size={20} color={tone.ink} />
                ) : (
                  <InitialsAvatar name={holder?.name ?? ''} id={holder?.id ?? ''} size={26} photoUrl={holder?.photoUrl ?? null} />
                )
              }
              bodyStyle={styles.body}
            >
              {holder ? (
                <Text style={[styles.name, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
                  {holder.name}
                </Text>
              ) : null}
            </Ticket>
          </Animated.View>
        </Animated.View>
      </Animated.View>
      <TicketBurst fired={burst} colour={tone.face} />
    </View>
  );
}

/**
 * The moment after Send: the tickets that went, fanned out like a hand of
 * them, and what happened in words — "Invite sent to Azad", "Invites sent:
 * 3", "Posted in the group" — which is also what a screen reader is told.
 * It settles in with a small pop; under Reduce Motion it is simply there.
 */
export function SentFan({ game, holders, text }: { game: PlayGame; holders: readonly TicketHolder[]; text: string }): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const dir = useDirection();
  const p = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    const run = springTo(p, 1, 'bouncy');
    run.start();
    return () => run.stop();
    // once, as the sent tickets are laid down
  }, []);
  const fan = holders.slice(0, SHOWN);
  const side = dir.row === 'row-reverse' ? -1 : 1;
  const middle = (fan.length - 1) / 2;
  const tone = ticketTone(colors, game);
  return (
    <View style={styles.sent}>
      <View style={[styles.fan, { width: FANNED + (fan.length - 1) * FAN_STEP }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        {fan.map((h, i) => {
          const at = i - middle;
          return (
            <Animated.View
              key={h.id}
              style={[
                styles.fanned,
                {
                  left: i * FAN_STEP,
                  // each lies over the next one's stub, so every name shows
                  zIndex: fan.length - i,
                  opacity: p.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
                  transform: [
                    { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [10, Math.abs(at) * 6] }) },
                    { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${at * 7 * side}deg`] }) },
                  ],
                },
              ]}
            >
              <Ticket
                tone={game}
                size="mini"
                stub={h.group ? <Icon name="people" size={20} color={tone.ink} /> : <InitialsAvatar name={h.name} id={h.id} size={26} photoUrl={h.photoUrl} />}
                bodyStyle={styles.body}
                style={styles.fanTicket}
              >
                <Text style={[styles.name, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
                  {h.name}
                </Text>
              </Ticket>
            </Animated.View>
          );
        })}
      </View>
      <View style={[styles.sentLine, { flexDirection: dir.row }]}>
        <Icon name="check" size={16} color={colors.success} />
        <Text style={[styles.sentText, { color: colors.success }]} accessibilityLiveRegion="polite">
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, alignItems: 'center' },
  slot: { flex: 1, maxWidth: 160 },
  moreSlot: { width: 72 },
  body: { justifyContent: 'center', minHeight: 40 },
  name: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  count: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  sent: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  fan: { height: 60, maxWidth: '100%' },
  fanned: { position: 'absolute', top: 0 },
  fanTicket: { width: FANNED },
  sentLine: { alignItems: 'center', gap: spacing.xs },
  sentText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
});
