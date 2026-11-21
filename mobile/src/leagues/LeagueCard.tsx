import { StyleSheet, Text, View } from 'react-native';
import { LEAGUE_TIERS, NO_DEMOTION_TIERS, type LeagueView } from '@kurda/shared';
import { PressableScale } from '../theme/MotionParts';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { LeagueEmblem } from '../ranks/art';
import { knownTier, leagueLabel, leagueName, weekLeftText } from './format';

/**
 * Your league this week as one compact card at the top of Rankings' XP: the tier, your place, the days left and the
 * lines to move up or down, opening the whole league. Before the week's first lesson it says the week starts with
 * one; out of the leagues it is your own week.
 */
export function LeagueCard({ league, onOpen }: { league: LeagueView | null; onOpen: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  if (!league) {
    return (
      <View style={[styles.card, { flexDirection: dir.row, backgroundColor: colors.surface }]} accessibilityLabel={t('common.loading')}>
        <Skeleton width={52} height={52} radius={radii.pill} />
        <View style={styles.text}>
          <SkeletonText size={typography.sizes.text} width="50%" />
          <SkeletonText size={typography.sizes.text} width="70%" />
        </View>
      </View>
    );
  }
  const personal = league.mode === 'personal' || league.optedOut;
  const tier = knownTier(league.tier) ?? 'dilop';
  const title = personal ? t('leagues.personal.title') : t('leagues.leagueName', { tier: leagueName(t, tier) });
  const where = personal
    ? t('leagues.goalProgress', { xp: formatNumber(league.weeklyXp, locale), goal: formatNumber(league.goalXp, locale) })
    : league.joined && league.groupSize > 0
      ? `${t('leagues.place', { rank: league.rank, count: league.groupSize })} · ${t('leagues.xpCount', { xp: formatNumber(league.weeklyXp, locale) })}`
      : t('leagues.resting.title');
  const left = weekLeftText(t, league.endsAt, locale);
  const zones = !personal && league.joined ? zoneLines(t, league) : [];
  return (
    <PressableScale
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={[title, where, left, ...zones.map((z) => z.text)].join(', ')}
      accessibilityHint={t('leagues.card.open')}
      style={[styles.card, { flexDirection: dir.row, backgroundColor: colors.surface }]}
      testID="league-card"
    >
      {personal ? null : <LeagueEmblem tier={tier} size={52} label={leagueLabel(t, tier)} />}
      <View style={styles.text}>
        <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.meta, dir.text, { color: colors.textSecondary }]}>{where}</Text>
        <View style={[styles.line, { flexDirection: dir.row }]}>
          <Icon name="timer" size={14} color={colors.textSecondary} />
          <Text style={[styles.meta, { color: colors.textSecondary }]}>{left}</Text>
        </View>
        {zones.length > 0 ? (
          <View style={[styles.zones, { flexDirection: dir.row }]}>
            {zones.map((z) => (
              <View key={z.text} style={[styles.line, { flexDirection: dir.row }]}>
                {z.icon ? <Icon name={z.icon} size={13} color={z.icon === 'move-up' || z.icon === 'seal-check' ? colors.success : colors.textSecondary} /> : null}
                <Text style={[styles.meta, { color: z.icon === 'seal-check' ? colors.success : colors.textSecondary }]}>{z.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <Icon name="chevron-right" size={18} color={colors.textSecondary} style={dir.flip} />
    </PressableScale>
  );
}

type Zone = { icon: 'move-up' | 'move-down' | 'seal-check' | null; text: string };

/** The lines this week turns on: safe once the goal is met, else how many move up and how many may move down. */
function zoneLines(t: ReturnType<typeof useI18n>['t'], league: LeagueView): Zone[] {
  if (league.safe || league.goalMet) return [{ icon: 'seal-check', text: t('leagues.safe') }];
  const tier = knownTier(league.tier) ?? 'dilop';
  const top = tier === LEAGUE_TIERS[LEAGUE_TIERS.length - 1];
  const out: Zone[] = [];
  if (!top && league.promoteCount > 0) out.push({ icon: 'move-up', text: t('leagues.card.up', { count: league.promoteCount }) });
  if (NO_DEMOTION_TIERS.includes(tier)) out.push({ icon: null, text: t('leagues.rules.noDemotion') });
  else if (league.demoteCount > 0) out.push({ icon: 'move-down', text: t('leagues.card.down', { count: league.demoteCount }) });
  return out;
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.md - 2, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4 },
  text: { flex: 1, gap: 3 },
  title: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  meta: { fontSize: typography.sizes.text, lineHeight: 19, fontVariant: ['tabular-nums'] },
  line: { alignItems: 'center', gap: 5 },
  zones: { flexWrap: 'wrap', columnGap: spacing.md, rowGap: 2 },
});
