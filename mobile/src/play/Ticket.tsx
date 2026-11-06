import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import type { PlayGame } from '@kurda/shared';
import { AA_LARGE } from '../a11y/contrast';
import { ensureContrast } from '../a11y/ensureContrast';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useDirection } from '../reports/direction';
import { springTo, timing } from '../theme/animate';
import { Icon } from '../theme/Icon';
import { duration } from '../theme/motion';
import type { Palette } from '../theme/palette';
import { tileButtonTone, tileTone, type TileTone } from '../theme/tileTones';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { codeTone, filledTone } from './joinCode';

/**
 * The ticket every invitation is drawn as: a game's join code in its lobby,
 * an invite to play sent or received, a game posted in a chat, the friends a
 * host has asked, and a friend request. One shell, so they cannot drift into
 * five kinds of ticket.
 *
 * A ticket is paper with a coloured stub on the side a line starts from (the
 * right in Soranî and Arabic), torn along a perforation: a dashed rule with a
 * notch bitten out of each edge, the page showing through. The stub is in the
 * colour of what the ticket is for — a game's own colour (joinCode.ts:
 * Peyvok Battle's green, Rhyme Match's gold, a story's ink), or the brand's
 * ink for a friendship — and turns a quiet grey once the ticket is spent.
 *
 * The moments a ticket has are drawn here too, so each screen says what
 * happened rather than how it moves: the stub torn off (an invite taken up),
 * a stamp landing on it ("Joined", "Friends"), a hole punched through the
 * stub (a game that is over), and a gentle light crossing a ticket still
 * waiting for an answer — only while the screen is in front. Under Reduce
 * Motion nothing travels: a torn stub is simply gone, a stamp is simply
 * there, and nothing crosses a waiting ticket.
 *
 * The stub and the paper are cut separately, each holding its half of the
 * two notches, so a stub can leave the paper when it is torn off rather than
 * being clipped where it stood.
 */

/** What a ticket is for: a game, by its colour, or a friendship. */
export type TicketTone = PlayGame | 'friend';

/** The stub's fill and the ink on it; a spent ticket's stub is the quiet grey of a button with nothing to press. */
export function ticketTone(colors: Palette, tone: TicketTone, muted = false): TileTone {
  if (muted) return tileButtonTone(colors, 'primary', false);
  return tone === 'friend' ? filledTone(colors, colors.primary) : codeTone(colors, tone);
}

/** The perforation's dashed rule, in the quiet grey of an idle tile's edge (theme/tileTones). */
export function ticketRule(colors: Palette): string {
  return tileTone(colors, 'idle').edge;
}

/** How long a stub takes to come off. */
export const TEAR_MS = 380;

/** Each size's measurements: the stub's width, the notch, the corner, the punched hole. */
const SIZE = {
  regular: { stub: 60, notch: 22, radius: radii.lg, hole: 10, dash: '6 6', pad: spacing.md },
  mini: { stub: 44, notch: 12, radius: radii.md, hole: 6, dash: '4 4', pad: spacing.sm },
} as const;

export type TicketSize = keyof typeof SIZE;

