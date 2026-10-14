import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RANKED_GAMES, type MyRanks } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import type { RootNavigation } from '../navigation/rootStack';
import { GlassCard } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { getMyRanks } from './api';
import { daysLeftText, seasonTitle } from './format';
import { RankCardView } from './RankCard';

/**
 * The Play tab's ranks (contract 4 §U): one card per game with a rank, the
 * season they belong to and how long it has left — said calmly, as days — and,
 * after leaving several rated games in a row, when rated games open again.
 * Asked again each time the tab comes into view, so a game just played shows.
 */
export function RanksSection(): React.JSX.Element | null {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const [ranks, setRanks] = useState<MyRanks | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void getMyRanks(client).then((res) => {
        if (live && res.ok) setRanks(res.data);
      });
      return () => {
        live = false;
      };
    }, [client]),
  );

  if (!ranks) return null;
  const cards = RANKED_GAMES.map((g) => ranks.ranks.find((r) => r.game === g)).filter((c): c is NonNullable<typeof c> => !!c);
  const season = `${seasonTitle(t, ranks.season)} · ${daysLeftText(t, ranks.season.daysLeft)}`;
  const cooldown = ranks.cooldownUntil ? new Date(ranks.cooldownUntil) : null;
  const cooling = cooldown !== null && cooldown.getTime() > Date.now();

  return (
    <GlassCard style={styles.card}>
      <View style={styles.head}>
        <Text style={[sectionLabel, styles.headLabel, { color: colors.textSecondary }]} accessibilityRole="header">
          {t('ranks.title')}
        </Text>
        <Pressable
          onPress={() => navigation.navigate('Season')}
          accessibilityRole="button"
          accessibilityLabel={`${t('season.title')}: ${season}`}
          // a slim pill, a fingertip tall to touch
          hitSlop={{ top: 6, bottom: 6 }}
          style={({ pressed }) => [styles.season, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name="calendar" size={14} color={colors.textSecondary} />
          <Text style={[styles.seasonText, { color: colors.textPrimary }]} numberOfLines={1}>
            {season}
          </Text>
        </Pressable>
      </View>
      {cards.map((card, i) => (
        <View key={card.game}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.separator }]} /> : null}
          <RankCardView card={card} compact onPress={() => navigation.navigate('Ranks', { game: card.game })} />
        </View>
      ))}
      {cooling && cooldown ? (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {t('ranks.cooldown', { time: cooldown.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })}
        </Text>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
  headLabel: { flexShrink: 0 },
  season: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    flexShrink: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
  },
  seasonText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, flexShrink: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.sm + 2 },
  note: { fontSize: typography.sizes.sm, marginTop: spacing.sm, minHeight: MIN_TOUCH_TARGET / 2 },
});
