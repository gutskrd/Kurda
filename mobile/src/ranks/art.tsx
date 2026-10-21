import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  SEASON_FRAME_INNER,
  SEASON_FRAME_SHINE,
  badgeShineSvg,
  badgeShines,
  badgeSvg,
  hasBadgeArt,
  leagueEmblemSvg,
  placementEmblemSvg,
  rankEmblemSvg,
  seasonFrameShineSvg,
  seasonFrameSvg,
  type ArtBadgeKey,
  type ArtBadgeTier,
  type ArtSeason,
  type BadgeState,
  type Division,
  type LeagueTier,
  type RankTier,
} from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';

/**
 * The phone's half of the art drawn by code (contract 4 §B3): the same SVG
 * strings the browser inlines, drawn here with `SvgXml`, so a Gir II emblem
 * is the same pixels in both apps.
 *
 * Every picture is one image to a screen reader, named by the caller in the
 * reader's language (the art's own default titles are Kurmancî and English).
 * The shine layers laid over a badge or a frame are decoration: hidden from
 * screen readers, played on the native driver, and not played at all under
 * Reduce Motion — a frame then wears its one still glint instead.
 */

const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

let drawings = 0;
/**
 * An id prefix of this drawing's own. The art's default prefix is a hash of
 * what was drawn, so two Gir II emblems share their gradient ids — harmless
 * on a phone, where each SVG is its own document, but in the browser build
 * a screen left behind in the stack (hidden, still in the page) would own
 * the ids the visible emblem points at, and the visible one would lose its
 * fills. One prefix per drawing keeps every reference to its own defs.
 */
function useArtId(): string {
  const id = useRef<string | null>(null);
  if (id.current === null) {
    drawings += 1;
    id.current = `hva${drawings.toString(36)}`;
  }
  return id.current;
}

/** One drawing, as one named image. */
function Art({ xml, size, label, style }: { xml: string; size: number; label: string; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={[{ width: size, height: size }, style]}>
      <View {...HIDDEN} pointerEvents="none">
        <SvgXml xml={xml} width={size} height={size} />
      </View>
    </View>
  );
}

