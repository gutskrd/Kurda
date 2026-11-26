import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SEASON_FRAME_INNER, type ProfileWordTag } from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { CosmeticBackground, PremiumPill } from './cosmetic-parts';
import { Horizon } from './Horizon';
import { TagPill } from './TagPill';
import type { LevelInfo, ProfileBackground } from './types';

/** The face on a full profile; a frame is drawn round it, so the face keeps its size inside one. */
export const FACE = 96;
/** The face in a frame: the frame's outer size. */
export const FRAMED = Math.round(FACE / SEASON_FRAME_INNER);
/** The ring of page colour that cuts the face out of the banner. */
const RING = 4;
const BANNER = 128;
/** The level ring's size and the width of its line. */
const LEVEL = 34;
const LEVEL_STROKE = 3;

/**
 * The level as a games platform shows it: the number in a ring that fills toward the next level, with what is left
 * said in words to a screen reader.
 */
export function LevelBadge({ level }: { level: Pick<LevelInfo, 'level' | 'xp' | 'nextLevelXp' | 'progress'> }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const share = Math.min(1, Math.max(0, level.progress));
  const next = t('profile.xpToLevel', { xp: formatNumber(Math.max(0, level.nextLevelXp - level.xp), locale), level: formatNumber(level.level + 1, locale) });
  const r = (LEVEL - LEVEL_STROKE) / 2;
  const round = 2 * Math.PI * r;
  return (
    <View
      style={styles.level}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${t('profile.levelN', { level: formatNumber(level.level, locale) })}, ${next}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
    >
      <Svg width={LEVEL} height={LEVEL} style={StyleSheet.absoluteFill}>
        <Circle cx={LEVEL / 2} cy={LEVEL / 2} r={r} stroke={colors.separator} strokeWidth={LEVEL_STROKE} fill="none" />
        {/* Starts at twelve o'clock so the ring reads as filling up; a butt end, so none at all draws no dot. */}
        <Circle
          cx={LEVEL / 2}
          cy={LEVEL / 2}
          r={r}
          stroke={colors.textPrimary}
          strokeWidth={LEVEL_STROKE}
          fill="none"
          strokeDasharray={`${share * round} ${round}`}
          transform={`rotate(-90 ${LEVEL / 2} ${LEVEL / 2})`}
        />
      </Svg>
      <Text style={[styles.levelN, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {formatNumber(level.level, locale)}
      </Text>
    </View>
  );
}

/**
 * The top of a full profile, laid out as a social app's and the website's (web/src/profile/ProfileHead.tsx): the
 * banner, the face over its lower edge with the figures beside it, the name with the level, the handle with the badge
 * row, then what the screen adds under it (where they are from, the bio, who they know, what only the owner sees) and
 * the actions. It sits on the page, not in a card; nothing is written over the banner.
 */
export function ProfileHead({
  seed,
  width,
  background,
  face,
  framed = false,
  stats,
  name,
  level,
  premium,
  tag,
  handle,
  handleAside,
  children,
  actions,
}: {
  /** Whose profile it is: the horizon drawn where no background is worn is seeded from it. */
  seed: string;
  /** The page's width, which the banner spans edge to edge. */
  width: number;
  background?: ProfileBackground | null;
  /** The face in its frame, as a button on your own profile. */
  face: ReactNode;
  /** Whether a frame is drawn round the face, which makes it larger. */
  framed?: boolean;
  /** The figures beside the face. */
  stats?: ReactNode;
  name: string;
  level?: Pick<LevelInfo, 'level' | 'xp' | 'nextLevelXp' | 'progress'> | null;
  premium?: boolean;
  /** The word tag worn by the name. */
  tag?: ProfileWordTag | null;
  /** The handle, and the year joined where it is known. */
  handle: string;
  /** After the handle on its line, wrapping under it where the line is short: the badge row. */
  handleAside?: ReactNode;
  /** Under the handle: where they are from, who can see the page, the bio, who they know. */
  children?: ReactNode;
  /** Edit and share on your own profile, the friend buttons on somebody else's. */
  actions?: ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={styles.head}>
      <View style={[styles.banner, { width, backgroundColor: colors.controlTrack }]}>
        {/* The horizon stays underneath, so a background still loading, or a video the phone does not play, leaves it showing. */}
        <Horizon seed={seed} width={width} height={BANNER} />
        {background ? <CosmeticBackground background={background} style={StyleSheet.absoluteFill} /> : null}
      </View>

      {/* Half the face over the banner's lower edge; the figures beside it start a clear step under the banner, never on its edge. */}
      <View style={[styles.top, { flexDirection: dir.row, marginTop: -overlap(framed) }]}>
        <View style={[styles.face, { borderColor: colors.background, backgroundColor: colors.background }]}>{face}</View>
        {stats ? <View style={[styles.stats, { marginTop: overlap(framed) + spacing.md }]}>{stats}</View> : null}
      </View>

      <View style={styles.names}>
        <View style={[styles.nameRow, { flexDirection: dir.row }]}>
          {/* A long name wraps to a second line rather than being cut. */}
          <Text style={[styles.name, dir.text, { color: colors.textPrimary }]} numberOfLines={2} accessibilityRole="header">
            {name}
          </Text>
          {level ? <LevelBadge level={level} /> : null}
          {tag ? <TagPill tag={tag} /> : null}
          {premium ? <PremiumPill /> : null}
        </View>
        <View style={[styles.handleRow, { flexDirection: dir.row }]}>
          <Text style={[styles.handle, dir.text, { color: colors.textSecondary }]} numberOfLines={2}>
            {handle}
          </Text>
          {handleAside}
        </View>
      </View>

      {children}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

/** The head while a profile loads, in `ProfileHead`'s own layout; each screen passes what sits under it. */
export function ProfileHeadSkeleton({
  width,
  stats,
  handleAside,
  children,
  actions,
}: {
  width: number;
  stats?: ReactNode;
  /** The badge row's place beside the handle. */
  handleAside?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={styles.head}>
      <Skeleton width={width} height={BANNER} radius={radii.none} style={styles.banner} />
      <View style={[styles.top, { flexDirection: dir.row, marginTop: -overlap(false) }]}>
        <View style={[styles.face, { borderColor: colors.background, backgroundColor: colors.background }]}>
          <Skeleton width={FACE} height={FACE} radius={radii.pill} />
        </View>
        {stats ? <View style={[styles.stats, { marginTop: overlap(false) + spacing.md }]}>{stats}</View> : null}
      </View>
      <View style={styles.names}>
        <View style={[styles.nameRow, { flexDirection: dir.row }]}>
          <SkeletonText size={typography.sizes.title} width={160} />
          <Skeleton width={LEVEL} height={LEVEL} radius={radii.pill} />
        </View>
        <View style={[styles.handleRow, { flexDirection: dir.row }]}>
          <SkeletonText size={typography.sizes.text} width={72} />
          {handleAside}
        </View>
      </View>
      {children}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

/** How far the face, with its ring of page colour, stands over the banner: half of it. */
const overlap = (framed: boolean): number => (framed ? FRAMED : FACE) / 2 + RING;

const styles = StyleSheet.create({
  head: { alignSelf: 'stretch', gap: spacing.sm + 2, paddingBottom: spacing.xs },
  // Edge to edge, under the page's gutter.
  banner: { height: BANNER, marginHorizontal: -layout.gutter, overflow: 'hidden' },
  top: { alignItems: 'flex-start', gap: spacing.sm },
  face: { borderRadius: radii.pill, borderWidth: RING },
  stats: { flex: 1, minWidth: 0 },
  // Room between the name with its level ring and the handle with its badge row, so neither crowds the other.
  names: { gap: spacing.sm },
  // The handle and the badge row on one line that wraps, the row under the handle where the line is short.
  handleRow: { alignItems: 'center', flexWrap: 'wrap', columnGap: spacing.sm + 2, rowGap: spacing.xs },
  nameRow: { alignItems: 'center', flexWrap: 'wrap', columnGap: spacing.sm + 2, rowGap: spacing.xs },
  name: { flexShrink: 1, fontSize: typography.sizes.title, fontWeight: typography.weights.bold },
  handle: { fontSize: typography.sizes.text },
  level: { width: LEVEL, height: LEVEL, alignItems: 'center', justifyContent: 'center' },
  levelN: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  actions: { marginTop: spacing.xs },
});
