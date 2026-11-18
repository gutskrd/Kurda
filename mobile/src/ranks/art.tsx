import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  SEASON_FRAME_INNER,
  SEASON_FRAME_SHINE,
  badgeLevelName,
  badgeShineSvg,
  badgeShines,
  badgeSvg,
  dayMedalSvg,
  hasBadgeArt,
  leagueEmblemSvg,
  placementEmblemSvg,
  rankEmblemSvg,
  seasonFrameShineSvg,
  seasonFrameSvg,
  streakMedalSvg,
  type ArtBadgeKey,
  type ArtBadgeTier,
  type ArtSeason,
  type ArtSlotFamily,
  type BadgeState,
  type DayMedal,
  type Division,
  type LeagueTier,
  type RankTier,
} from '@kurda/shared';
import { useScreenAwake } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { assetUrl } from '../api/env';
import { useArtOverride } from '../art/overrides';
import { useTheme } from '../theme/ThemeProvider';

/**
 * The phone's half of the rank art: the same SVG strings the browser inlines, drawn with `SvgXml`, so an emblem is the
 * same pixels in both apps. Each picture is one image to a screen reader, named by the caller; shine layers are
 * decoration, hidden from screen readers, on the native driver, and not played under Reduce Motion (a frame then shows
 * its one still glint).
 *
 * Any of these replaced with an uploaded picture (a "picture slot", art/overrides.ts) is drawn from that picture in the
 * same box and under the same name; with no picture, or one that fails to load, the code's art is drawn. The placement
 * emblem and an unfound secret badge are always the code's own.
 */

const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

let drawings = 0;
/**
 * An id prefix of this drawing's own. The art's default prefix hashes what was drawn, so identical emblems share
 * gradient ids; in the browser build a screen left hidden in the stack would own the ids the visible emblem points at,
 * and the visible one would lose its fills.
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

/**
 * The medal a kept streak is handed: the gold pentagon with its laurel (shared art/medals.ts). `unlit` is the same
 * medal in greys, until today's lesson lights it.
 */
export function StreakMedal({ size, label, unlit = false }: { size: number; label: string; unlit?: boolean }): React.JSX.Element {
  const idPrefix = useArtId();
  const xml = useMemo(() => streakMedalSvg({ size, title: label, idPrefix, unlit }), [size, label, idPrefix, unlit]);
  return <Art xml={xml} size={size} label={label} />;
}

/** A day's medal in the streak's week: gold with the laurel for a day learned, ice with a snowflake for one a freeze kept. */
export function DayMedalArt({ kind, size, label }: { kind: DayMedal; size: number; label: string }): React.JSX.Element {
  const idPrefix = useArtId();
  const xml = useMemo(() => dayMedalSvg({ kind, size, title: label, idPrefix }), [kind, size, label, idPrefix]);
  return <Art xml={xml} size={size} label={label} />;
}

/** A slot's uploaded picture, until it fails to load: then the shipped art is drawn rather than a hole. */
function usePicture(family: ArtSlotFamily, key: string, level?: string | null): [string | null, () => void] {
  const uri = useArtOverride(family, key, level);
  const [failed, setFailed] = useState<string | null>(null);
  const onError = useCallback(() => setFailed(uri), [uri]);
  return [uri !== null && uri !== failed ? uri : null, onError];
}

/**
 * How a picture not reached yet is drawn: faded, and greyscale where the platform supports filters, as the art's own
 * locked outline is grey.
 */
const LOCKED_PICTURE: ViewStyle = { opacity: 0.4, filter: 'grayscale(1)' };

