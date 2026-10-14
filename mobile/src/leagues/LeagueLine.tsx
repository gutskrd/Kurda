import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LeagueView } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import type { RootNavigation } from '../navigation/rootStack';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { LeagueEmblem } from '../ranks/art';
import { getLeague } from '../ranks/api';
import { leagueTint } from '../ranks/tint';
import { GoalRing } from './GoalRing';
import { knownTier, leagueLabel, leagueName } from './format';

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
  const [league, setLeague] = useState<LeagueView | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void getLeague(client).then((res) => {
        if (live && res.ok) setLeague(res.data);
      });
      return () => {
        live = false;
      };
    }, [client]),
  );

  if (!league) return null;
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
    <Pressable
      onPress={() => navigation.navigate('League')}
      accessibilityRole="button"
      accessibilityLabel={`${tier && !personal ? leagueLabel(t, tier) : title}. ${sub}. ${goal}`}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.75 : 1 }]}
    >
      {tier && !personal ? (
        <LeagueEmblem tier={tier} size={44} label={leagueLabel(t, tier)} />
      ) : (
        <View style={styles.iconBox}>
          <Icon name="trophy" size={22} color={colors.textSecondary} />
        </View>
      )}
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.subRow}>
          {league.safe ? <Icon name="seal-check" size={14} color={colors.success} /> : null}
          <Text style={[styles.sub, { color: league.safe ? colors.success : colors.textSecondary }]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
      </View>
      <GoalRing xp={league.weeklyXp} goal={league.goalXp} size={44} tint={leagueTint(tier, scheme)} showNumbers={false} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: MIN_TOUCH_TARGET + 16, alignSelf: 'stretch' },
  iconBox: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sub: { fontSize: typography.sizes.sm },
});
