import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { badgeDef, type ProfileLeague, type ProfileRank, type ShowcaseBadge } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { GAME_NAME_KEY } from '../play/labels';
import { BadgeMedal, LeagueEmblem, PlacementEmblem, RankEmblem } from '../ranks/art';
import { TIER_NAME_KEY, rankLabel, rankName } from '../ranks/format';
import { badgeLabel, badgeName } from '../badges/format';
import { knownTier, leagueLabel, leagueName } from '../leagues/format';
import { Icon } from '../theme/Icon';

/**
 * What a profile shows of the climb (contract 4 §U): the three badges chosen
 * for it, each game's rank now with the best this season and ever, and the
 * league — every name translated, nothing invented for somebody who has not
 * played (no "bronze" for an empty league, no tier while placing). A rank
 * four weeks without a rated game reads "Resting" to everyone else.
 *
 * `own` is your own profile: the empty showcase then offers to choose, and
 * each part opens its page.
 */
export function ProgressShowcase({
  ranks,
  league,
  badges,
  own,
  onBadges,
  onRanks,
  onLeague,
}: {
  ranks: ProfileRank[];
  league: ProfileLeague | null | undefined;
  badges: ShowcaseBadge[];
  own: boolean;
  onBadges?: () => void;
  onRanks?: (game: ProfileRank['game']) => void;
  onLeague?: () => void;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const leagueTier = knownTier(league?.tier);
  const shown = ranks.filter((r) => r.tier || r.placing || r.resting || r.bestTier);
  if (badges.length === 0 && shown.length === 0 && !leagueTier && !own) return null;

  return (
    <View style={styles.wrap}>
      {badges.length > 0 || own ? (
        <View style={styles.section}>
          <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('profile.showcase')}
          </Text>
          {badges.length > 0 ? (
            <PressableScale
              onPress={onBadges}
              disabled={!onBadges}
              accessibilityRole={onBadges ? 'button' : undefined}
              accessibilityLabel={t('profile.showcaseA11y', { badges: badges.map((b) => showcaseLabel(t, b)).join(', ') })}
              style={styles.badges}
            >
              {badges.map((b) => (
                <View key={b.key} style={styles.badge}>
                  <BadgeMedal badgeKey={b.key} tier={b.tier} tierCount={badgeDef(b.key)?.tiers.length ?? 4} size={68} label={showcaseLabel(t, b)} shine="loop" />
                  <Text style={[styles.badgeName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {badgeName(t, b.key)}
                  </Text>
                </View>
              ))}
            </PressableScale>
          ) : (
            <Pressable
              onPress={onBadges}
              accessibilityRole="button"
              style={({ pressed }) => [styles.empty, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
            >
              <Icon name="medal" size={18} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textPrimary }]}>{t('profile.showcaseChoose')}</Text>
              <Icon name="chevron-right" size={14} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      ) : null}

      {shown.length > 0 || leagueTier ? (
        <View style={styles.section}>
          <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('profile.progress')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {leagueTier ? (
              <Chip
                onPress={onLeague}
                label={leagueLabel(t, leagueTier)}
                art={<LeagueEmblem tier={leagueTier} size={44} label={leagueLabel(t, leagueTier)} />}
                kicker={t('profile.league')}
                title={leagueName(t, leagueTier)}
              />
            ) : null}
            {shown.map((r) => {
              const game = t(GAME_NAME_KEY[r.game]);
              // how far through placement, where the API says ("Placing 2/5")
              const placing = r.placement ? t('ranks.placing', { played: r.placement.played, of: r.placement.of }) : t('ranks.placingShort');
              const now = r.resting ? t('ranks.resting') : r.placing || !r.tier ? placing : rankName(t, r.tier, r.division);
              const best = r.bestTier ? t('profile.rankBest', { rank: t(TIER_NAME_KEY[r.bestTier]) }) : null;
              const label = [game, r.tier && !r.resting ? rankLabel(t, r.tier, r.division) : now, best].filter(Boolean).join('. ');
              return (
                <Chip
                  key={r.game}
                  onPress={onRanks ? () => onRanks(r.game) : undefined}
                  label={label}
                  art={
                    r.tier && !r.resting && !r.placing ? (
                      <RankEmblem tier={r.tier} division={r.division} size={44} label={rankLabel(t, r.tier, r.division)} />
                    ) : r.resting && r.bestTier ? (
                      // resting: the best tier it reached, quietly
                      <RankEmblem tier={r.bestTier} size={44} label={now} style={styles.resting} />
                    ) : (
                      <PlacementEmblem done={r.placement?.played ?? 0} size={44} label={now} />
                    )
                  }
                  kicker={game}
                  title={now}
                  sub={best}
                />
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function showcaseLabel(t: Parameters<typeof badgeName>[0], b: ShowcaseBadge): string {
  return badgeLabel(t, { key: b.key, tier: b.tier, tierKey: b.tierKey, tierCount: badgeDef(b.key)?.tiers.length ?? 4, hidden: false });
}

function Chip({
  art,
  kicker,
  title,
  sub,
  label,
  onPress,
}: {
  art: React.ReactNode;
  kicker: string;
  title: string;
  sub?: string | null;
  label: string;
  onPress?: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.chip, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
    >
      {art}
      <View style={styles.chipText}>
        <Text style={[styles.kicker, { color: colors.textSecondary }]} numberOfLines={1}>
          {kicker}
        </Text>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: spacing.lg, marginTop: spacing.md },
  section: { gap: spacing.sm },
  badges: { flexDirection: 'row', justifyContent: 'space-around' },
  badge: { alignItems: 'center', gap: 4, width: 96 },
  badgeName: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  empty: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingHorizontal: spacing.md, minHeight: MIN_TOUCH_TARGET },
  emptyText: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingVertical: spacing.sm, paddingLeft: spacing.sm, paddingRight: spacing.md, minWidth: 150 },
  chipText: { gap: 1, maxWidth: 140 },
  kicker: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  sub: { fontSize: typography.sizes.xs },
  resting: { opacity: 0.5 },
});