export function Ticket({
  tone,
  stub,
  children,
  size = 'regular',
  muted = false,
  outlined = false,
  punched = false,
  torn = false,
  shimmer = false,
  lifted = false,
  paper,
  ground,
  style,
  bodyStyle,
  ...rest
}: ViewProps & {
  tone: TicketTone;
  /** what the stub carries — a game's glyph, a friend's face — given the stub's own colours */
  stub: ReactNode | ((ink: TileTone) => ReactNode);
  children: ReactNode;
  size?: TicketSize;
  /** spent: answered, run out, over */
  muted?: boolean;
  /** still waiting: drawn as an outline in its colour rather than filled */
  outlined?: boolean;
  /** a hole through the stub, as a conductor punches a used ticket */
  punched?: boolean;
  /** the stub comes off along the perforation */
  torn?: boolean;
  /** a light that crosses the paper every few seconds, for a ticket waiting on somebody */
  shimmer?: boolean;
  /** floating over the screen rather than lying in a list */
  lifted?: boolean;
  /** the paper, where the ticket lies on something other than the page */
  paper?: string;
  /** what shows through the notches: whatever the ticket lies on */
  ground?: string;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const m = SIZE[size];
  const mirror = dir.row === 'row-reverse';
  const fill = ticketTone(colors, tone, muted);
  const face = paper ?? colors.surface;
  const page = ground ?? colors.background;

  // the stub coming off: a short pull away from the paper, turning as it goes
  const rip = useRef(new Animated.Value(torn ? 1 : 0)).current;
  useEffect(() => {
    if (!torn) {
      rip.setValue(0);
      return;
    }
    if (reduce) {
      rip.setValue(1);
      return;
    }
    const run = timing(rip, 1, TEAR_MS, { easing: Easing.out(Easing.quad) });
    run.start();
    return () => run.stop();
  }, [torn, reduce, rip]);
  const away = mirror ? 1 : -1;
  const stubMotion = reduce
    ? { opacity: rip.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }
    : {
        opacity: rip.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 1, 0] }),
        transform: [
          { translateX: rip.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 3 * away, 34 * away] }) },
          { translateY: rip.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0, 22] }) },
          { rotate: rip.interpolate({ inputRange: [0, 0.25, 1], outputRange: ['0deg', `${2 * away}deg`, `${18 * away}deg`] }) },
        ],
      };

  const outer = (side: 'start' | 'end'): ViewStyle => {
    const left = (side === 'start') !== mirror;
    return left
      ? { borderTopLeftRadius: m.radius, borderBottomLeftRadius: m.radius }
      : { borderTopRightRadius: m.radius, borderBottomRightRadius: m.radius };
  };
  // the side of each part that meets the perforation
  const stubSeam = mirror ? 'left' : 'right';
  const bodySeam = mirror ? 'right' : 'left';
  const outline = outlined ? { borderWidth: 2, borderColor: fill.face } : null;
  // on an outlined stub the glyph is in the ticket's colour, darkened (or lightened) until it reads on the paper
  const outlineInk = ensureContrast(fill.face, face, AA_LARGE);
  const notch = { width: m.notch, height: m.notch, backgroundColor: page };

  return (
    <View {...rest} style={[styles.ticket, { flexDirection: dir.row }, lifted && [styles.lifted, { shadowColor: colors.softShadow }], style]}>
      <Animated.View
        style={[
          styles.stub,
          outer('start'),
          { width: m.stub, backgroundColor: outlined ? face : fill.face },
          outline,
          outlined ? { [mirror ? 'borderLeftWidth' : 'borderRightWidth']: 0 } : null,
          lifted && styles.raised,
          stubMotion,
        ]}
      >
        {typeof stub === 'function' ? stub(outlined ? { ...fill, ink: outlineInk } : fill) : stub}
        {punched ? (
          <View
            style={[styles.hole, { width: m.hole, height: m.hole, left: (m.stub - m.hole) / 2, top: m.notch / 2 + 2, backgroundColor: page }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            aria-hidden
          />
        ) : null}
        <View style={[styles.notch, notch, { top: -m.notch / 2, [stubSeam]: -m.notch / 2 }]} />
        <View style={[styles.notch, notch, { bottom: -m.notch / 2, [stubSeam]: -m.notch / 2 }]} />
      </Animated.View>
      <View
        style={[
          styles.body,
          outer('end'),
          { backgroundColor: face, padding: m.pad, [mirror ? 'paddingRight' : 'paddingLeft']: m.pad + 2 },
          outline,
          outlined ? { [mirror ? 'borderRightWidth' : 'borderLeftWidth']: 0 } : null,
          lifted && styles.raised,
          bodyStyle,
        ]}
      >
        {shimmer ? <Shimmer colour={fill.face} /> : null}
        <Perforation vertical dash={m.dash} style={{ [bodySeam]: 0, top: m.notch / 2 + 3, bottom: m.notch / 2 + 3 }} />
        <View style={[styles.notch, notch, { top: -m.notch / 2, [bodySeam]: -m.notch / 2 }]} />
        <View style={[styles.notch, notch, { bottom: -m.notch / 2, [bodySeam]: -m.notch / 2 }]} />
        {children}
      </View>
    </View>
  );
}

/** A dashed rule, down the paper's edge where the stub meets it, or across it (TicketTear). */
function Perforation({ vertical = false, dash, style }: { vertical?: boolean; dash: string; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const rule = ticketRule(colors);
  return (
    <View
      pointerEvents="none"
      style={[vertical ? styles.ruleDown : styles.ruleAcross, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <Svg width={vertical ? 2 : '100%'} height={vertical ? '100%' : 2}>
        {vertical ? (
          <Line x1="1" y1="0" x2="1" y2="100%" stroke={rule} strokeWidth={2} strokeDasharray={dash} strokeLinecap="round" />
        ) : (
          <Line x1="0" y1="1" x2="100%" y2="1" stroke={rule} strokeWidth={2} strokeDasharray={dash} strokeLinecap="round" />
        )}
      </Svg>
    </View>
  );
}

/**
 * The tear line across a ticket that is one piece of paper top to bottom (the
 * join code's): a notch cut from each side and the dashed rule between them.
 * `inset` is the padding of the surface it crosses, so the notches reach its
 * edges; the notches are the page showing through, so they are drawn in the
 * page's colour.
 */
export function TicketTear({ inset = spacing.lg, ground }: { inset?: number; ground?: string }): React.JSX.Element {
  const { colors } = useTheme();
  const n = SIZE.regular.notch;
  const notch = { width: n, height: n, borderRadius: radii.pill, backgroundColor: ground ?? colors.background };
  return (
    <View style={[styles.across, { height: n, marginHorizontal: -inset }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <View style={[notch, { marginLeft: -n / 2 }]} />
      <View style={styles.acrossRule}>
        <Perforation dash={SIZE.regular.dash} />
      </View>
      <View style={[notch, { marginRight: -n / 2 }]} />
    </View>
  );
}

/** How often the light crosses a waiting ticket, and how long it takes to cross. */
const SHIMMER_EVERY_MS = 2600;
const SHIMMER_MS = 1300;

/**
 * The light over a ticket still waiting for an answer: a soft band in the
 * ticket's own colour, every few seconds. It rests while the screen is not
 * in front, and under Reduce Motion it never starts.
 */
function Shimmer({ colour }: { colour: string }): React.JSX.Element {
  const alive = useMotionAlive();
  const [width, setWidth] = useState(0);
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!alive || width === 0) return;
    const loop = Animated.loop(Animated.sequence([Animated.delay(SHIMMER_EVERY_MS), timing(p, 1, SHIMMER_MS, { easing: Easing.inOut(Easing.quad) })]));
    loop.start();
    return () => {
      loop.stop();
      p.setValue(0);
    };
  }, [alive, width, p]);
  const band = Math.max(24, Math.round(width * 0.35));
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <Animated.View
        style={[
          styles.band,
          {
            width: band,
            backgroundColor: colour,
            opacity: p.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.16, 0.16, 0] }),
            transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [-band * 1.5, width + band] }) }, { skewX: '-20deg' }],
          },
        ]}
      />
    </View>
  );
}

