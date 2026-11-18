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
  /** The fire, the flag, the emblem, the bolt, drawn in a 36pt box. */
  art: ReactNode;
  /** A number counts up as the tile arrives; a word is simply there; null is not known. */
  value: number | string | null;
  label: string;
  onPress?: () => void;
}

/**
 * The four things a profile is about at a glance (the streak, the course, the league, the XP) as a two-by-two grid
 * under the face. The tiles rise in one after another the first time they fill, and numbers count up. A tile with
 * somewhere to go is a button; one that is only a number is not, since a control that looks tappable and is not is
 * worse.
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
 * The widest word a tile holds at its size: a course or league name ("Kurmancî", "Okyanûs", "الكرمانجية") is about
 * 100pt at 22pt, wider than any count.
 */
const WIDEST_WORD = 100;

/**
 * Two to a row where a tile's words fit beside its picture, else one to a row: half a 320pt or 360pt screen, less the
 * picture, cut "Kurmancî" short, as did larger text. `width` is the window's, `fontScale` the reader's text size.
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
 * A number counting from where it last was to where it is now (from nothing the first time). The span is fixed once per
 * change, so an unrelated render does not restart or cut short the count.
 */
function useCountTo(to: number): number {
  const [span, setSpan] = useState({ from: 0, to });
  if (span.to !== to) setSpan({ from: span.to, to });
  return useCountUp(span.to, { from: span.from });
}

function Tile({ tile }: { tile: OverviewTile }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  // The picture on the side the language starts from, the words after it.
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
  // A screen reader is told the final number, not the one mid-count.
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

/** The box the picture is drawn in. */
const ART = 36;
/** The room inside a tile, round it and beside its picture, and between two tiles. */
const TILE_PAD = spacing.sm + 4;
const TILE_GAP = spacing.sm + 2;
const GRID_GAP = spacing.sm;

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  // Two to a row with the gap between, or one to a row (overviewColumns).
  half: { flexBasis: '46%', flexGrow: 1 },
  whole: { flexBasis: '100%' },
  tile: { alignItems: 'center', gap: TILE_GAP, borderRadius: radii.md, paddingHorizontal: TILE_PAD, paddingVertical: spacing.sm + 2, minHeight: 60 },
  tileSkeleton: { minHeight: 60 },
  art: { width: ART, height: ART, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 1 },
  value: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  label: { fontSize: typography.sizes.xs, letterSpacing: 0.4, textTransform: 'uppercase' },
});
