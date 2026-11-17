import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useCountUp, useListEntrance } from '../theme/animate';
import { PressableScale, Rise } from '../theme/MotionParts';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { sectionLabel } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useFontScale } from '../a11y/useFontScale';
import { useDirection } from '../reports/direction';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';

/** One of the four: a picture, the number or word, and what it is. */
export interface OverviewTile {
  key: string;
  /** the fire, the flag, the emblem, the bolt — drawn in a 36-point box */
  art: ReactNode;
  /** a number counts up as the tile arrives; a word is simply there; null is not known */
  value: number | string | null;
  label: string;
  onPress?: () => void;
}

/**
 * The four things a profile is about at a glance — the streak, the course,
 * the league, the XP — as a grid of two by two under the face. The tiles rise
 * in one after another the first time they are filled (useListEntrance), and
 * a number in one counts up to where it is. A tile with somewhere to go
 * (the streak's story, the league, the lesson path) is a button and gives
 * under the finger; one that is only a number is not, because a control that
 * looks tappable and is not is worse than one that never did.
 */
export function OverviewGrid({ tiles }: { tiles: OverviewTile[] }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const entering = useListEntrance(true);
  const cell = useCellStyle();
  const dir = useDirection();
  return (
    <View style={styles.wrap}>
      <Text style={[sectionLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('profile.overview')}
      </Text>
      <View style={styles.grid}>
        {tiles.map((tile, i) => (
          <Rise key={tile.key} delay={entering(i)} style={cell}>
            <Tile tile={tile} />
          </Rise>
        ))}
      </View>
    </View>
  );
}

/** The grid in grey, the shape it will take, while the profile's numbers are on their way. */
export function OverviewSkeleton(): React.JSX.Element {
  const cell = useCellStyle();
  const dir = useDirection();
  return (
    <View style={styles.wrap}>
      <SkeletonText size={typography.sizes.xs} width={72} />
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[cell, styles.tile, styles.tileSkeleton, { flexDirection: dir.row }]}>
            <Skeleton width={ART} height={ART} radius={radii.pill} />
            <View style={styles.text}>
              <SkeletonText size={typography.sizes.lg} width={48} />
              <SkeletonText size={typography.sizes.xs} width={40} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The widest word a tile is asked to hold, at the tile's size: a course or a
 * league by name ("Kurmancî", "Okyanûs", "الكرمانجية") is about a hundred
 * points at 22, wider than any count the tiles show.
 */
const WIDEST_WORD = 100;

/**
 * Two to a row where a tile's words fit beside its picture, and one to a row
 * where they do not.
 *
 * Two to a row on every phone left "Kurmancî" as "Kur…" at 320 and at 360,
 * which is the width of a great many phones, and on any phone whose reader
 * had asked for larger text: half a narrow screen, less the picture, is
 * seventy points. One to a row keeps the same tile, with all of its room.
 * `width` is the window's, `fontScale` the reader's text size.
 */
export function overviewColumns(width: number, fontScale: number): 1 | 2 {
  const content = Math.min(width, layout.column) - layout.gutter * 2;
  const room = (content - GRID_GAP) / 2 - TILE_PAD * 2 - ART - TILE_GAP;
  return room >= WIDEST_WORD * fontScale ? 2 : 1;
}

function useCellStyle() {
  const { width } = useWindowDimensions();
  const fontScale = useFontScale();
  return overviewColumns(width, fontScale) === 2 ? styles.half : styles.whole;
}

/**
 * A number counting from where it last was to where it is now: from nothing
 * the first time, and from the old number when the profile is asked for
 * again and the number has moved on. The span is settled once per change, so
 * a render for some other reason does not restart or cut short the count.
 */
function useCountTo(to: number): number {
  const [span, setSpan] = useState({ from: 0, to });
  if (span.to !== to) setSpan({ from: span.to, to });
  return useCountUp(span.to, { from: span.from });
}

function Tile({ tile }: { tile: OverviewTile }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  // the picture on the side the language starts from, the words lined up after it
  const dir = useDirection();
  const numeric = typeof tile.value === 'number';
  const count = useCountTo(numeric ? (tile.value as number) : 0);
  const shown = tile.value === null ? '—' : numeric ? formatNumber(count, locale) : String(tile.value);
  const settled = tile.value === null ? '—' : numeric ? formatNumber(tile.value as number, locale) : String(tile.value);
  const body = (
    <>
      <View style={styles.art}>{tile.art}</View>
      <View style={styles.text}>
        <Text style={[styles.value, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
          {shown}
        </Text>
        <Text style={[styles.label, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
          {tile.label}
        </Text>
      </View>
    </>
  );
  // the number as it will be, not as it is mid-count, is what a screen reader is told
  const label = `${settled} ${tile.label}`;
  const style = [styles.tile, { flexDirection: dir.row, backgroundColor: colors.controlTrack }];
  if (!tile.onPress) {
    return (
      <View accessible accessibilityLabel={label} style={style}>
        {body}
      </View>
    );
  }
  return (
    <PressableScale onPress={tile.onPress} accessibilityRole="button" accessibilityLabel={label} style={style}>
      {body}
    </PressableScale>
  );
}

/** the box the picture is drawn in */
const ART = 36;
/** the room inside a tile, round it and beside its picture, and between two tiles */
const TILE_PAD = spacing.sm + 4;
const TILE_GAP = spacing.sm + 2;
const GRID_GAP = spacing.sm;

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  // two to a row with the gap between them, or one to a row (overviewColumns)
  half: { flexBasis: '46%', flexGrow: 1 },
  whole: { flexBasis: '100%' },
  tile: { alignItems: 'center', gap: TILE_GAP, borderRadius: radii.md, paddingHorizontal: TILE_PAD, paddingVertical: spacing.sm + 2, minHeight: 60 },
  tileSkeleton: { minHeight: 60 },
  art: { width: ART, height: ART, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 1 },
  value: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  label: { fontSize: typography.sizes.xs, letterSpacing: 0.4, textTransform: 'uppercase' },
});