/**
 * Whether `value` has changed since the component first had it — from the
 * first render, or from the first one where `ready` (the data has arrived).
 * A stamp that lands while somebody watches lands with a thump, and one that
 * was already there when they arrived is simply there: a chat scrolled
 * through does not thump at every card.
 */
export function useChangedSinceMount<T>(value: T, ready = true): boolean {
  const first = useRef<{ value: T } | null>(null);
  if (ready && first.current === null) first.current = { value };
  return first.current !== null && value !== first.current.value;
}

/**
 * A rubber stamp on a ticket — "Joined", "Friends", "Finished" — in the
 * colour of what it says: the green of something done, or the quiet grey of
 * something over. `land` brings it down from above with a small thump; under
 * Reduce Motion, and when it was already there, it is simply there.
 */
export function TicketStamp({ label, tone, land = false }: { label: string; tone: 'success' | 'muted'; land?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const play = land && !reduce;
  const v = useRef(new Animated.Value(play ? 0 : 1)).current;
  useEffect(() => {
    if (!play) {
      v.setValue(1);
      return;
    }
    const run = springTo(v, 1, 'bouncy', 60);
    run.start();
    return () => run.stop();
    // once, as it lands
  }, []);
  const colour = tone === 'success' ? colors.success : colors.textSecondary;
  return (
    <Animated.View
      style={[
        styles.stamp,
        {
          borderColor: colour,
          opacity: v.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
          transform: [
            { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-16deg', '-8deg'] }) },
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1.9, 1] }) },
          ],
        },
      ]}
    >
      <Text style={[styles.stampText, { color: colour }]} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