/** An uploaded picture in place of a drawing: the same box, and the same one image to a screen reader. */
function Picture({
  uri,
  size,
  label,
  locked = false,
  onError,
  style,
}: {
  uri: string;
  size: number;
  label: string;
  locked?: boolean;
  onError: () => void;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={[{ width: size, height: size }, style]}>
      <View {...HIDDEN} pointerEvents="none" style={locked ? LOCKED_PICTURE : null}>
        <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="contain" onError={onError} accessibilityIgnoresInvertColors />
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
  /** The translated name, "Gir II (Hill)" */
  label: string;
  /** A season's emblem shows the season under the medallion instead of the division. */
  season?: { name: ArtSeason; year: number };
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const idPrefix = useArtId();
  const [picture, onError] = usePicture('rank', tier);
  // Nothing is drawn by code while an uploaded picture stands in for it.
  const xml = useMemo(
    () => (picture ? '' : rankEmblemSvg({ tier, division: division ?? undefined, size, title: label, season, idPrefix })),
    [picture, tier, division, size, label, season, idPrefix],
  );
  if (picture) return <Picture uri={picture} size={size} label={label} onError={onError} style={style} />;
  return <Art xml={xml} size={size} label={label} style={style} />;
}

export function PlacementEmblem({ done, size, label }: { done: number; size: number; label: string }): React.JSX.Element {
  const idPrefix = useArtId();
  const xml = useMemo(
    () => placementEmblemSvg({ done: Math.max(0, Math.min(5, Math.round(done))), size, title: label, idPrefix }),
    [done, size, label, idPrefix],
  );
  return <Art xml={xml} size={size} label={label} />;
}

export function LeagueEmblem({
  tier,
  size,
  label,
  locked = false,
}: {
  tier: LeagueTier;
  size: number;
  label: string;
  /** Not reached yet: its outline in the screen's quiet grey, with a keyhole. */
  locked?: boolean;
}): React.JSX.Element {
  const idPrefix = useArtId();
  const { colors } = useTheme();
  const [picture, onError] = usePicture('league', tier);
  const body = locked ? colors.locked : null;
  const mark = locked ? colors.lockedMark : null;
  const xml = useMemo(
    () => (picture ? '' : leagueEmblemSvg({ tier, size, title: label, idPrefix, ...(body && mark ? { locked: { body, mark } } : {}) })),
    [picture, tier, size, label, idPrefix, body, mark],
  );
  if (picture) return <Picture uri={picture} size={size} label={label} locked={locked} onError={onError} />;
  return <Art xml={xml} size={size} label={label} />;
}

/** How a badge's glint plays: once (as it is earned, or tapped), on a slow loop, or not at all. */
export type ShinePlay = 'once' | 'loop' | false;

/**
 * A badge medallion. `tier` 0 is a badge not yet earned (the quiet outline); `hidden` a secret not yet found (the
 * midnight gem with its "?"). An uploaded picture is looked up by level (the level's own, then the badge's), greyed
 * while not earned, and has no glint. An unfound secret never shows its picture, which would give the secret away.
 */
export function BadgeMedal({
  badgeKey,
  tier,
  tierCount,
  hidden = false,
  size,
  label,
  shine = false,
}: {
  badgeKey: string;
  tier: number;
  tierCount: number;
  hidden?: boolean;
  size: number;
  label: string;
  shine?: ShinePlay;
}): React.JSX.Element | null {
  const known = hasBadgeArt(badgeKey);
  const state: BadgeState = hidden ? 'secret' : tier > 0 ? 'earned' : 'locked';
  const artTier = Math.max(1, Math.min(4, tier || 1)) as ArtBadgeTier;
  const idPrefix = useArtId();
  const [uploaded, onError] = usePicture('badge', badgeKey, tierCount > 1 ? badgeLevelName(artTier) : null);
  const picture = state === 'secret' ? null : uploaded;
  const xml = useMemo(
    () =>
      known && !picture
        ? badgeSvg({ key: badgeKey as ArtBadgeKey, tier: artTier, state, size, tiers: tierCount > 1 ? 4 : 1, title: label, idPrefix })
        : null,
    [known, picture, badgeKey, artTier, state, size, tierCount, label, idPrefix],
  );
  if (picture) return <Picture uri={picture} size={size} label={label} locked={state === 'locked'} onError={onError} />;
  if (!xml || !known) return null;
  const glints = state === 'earned' && shine !== false && badgeShines(badgeKey as ArtBadgeKey, artTier, tierCount > 1 ? 4 : 1);
  return (
    <View style={{ width: size, height: size }}>
      <Art xml={xml} size={size} label={label} />
      {glints ? <BadgeGlint badgeKey={badgeKey} size={size} play={shine} /> : null}
    </View>
  );
}

/** Where the glint is drawn on its way across; stepping through them is the sweep. */
const GLINT_PHASES = [0.12, 0.27, 0.42, 0.57, 0.72, 0.87] as const;
const GLINT_STEP_MS = 85;
/** A looping glint rests this long between passes: a gleam now and then, not a strobe. */
const GLINT_REST_MS = 3400;

/**
 * The glint as six still frames of the light band across the medallion, each faded in and out in turn on the native
 * driver: the eye reads a sweep, and nothing is redrawn.
 */
function BadgeGlint({ badgeKey, size, play }: { badgeKey: string; size: number; play: Exclude<ShinePlay, false> }): React.JSX.Element | null {
  const reduce = useReducedMotion();
  const idPrefix = useArtId();
  const frames = useMemo(
    () => (hasBadgeArt(badgeKey) ? GLINT_PHASES.map((phase, i) => badgeShineSvg({ key: badgeKey as ArtBadgeKey, size, phase, idPrefix: `${idPrefix}g${i}` })) : []),
    [badgeKey, size, idPrefix],
  );
  const values = useRef(GLINT_PHASES.map(() => new Animated.Value(0))).current;
  // A looping glint comes round again only while its screen is in front; one that plays once is left to finish.
  const awake = useScreenAwake();
  const watched = play !== 'loop' || awake;
  useEffect(() => {
    if (reduce || !watched) return;
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
    return () => {
      run.stop();
      for (const v of values) v.setValue(0);
    };
  }, [reduce, watched, play, values]);
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
 * An avatar inside a season frame: the frame is the outer `size`, the avatar its inner diameter, centred. Lûtke's and
 * Stêrk's frames carry a glint that travels round the ring, standing still under Reduce Motion. A frame replaced with
 * an uploaded ring is that picture laid over the avatar (its middle is see-through), without the glint.
 */
export function SeasonFramed({
  tier,
  size,
  label,
  children,
}: {
  tier: RankTier;
  size: number;
  label: string;
  /** The avatar, drawn at `framedAvatarSize(size)` */
  children: ReactNode;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const [picture, onError] = usePicture('frame', tier);
  const turns = SEASON_FRAME_SHINE[tier];
  const idPrefix = useArtId();
  const xml = useMemo(
    () => (picture ? '' : seasonFrameSvg({ tier, size, shine: turns && reduce, title: label, idPrefix })),
    [picture, tier, size, turns, reduce, label, idPrefix],
  );
  const glint = useMemo(
    () => (turns && !reduce && !picture ? seasonFrameShineSvg({ tier, size, idPrefix: `${idPrefix}s` }) : null),
    [tier, size, turns, reduce, picture, idPrefix],
  );
  const spin = useRef(new Animated.Value(0)).current;
  // The glint goes round the ring only while somebody can see it.
  const awake = useScreenAwake();
  useEffect(() => {
    if (!glint || !awake) return;
    spin.setValue(0);
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: FRAME_TURN_MS, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [glint, awake, spin]);
  const inner = framedAvatarSize(size);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: inner, height: inner }}>{children}</View>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {picture ? <Picture uri={picture} size={size} label={label} onError={onError} /> : <Art xml={xml} size={size} label={label} />}
      </View>
      {glint ? (
        <Animated.View {...HIDDEN} pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
          <SvgXml xml={glint} width={size} height={size} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * An avatar inside a frame from the shop: the frame's picture (a ring with an empty middle) over the avatar at the
 * outer `size`, the avatar at a season frame's inner diameter. A picture that fails to load leaves the avatar unframed
 * in the same place. The ring is decoration, since whatever it is on already says whose it is.
 */
export function PictureFramed({
  url,
  size,
  children,
}: {
  /** The site path the API sends (`/cosmetics/frames/…`) or a whole address. */
  url: string;
  size: number;
  /** The avatar, drawn at `framedAvatarSize(size)` */
  children: ReactNode;
}): React.JSX.Element {
  const uri = assetUrl(url);
  const [broken, setBroken] = useState<string | null>(null);
  const inner = framedAvatarSize(size);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: inner, height: inner }}>{children}</View>
      {uri && uri !== broken ? (
        <View {...HIDDEN} pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="contain" onError={() => setBroken(uri)} accessibilityIgnoresInvertColors />
        </View>
      ) : null}
    </View>
  );
}

/**
 * An avatar in whatever frame is worn: a season frame from its SKU, a shop frame from its picture, or the avatar alone,
 * so a screen need not ask which. `label` names a season frame by its tier, for a screen reader.
 */
export function Framed({
  sku,
  url,
  size,
  label,
  children,
}: {
  sku: string | null | undefined;
  /** A shop frame's picture; a season frame has none. */
  url?: string | null;
  /** The frame's outer size; the avatar inside is `framedAvatarSize(size)` */
  size: number;
  label: (tier: RankTier) => string;
  children: ReactNode;
}): React.JSX.Element {
  const tier = frameTierOf(sku);
  if (tier) {
    return (
      <SeasonFramed tier={tier} size={size} label={label(tier)}>
        {children}
      </SeasonFramed>
    );
  }
  if (sku && url) {
    return (
      <PictureFramed url={url} size={size}>
        {children}
      </PictureFramed>
    );
  }
  return <>{children}</>;
}

/** The avatar's diameter inside a frame of `size`. */
export function framedAvatarSize(size: number): number {
  return Math.round(size * SEASON_FRAME_INNER);
}
