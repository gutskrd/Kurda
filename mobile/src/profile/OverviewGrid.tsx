import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCountUp, useListEntrance } from '../theme/animate';
import { PressableScale, Rise } from '../theme/MotionParts';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { sectionLabel } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
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
  return (
    <View style={styles.wrap}>
      <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('profile.overview')}
      </Text>
      <View style={styles.grid}>
        {tiles.map((tile, i) => (
          <Rise key={tile.key} delay={entering(i)} style={styles.cell}>
            <Tile tile={tile} />
          </Rise>
        ))}
      </View>
    </View>
  );
}

/** The grid in grey, the shape it will take, while the profile's numbers are on their way. */
export function OverviewSkeleton(): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <SkeletonText size={typography.sizes.xs} width={72} />
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.cell, styles.tile, styles.tileSkeleton]}>
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
  const numeric = typeof tile.value === 'number';
  const count = useCountTo(numeric ? (tile.value as number) : 0);
  const shown = tile.value === null ? '—' : numeric ? formatNumber(count, locale) : String(tile.value);
  const settled = tile.value === null ? '—' : numeric ? formatNumber(tile.value as number, locale) : String(tile.value);
  const body = (
    <>
      <View style={styles.art}>{tile.art}</View>
      <View style={styles.text}>
        <Text style={[styles.value, { color: colors.textPrimary }]} numberOfLines={1}>
          {shown}
        </Text>
        <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
          {tile.label}
        </Text>
      </View>
    </>
  );
  // the number as it will be, not as it is mid-count, is what a screen reader is told
  const label = `${settled} ${tile.label}`;
  if (!tile.onPress) {
    return (
      <View accessible accessibilityLabel={label} style={[styles.tile, { backgroundColor: colors.controlTrack }]}>
        {body}
      </View>
    );
  }
  return (
    <PressableScale onPress={tile.onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.tile, { backgroundColor: colors.controlTrack }]}>
      {body}
    </PressableScale>
  );
}

/** the box the picture is drawn in */
const ART = 36;

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // two to a row, however wide the phone, with the gap between them
  cell: { flexBasis: '46%', flexGrow: 1 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, borderRadius: radii.md, paddingHorizontal: spacing.sm + 4, paddingVertical: spacing.sm + 2, minHeight: 60 },
  tileSkeleton: { minHeight: 60 },
  art: { width: ART, height: ART, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 1 },
  value: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  label: { fontSize: typography.sizes.xs, letterSpacing: 0.4, textTransform: 'uppercase' },
});
