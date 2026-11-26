import { StyleSheet, Text, View } from 'react-native';
import { badgeDef, badgeRow, type BadgeRowItem, type LeagueTier, type ShowcaseBadge, type TreeGlimpse } from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { BadgeMedal, LeagueEmblem } from '../ranks/art';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { Pressable } from '../theme/Pressable';
import { Skeleton } from '../theme/Skeleton';
import { heldDim } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { fontScaleCap, radii, spacing, typography } from '../theme/tokens';
import { TreeArt } from '../tree/TreeArt';

/** The pictures in the row, big enough to tell apart at a glance beside the handle. */
const ICON = 32;
/** The pill's drawn height; it answers a fingertip past it (theme/Pressable). */
const PILL = 44;

/** One picture of the row, unnamed: the pill's own name says what it holds. */
function RowArt({ item }: { item: BadgeRowItem }): React.JSX.Element | null {
  if (item.kind === 'league') return <LeagueEmblem tier={item.tier} size={ICON} label="" />;
  if (item.kind === 'tree') return <TreeArt species={item.tree.species} stage={item.tree.stage} health={item.tree.health} size={ICON} />;
  return <BadgeMedal badgeKey={item.badge.key} tier={item.badge.tier} tierCount={badgeDef(item.badge.key)?.tiers.length ?? 4} size={ICON} label="" />;
}

/**
 * The badge row beside a profile's handle, as on the website (web/src/profile/BadgeRow.tsx): one small pill with the
 * league, the tree and the badges, "+N" for the rest, opening the profile's collection. Somebody with nothing to show
 * has none; your own shows a quiet one, since the collection also shows what there is to earn.
 */
export function BadgePill({
  league,
  tree,
  badges,
  own = false,
  title,
  onOpen,
}: {
  league?: LeagueTier | null;
  tree?: TreeGlimpse | null;
  /** Earned badges in the order they show (`badgesInOrder`). */
  badges: readonly ShowcaseBadge[];
  own?: boolean;
  /** The collection's name, "Your collection" or "Hamo’s collection", which the pill is named after. */
  title: string;
  onOpen: () => void;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const { shown, more } = badgeRow({ league, tree, badges });
  if (shown.length === 0 && !own) return null;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${t('profile.badges')}: ${formatNumber(badges.length, locale)}`}
      testID="profile-badge-row"
      style={({ pressed }) => [styles.pill, { flexDirection: dir.row, backgroundColor: colors.controlTrack }, pressed && heldDim]}
    >
      {shown.length === 0 ? (
        <>
          <Icon name="medal" size={16} tone="secondary" />
          <Text style={[styles.word, { color: colors.textSecondary }]} maxFontSizeMultiplier={fontScaleCap.fixedBox} numberOfLines={1}>
            {t('profile.badges')}
          </Text>
        </>
      ) : (
        shown.map((item) => (
          <View key={item.kind === 'badge' ? item.badge.key : item.kind} style={styles.icon} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <RowArt item={item} />
          </View>
        ))
      )}
      {more > 0 ? (
        <Text style={[styles.word, styles.more, { color: colors.textSecondary }]} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
          {`+${formatNumber(more, locale)}`}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** The row while a profile loads: a pill of the usual length. */
export function BadgePillSkeleton(): React.JSX.Element {
  return <Skeleton width={104} height={PILL} radius={radii.md} />;
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', alignItems: 'center', gap: spacing.sm - 2, height: PILL, paddingStart: spacing.sm, paddingEnd: spacing.md - 2, borderRadius: radii.md },
  icon: { width: ICON, height: ICON, alignItems: 'center', justifyContent: 'center' },
  word: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  // "+7" reads the same way round in every direction.
  more: { fontVariant: ['tabular-nums'], marginStart: 2, writingDirection: 'ltr' },
});
