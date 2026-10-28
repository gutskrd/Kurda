import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import type { LeagueView } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import type { RootNavigation } from '../navigation/rootStack';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { LeagueEmblem } from '../ranks/art';
import { getLeague } from '../ranks/api';
import { leagueTint } from '../ranks/tint';
import { GoalRing } from './GoalRing';
import { knownTier, leagueLabel, leagueName } from './format';
import { useDirection } from '../reports/direction';

/**
 * The week in one line on the home of learning (contract 4 §U): the league
 * and your place in it, or your own week when you are out of the leagues, and
 * the weekly goal as a small ring — a check in it once you are safe. One tap
 * opens the league. Nothing here counts down.
 */
export function LeagueLine(): React.JSX.Element | null {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [league, setLeague] = useState<LeagueView | null>(null);
  // until the first answer, the row's place is held in grey; after a failed one it is given up
  const [settled, setSettled] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void getLeague(client).then((res) => {
        if (!live) return;
        if (res.ok) setLeague(res.data);
        setSettled(true);
      });
      return () => {
        live = false;
      };
    }, [client]),
  );

  if (!league) return settled ? null : <LeagueLineSkeleton />;
  const tier = knownTier(league.tier);
  const personal = league.mode === 'personal';
  const goal = t('leagues.goalProgress', { xp: formatNumber(league.weeklyXp, locale), goal: formatNumber(league.goalXp, locale) });
  const title = personal
    ? t('leagues.home.personal')
    : tier
      ? league.joined
        ? t('leagues.home.place', { tier: leagueName(t, tier), rank: league.rank })
        : t('leagues.leagueName', { tier: leagueName(t, tier) })
      : t('leagues.home.join');
  const sub = league.safe ? t('leagues.safe') : !personal && !league.joined ? t('leagues.home.joinHint') : goal;

  return (
    <PressableScale
      onPress={() => navigation.navigate('League')}
      accessibilityRole="button"
      accessibilityLabel={`${tier && !personal ? leagueLabel(t, tier) : title}. ${sub}. ${goal}`}
      style={[styles.row, { backgroundColor: colors.surface, flexDirection: dir.row }]}
    >
      {tier && !personal ? (
        <LeagueEmblem tier={tier} size={44} label={leagueLabel(t, tier)} />
      ) : (
        <View style={styles.iconBox}>
          <Icon name="trophy" size={22} color={colors.textSecondary} />
        </View>
      )}
      <View style={styles.text}>
        <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={[styles.subRow, { flexDirection: dir.row }]}>
          {league.safe ? <Icon name="seal-check" size={14} color={colors.success} /> : null}
          <Text style={[styles.sub, dir.text, { color: league.safe ? colors.success : colors.textSecondary }]} numberOfLines={2}>
            {sub}
          </Text>
        </View>
      </View>
      <GoalRing xp={league.weeklyXp} goal={league.goalXp} size={44} tint={leagueTint(tier, scheme)} showNumbers={false} />
    </PressableScale>
  );
}

/** The row in grey: the emblem, the two lines, the ring. */
function LeagueLineSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const start = { alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' } as const;
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, flexDirection: dir.row }]}>
      <Skeleton width={44} height={44} radius={radii.pill} />
      <View style={styles.text}>
        <SkeletonText size={typography.sizes.md} width="58%" style={start} />
        <SkeletonText size={typography.sizes.sm} width="36%" style={start} />
      </View>
      <Skeleton width={44} height={44} radius={radii.pill} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: spacing.md, borderRadius: radii.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: MIN_TOUCH_TARGET + 16, alignSelf: 'stretch' },
  iconBox: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  subRow: { alignItems: 'center', gap: 4 },
  sub: { fontSize: typography.sizes.sm, flexShrink: 1 },
});