/** Where the sparks of a burst fly to. */
const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(a), y: Math.sin(a) };
});

/**
 * A small burst of sparks from the middle of whatever it is laid over: a
 * ticket handed over, a friendship accepted. Played each time `fired` goes
 * up; nothing under Reduce Motion, where the change itself says it.
 */
export function TicketBurst({ fired, colour, reach = 44 }: { fired: number; colour: string; reach?: number }): React.JSX.Element | null {
  const reduce = useReducedMotion();
  const p = useRef(new Animated.Value(1)).current;
  const seen = useRef(fired);
  useEffect(() => {
    if (fired === seen.current) return;
    seen.current = fired;
    if (reduce) return;
    p.setValue(0);
    timing(p, 1, duration.slow + 160).start();
  }, [fired, reduce, p]);
  if (reduce) return null;
  const opacity = p.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 0] });
  return (
    <View pointerEvents="none" style={styles.burst} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      {SPARKS.map((s, i) => (
        <Animated.View
          key={i}
          style={[
            styles.spark,
            {
              backgroundColor: colour,
              opacity,
              transform: [
                { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [s.x * reach * 0.3, s.x * reach] }) },
                { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [s.y * reach * 0.3, s.y * reach] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * The ticket glyph on a small disc in the ticket's colour, ringed in what it
 * sits on: the corner of a face in a list, to say this row is an invitation.
 */
export function TicketBadge({ tone, size = 18, ring }: { tone: TicketTone; size?: number; ring: string }): React.JSX.Element {
  const { colors } = useTheme();
  const fill = ticketTone(colors, tone);
  return (
    <View
      style={[styles.badge, { width: size, height: size, backgroundColor: fill.face, borderColor: ring }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <Icon name="ticket" size={Math.round(size * 0.6)} color={fill.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: { alignItems: 'stretch' },
  lifted: { shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 18 },
  raised: { elevation: 6 },
  stub: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, overflow: 'hidden' },
  notch: { position: 'absolute', borderRadius: radii.pill },
  hole: { position: 'absolute', borderRadius: radii.pill },
  ruleDown: { position: 'absolute', width: 2 },
  ruleAcross: { height: 2 },
  across: { flexDirection: 'row', alignItems: 'center' },
  acrossRule: { flex: 1, marginHorizontal: spacing.sm },
  band: { position: 'absolute', top: -12, bottom: -12, left: 0 },
  stamp: { borderWidth: 2, borderRadius: radii.xs, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  stampText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, letterSpacing: 0.4 },
  burst: { position: 'absolute', top: '50%', left: '50%', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute', width: 5, height: 5, borderRadius: radii.pill },
  badge: { borderRadius: radii.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
