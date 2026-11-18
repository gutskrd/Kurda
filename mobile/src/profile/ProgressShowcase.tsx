import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { useDirection } from '../reports/direction';
import { badgeDef, isRankedGame, type ProfileLeague, type ProfileRank, type ShowcaseBadge } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { GAME_NAME_KEY } from '../play/labels';
import { BadgeMedal, LeagueEmblem, PlacementEmblem, RankEmblem } from '../ranks/art';
import { TIER_NAME_KEY, rankLabel, rankName } from '../ranks/format';
import { badgeLabel, badgeName } from '../badges/format';
import { NewChip } from '../badges/NewChip';
import { knownTier, leagueLabel, leagueName } from '../leagues/format';
import { Icon } from '../theme/Icon';

/**
 * What a profile shows of the climb: the three badges chosen for it, each game's rank with its best this season and
 * ever, and the league, every name translated and nothing invented for somebody who has not played (no "bronze" for an
 * empty league, no tier while placing). A rank four weeks without a rated game reads "Resting" to everyone else. `own`
 * is your own profile: the empty showcase then offers to choose, and each part opens its page.
 */
export function ProgressShowcase({
  ranks,
  league,
  badges,
  fresh,
  own,
  onBadges,
  onRanks,
  onLeague,
}: {
  ranks: ProfileRank[];
  league: ProfileLeague | null | undefined;
  badges: ShowcaseBadge[];
  /** Badges earned since the app opened (`useFreshBadges`), which wear a "New" chip. */
  fresh?: ReadonlySet<string>;
  own: boolean;
  onBadges?: () => void;
  onRanks?: (game: ProfileRank['game']) => void;
  onLeague?: () => void;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  /*
   * Right to left, everything starts on the right: the badges in the chosen order, the row offering to choose them, and
   * the strip of ranks, which opens at its first.
   */
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  const strip = useRef<ScrollView>(null);
  const leagueTier = knownTier(league?.tier);
  // A rank in a game Hevalo no longer has is not shown: there is nowhere left to play for it.
  const shown = ranks.filter((r) => isRankedGame(r.game) && (r.tier || r.placing || r.resting || r.bestTier));
  if (badges.length === 0 && shown.length === 0 && !leagueTier && !own) return null;

  return (
    <View style={styles.wrap}>
      {badges.length > 0 || own ? (
        <View style={styles.section}>
          <Text style={[sectionLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('profile.showcase')}
          </Text>
          {badges.length > 0 ? (
            <PressableScale
              onPress={onBadges}
              disabled={!onBadges}
              accessibilityRole={onBadges ? 'button' : undefined}
              accessibilityLabel={t('profile.showcaseA11y', { badges: badges.map((b) => showcaseLabel(t, b)).join(', ') })}
              style={[styles.badges, { flexDirection: dir.row }]}
            >
              {badges.map((b, i) => (
                <View key={b.key} style={styles.badge}>
                  <View style={styles.medal}>
                    <BadgeMedal badgeKey={b.key} tier={b.tier} tierCount={badgeDef(b.key)?.tiers.length ?? 4} size={68} label={showcaseLabel(t, b)} shine="loop" />
                    {fresh?.has(b.key) ? <NewChip delayMs={120 + i * 80} /> : null}
                  </View>
                  <Text style={[styles.badgeName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {badgeName(t, b.key)}
                  </Text>
                </View>
              ))}
            </PressableScale>
          ) : (
            <PressableScale
              onPress={onBadges}
              accessibilityRole="button"
              style={[styles.empty, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}
            >
              <Icon name="medal" size={18} color={colors.textSecondary} />
              <Text style={[styles.emptyText, dir.text, { color: colors.textPrimary }]}>{t('profile.showcaseChoose')}</Text>
              <View style={dir.flip}>
                <Icon name="chevron-right" size={14} color={colors.textSecondary} />
              </View>
            </PressableScale>
          )}
        </View>
      ) : null}

      {shown.length > 0 || leagueTier ? (
        <View style={styles.section}>
          <Text style={[sectionLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('profile.progress')}
          </Text>
          <ScrollView
            ref={strip}
            horizontal
            showsHorizontalScrollIndicator={false}
            // Right to left, the first chip is on the right: start the strip there.
            onContentSizeChange={() => {
              if (mirrored) strip.current?.scrollToEnd({ animated: false });
            }}
            contentContainerStyle={[styles.chips, mirrored ? styles.chipsMirrored : null]}
          >
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
              // How far through placement, where the API says ("Placing 2/5").
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
                      // Resting: the best tier it reached, quietly.
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
  const dir = useDirection();
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      style={[styles.chip, dir.row === 'row-reverse' ? styles.chipMirrored : null, { backgroundColor: colors.controlTrack }]}
    >
      {art}
      <View style={styles.chipText}>
        <Text style={[styles.kicker, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
          {kicker}
        </Text>
        <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={[styles.sub, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: spacing.lg, marginTop: spacing.md },
  section: { gap: spacing.sm },
  badges: { flexDirection: 'row', justifyContent: 'space-around' },
  badge: { alignItems: 'center', gap: 4, width: 96 },
  medal: { width: 68, height: 68 },
  badgeName: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  empty: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  emptyText: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  chips: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.lg },
  // The strip at least as wide as the screen, so a short one still starts on the right.
  chipsMirrored: { flexDirection: 'row-reverse', flexGrow: 1, paddingRight: 0, paddingLeft: spacing.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingVertical: spacing.sm, paddingLeft: spacing.sm, paddingRight: spacing.md, minWidth: 150 },
  // The emblem on the right, with the narrow side of the padding beside it.
  chipMirrored: { flexDirection: 'row-reverse', paddingLeft: spacing.md, paddingRight: spacing.sm },
  chipText: { gap: 1, maxWidth: 140 },
  kicker: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  sub: { fontSize: typography.sizes.xs },
  resting: { opacity: 0.5 },
});