export function RankEmblem({
  tier,
  division,
  size,
  label,
  season,
  style,
}: {
  tier: RankTier;
  division?: Division | null;
  size: number;
  /** the translated name, "Gir II (Hill)" */
  label: string;
  /** a season's emblem shows the season under the medallion instead of the division */
  season?: { name: ArtSeason; year: number };
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const idPrefix = useArtId();
  const xml = useMemo(
    () => rankEmblemSvg({ tier, division: division ?? undefined, size, title: label, season, idPrefix }),
    [tier, division, size, label, season, idPrefix],
  );
  return <Art xml={xml} size={size} label={label} style={style} />;
}

export function PlacementEmblem({ done, size, label, style }: { done: number; size: number; label: string; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const idPrefix = useArtId();
  const xml = useMemo(
    () => placementEmblemSvg({ done: Math.max(0, Math.min(5, Math.round(done))), size, title: label, idPrefix }),
    [done, size, label, idPrefix],
  );
  return <Art xml={xml} size={size} label={label} style={style} />;
}

export function LeagueEmblem({
  tier,
  size,
  label,
  locked = false,
  style,
}: {
  tier: LeagueTier;
  size: number;
  label: string;
  /** not reached yet: its outline in the screen's quiet grey, with a keyhole */
  locked?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const idPrefix = useArtId();
  const { colors } = useTheme();
  const body = locked ? colors.locked : null;
  const mark = locked ? colors.lockedMark : null;
  const xml = useMemo(
    () => leagueEmblemSvg({ tier, size, title: label, idPrefix, ...(body && mark ? { locked: { body, mark } } : {}) }),
    [tier, size, label, idPrefix, body, mark],
  );
  return <Art xml={xml} size={size} label={label} style={style} />;
}

/** How a badge's glint plays: once (as it is earned, or tapped), on a slow loop, or not at all. */
export type ShinePlay = 'once' | 'loop' | false;

/**
 * A badge medallion. `tier` 0 is a badge not yet earned (the quiet outline);
 * `hidden` a secret not yet found (the midnight gem with its "?").
 */
export function BadgeMedal({
  badgeKey,
  tier,
  tierCount,
  hidden = false,
  size,
  label,
  shine = false,
  shineKey,
  style,
}: {
  badgeKey: string;
  tier: number;
  tierCount: number;
  hidden?: boolean;
  size: number;
  label: string;
  shine?: ShinePlay;
  /** a new value plays a 'once' glint again (a tap, the next badge in a queue) */
  shineKey?: number | string;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element | null {
  const known = hasBadgeArt(badgeKey);
  const state: BadgeState = hidden ? 'secret' : tier > 0 ? 'earned' : 'locked';
  const artTier = Math.max(1, Math.min(4, tier || 1)) as ArtBadgeTier;
  const idPrefix = useArtId();
  const xml = useMemo(
    () => (known ? badgeSvg({ key: badgeKey as ArtBadgeKey, tier: artTier, state, size, tiers: tierCount > 1 ? 4 : 1, title: label, idPrefix }) : null),
    [known, badgeKey, artTier, state, size, tierCount, label, idPrefix],
  );
  if (!xml || !known) return null;
  const glints = state === 'earned' && shine !== false && badgeShines(badgeKey as ArtBadgeKey, artTier, tierCount > 1 ? 4 : 1);
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Art xml={xml} size={size} label={label} />
      {glints ? <BadgeGlint key={String(shineKey ?? 'glint')} badgeKey={badgeKey} size={size} play={shine} /> : null}
    </View>
  );
}

/** Where the glint is drawn on its way across; stepping through them is the sweep. */
const GLINT_PHASES = [0.12, 0.27, 0.42, 0.57, 0.72, 0.87] as const;
const GLINT_STEP_MS = 85;
/** A looping glint rests this long between passes: a gleam now and then, not a strobe. */
const GLINT_REST_MS = 3400;

/**
 * The glint, as six still frames of the band of light at points across the
 * medallion, each faded in and out in turn on the native driver: the eye reads
 * a sweep, and nothing is redrawn while it plays.
 */
function BadgeGlint({ badgeKey, size, play }: { badgeKey: string; size: number; play: Exclude<ShinePlay, false> }): React.JSX.Element | null {
  const reduce = useReducedMotion();
  const idPrefix = useArtId();
  const frames = useMemo(
    () => (hasBadgeArt(badgeKey) ? GLINT_PHASES.map((phase, i) => badgeShineSvg({ key: badgeKey as ArtBadgeKey, size, phase, idPrefix: `${idPrefix}g${i}` })) : []),
    [badgeKey, size, idPrefix],
  );
  const values = useRef(GLINT_PHASES.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduce) return;
    const pass = Animated.stagger(
      GLINT_STEP_MS,
      values.map((v) =>
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: GLINT_STEP_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: GLINT_STEP_MS * 2, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    const run = play === 'loop' ? Animated.loop(Animated.sequence([Animated.delay(900), pass, Animated.delay(GLINT_REST_MS)])) : Animated.sequence([Animated.delay(250), pass]);
    run.start();
    return () => run.stop();
  }, [reduce, play, values]);
  if (reduce) return null;
  return (
    <View {...HIDDEN} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {frames.map((xml, i) => (
        <Animated.View key={i} style={[StyleSheet.absoluteFill, { opacity: values[i] }]}>
          <SvgXml xml={xml} width={size} height={size} />
        </Animated.View>
      ))}
    </View>
  );
}

/** The rank tier a season frame SKU is for (`frame_rank_gir`, `frame_rank_lutke_animated`), or null. */
export function frameTierOf(sku: string | null | undefined): RankTier | null {
  const m = /^frame_rank_(dest|gir|zozan|ciya|lutke|sterk)(_animated)?$/.exec(sku ?? '');
  return m ? (m[1] as RankTier) : null;
}

/** How long the frame's glint takes to go once round. */
const FRAME_TURN_MS = 7000;

/**
 * An avatar inside a season frame. The frame is the outer `size`; the avatar
 * is drawn at the frame's inner diameter, centred. Lûtke's and Stêrk's frames
 * carry a glint that travels round the ring; under Reduce Motion it stands
 * still where the art bakes it in.
 */
export function SeasonFramed({
  tier,
  size,
  label,
  children,
  style,
}: {
  tier: RankTier;
  size: number;
  label: string;
  /** the avatar, drawn at `framedAvatarSize(size)` */
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const turns = SEASON_FRAME_SHINE[tier];
  const idPrefix = useArtId();
  const xml = useMemo(() => seasonFrameSvg({ tier, size, shine: turns && reduce, title: label, idPrefix }), [tier, size, turns, reduce, label, idPrefix]);
  const glint = useMemo(
    () => (turns && !reduce ? seasonFrameShineSvg({ tier, size, idPrefix: `${idPrefix}s` }) : null),
    [tier, size, turns, reduce, idPrefix],
  );
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!glint) return;
    spin.setValue(0);
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: FRAME_TURN_MS, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [glint, spin]);
  const inner = framedAvatarSize(size);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <View style={{ width: inner, height: inner }}>{children}</View>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Art xml={xml} size={size} label={label} />
      </View>
      {glint ? (
        <Animated.View {...HIDDEN} pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
          <SvgXml xml={glint} width={size} height={size} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The avatar's diameter inside a frame of `size`. */
export function framedAvatarSize(size: number): number {
  return Math.round(size * SEASON_FRAME_INNER);
}
