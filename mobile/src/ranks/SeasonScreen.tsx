import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  RANKED_GAMES,
  seasonById,
  sterkTitle,
  tierIndex,
  type MyRanks,
  type PointsTier,
  type RankTier,
  type SeasonEmblem,
  type SeasonOverview,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { GlassCard, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { display, sectionLabel } from '../theme/fonts';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { Note } from '../stories/ui';
import { GAME_NAME_KEY } from '../play/labels';
import { getMyRanks, getSeason, getSeasonEmblems, wearFrame } from './api';
import { RankEmblem, SeasonFramed, framedAvatarSize, frameTierOf } from './art';
import { SEASON_MEANING_KEY, TIER_NAME_KEY, daysLeftText, rankLabel, seasonTitle } from './format';
import { Meter } from './Meter';
import { rankTint } from './tint';

interface OwnedItem {
  sku: string;
  category: string;
}

/**
 * The season (contract 4 §R5, §U): its name and how many days it has left —
 * days, calmly, never a clock — what it gives for each tier (an emblem kept
 * for good, a frame for the avatar, a few Gems), how far each game is towards
 * counting for it, and what last season left you. The frames you were given
 * are worn from here.
 */
export function SeasonScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const [overview, setOverview] = useState<SeasonOverview | null>(null);
  const [ranks, setRanks] = useState<MyRanks | null>(null);
  const [emblems, setEmblems] = useState<SeasonEmblem[]>([]);
  const [frames, setFrames] = useState<string[]>([]);
  const [wearing, setWearing] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    void Promise.all([
      getSeason(client),
      getMyRanks(client),
      getSeasonEmblems(client),
      client.get<{ items: OwnedItem[] }>('/me/inventory'),
      user ? client.get<{ frameSku?: string | null }>(`/users/${user.id}`) : Promise.resolve(null),
    ]).then(([o, r, e, inv, me]) => {
      if (o.ok) setOverview(o.data);
      else setError(o.error);
      if (r.ok) setRanks(r.data);
      if (e.ok) setEmblems(e.data.emblems);
      if (inv.ok) setFrames((inv.data.items ?? []).filter((i) => i.category === 'frame' && frameTierOf(i.sku)).map((i) => i.sku));
      if (me?.ok) setWearing(me.data.frameSku ?? null);
    });
  }, [client, user]);
  useFocusEffect(useCallback(() => load(), [load]));

  const wear = async (sku: string | null): Promise<void> => {
    setBusy(sku ?? 'none');
    setFrameError(null);
    const res = await wearFrame(client, sku);
    setBusy(null);
    if (res.ok) setWearing(res.data.frameSku);
    else setFrameError(describeError(res.error, t));
  };

  const best = bestPeak(ranks);

  return (
    <GradientBackground>
      <ScreenHeader title={t('season.title')} onBack={onExit} />
      <AsyncBoundary loading={!overview && !error} error={!overview ? error : null} onRetry={load} skeleton={<SeasonSkeleton />}>
        {() =>
          overview ? (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <GlassCard>
                <View style={styles.hero}>
                  <RankEmblem
                    tier={best ?? 'dest'}
                    size={136}
                    season={{ name: overview.season.name, year: overview.season.year }}
                    label={`${seasonTitle(t, overview.season)}${best ? ` · ${rankLabel(t, best, null)}` : ''}`}
                    style={best ? undefined : styles.dim}
                  />
                  <Text style={[styles.heroTitle, { color: colors.textPrimary }]} accessibilityRole="header">
                    {seasonTitle(t, overview.season)}
                  </Text>
                  <Text style={[styles.meaning, { color: colors.textSecondary }]}>{t(SEASON_MEANING_KEY[overview.season.name])}</Text>
                  <View style={styles.days}>
                    <Icon name="calendar" size={14} color={colors.textSecondary} />
                    <Text style={[styles.small, { color: colors.textSecondary }]}>{daysLeftText(t, overview.season.daysLeft)}</Text>
                  </View>
                  <Text style={[styles.small, styles.center, { color: colors.textSecondary }]}>
                    {best ? t('season.bestSoFar', { rank: t(TIER_NAME_KEY[best]) }) : t('season.noneYet')}
                  </Text>
                </View>
              </GlassCard>

              <View style={styles.section}>
                <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
                  {t('season.counting')}
                </Text>
                <Text style={[styles.small, { color: colors.textSecondary }]}>{t('season.countingHint', { count: overview.minGames })}</Text>
                <GlassCard>
                  <View style={styles.games}>
                    {RANKED_GAMES.map((g) => {
                      const card = ranks?.ranks.find((r) => r.game === g);
                      const played = card?.season.ratedGames ?? 0;
                      const done = played >= overview.minGames;
                      return (
                        <View key={g} style={styles.game}>
                          <View style={styles.gameHead}>
                            <Text style={[styles.gameName, { color: colors.textPrimary }]}>{t(GAME_NAME_KEY[g])}</Text>
                            <Text style={[styles.small, { color: done ? colors.success : colors.textSecondary }]}>
                              {done ? t('season.counted') : t('season.gamesOf', { played, need: overview.minGames })}
                            </Text>
                          </View>
                          <Meter
                            fraction={played / overview.minGames}
                            tint={rankTint(card?.season.peakTier ?? null, scheme)}
                            height={6}
                            label={t('season.gamesOf', { played, need: overview.minGames })}
                          />
                        </View>
                      );
                    })}
                  </View>
                </GlassCard>
              </View>

              <View style={styles.section}>
                <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
                  {t('season.rewards')}
                </Text>
                <Text style={[styles.small, { color: colors.textSecondary }]}>{t('season.rewardsHint')}</Text>
                <GlassCard padding="tight">
                  {[...overview.rewards].reverse().map((r) => (
                    <View key={r.tier} style={styles.reward} accessible accessibilityLabel={rewardLabel(t, r.tier, r.gems, overview.season.id)}>
                      <RankEmblem tier={r.tier} size={52} season={{ name: overview.season.name, year: overview.season.year }} label={rankLabel(t, r.tier, null)} />
                      <View style={styles.flex}>
                        <View style={styles.rewardHead}>
                          <Text style={[styles.rewardName, { color: colors.textPrimary }]}>{t(TIER_NAME_KEY[r.tier])}</Text>
                          <View style={[styles.gems, { backgroundColor: colors.controlTrack }]}>
                            <Icon name="gem" size={12} color={colors.textPrimary} />
                            <Text style={[styles.gemsText, { color: colors.textPrimary }]}>{r.gems}</Text>
                          </View>
                        </View>
                        <Text style={[styles.small, { color: colors.textSecondary }]}>
                          {r.tier === 'sterk'
                            ? t('season.rewardSterk', { title: sterkTitle(overview.season.id) })
                            : r.tier === 'lutke'
                              ? t('season.rewardShine')
                              : t('season.rewardFrame')}
                        </Text>
                      </View>
                      <FramePreview tier={r.tier} />
                    </View>
                  ))}
                </GlassCard>
                <Text style={[styles.small, { color: colors.textSecondary }]}>{t('season.gemsNote')}</Text>
              </View>

              {overview.lastSeason ? (
                <View style={styles.section}>
                  <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
                    {t('season.last', { season: seasonLabel(t, overview.lastSeason.id) })}
                  </Text>
                  {overview.lastSeason.reward ? (
                    <Note icon="sparkle">
                      {t('season.lastReward', { rank: t(TIER_NAME_KEY[overview.lastSeason.reward.tier]), gems: overview.lastSeason.reward.gems })}
                    </Note>
                  ) : (
                    <Note>{t('season.lastNone')}</Note>
                  )}
                </View>
              ) : null}

              {emblems.length > 0 ? (
                <View style={styles.section}>
                  <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
                    {t('season.emblems')}
                  </Text>
                  <View style={styles.emblems}>
                    {emblems.map((e) => {
                      const s = seasonById(e.seasonId);
                      const label = `${seasonLabel(t, e.seasonId)} · ${t(GAME_NAME_KEY[e.game])} · ${rankLabel(t, e.peakTier, null)}`;
                      return (
                        <View key={`${e.seasonId}-${e.game}`} style={styles.emblem}>
                          <RankEmblem tier={e.peakTier} size={72} season={{ name: s.name, year: s.year }} label={label} />
                          <Text style={[styles.emblemText, { color: colors.textSecondary }]} numberOfLines={1}>
                            {t(GAME_NAME_KEY[e.game])}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {frames.length > 0 ? (
                <View style={styles.section}>
                  <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
                    {t('season.frames')}
                  </Text>
                  <GlassCard padding="tight">
                    {frames.map((sku) => {
                      const tier = frameTierOf(sku)!;
                      const on = wearing === sku;
                      return (
                        <Pressable
                          key={sku}
                          onPress={() => void wear(on ? null : sku)}
                          disabled={busy !== null}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${t('season.frameOf', { tier: t(TIER_NAME_KEY[tier]) })}. ${on ? t('season.takeOff') : t('season.wear')}`}
                          style={({ pressed }) => [styles.frameRow, { opacity: pressed ? 0.7 : 1 }]}
                        >
                          <SeasonFramed tier={tier} size={64} label={t('season.frameOf', { tier: t(TIER_NAME_KEY[tier]) })}>
                            <InitialsAvatar name={user?.displayName ?? user?.username ?? ''} id={user?.id ?? ''} size={framedAvatarSize(64)} />
                          </SeasonFramed>
                          <Text style={[styles.flex, styles.rewardName, { color: colors.textPrimary }]}>{t('season.frameOf', { tier: t(TIER_NAME_KEY[tier]) })}</Text>
                          <Text style={[styles.wearText, { color: on ? colors.success : colors.primary }]}>{on ? t('season.wearing') : t('season.wear')}</Text>
                        </Pressable>
                      );
                    })}
                  </GlassCard>
                  {frameError ? <Note tone="danger" icon="alert">{frameError}</Note> : null}
                </View>
              ) : null}
            </ScrollView>
          ) : null
        }
      </AsyncBoundary>
    </GradientBackground>
  );
}

type Translate = Parameters<typeof seasonTitle>[0];

/** The best tier reached this season in any game, or null before the first rated game counts. */
export function bestPeak(ranks: MyRanks | null): PointsTier | null {
  let best: PointsTier | null = null;
  for (const card of ranks?.ranks ?? []) {
    const peak = card.season.peakTier;
    if (peak && (best === null || tierIndex(peak) > tierIndex(best))) best = peak;
  }
  return best;
}

function seasonLabel(t: Translate, id: string): string {
  return seasonTitle(t, seasonById(id));
}

function rewardLabel(t: Translate, tier: RankTier, gems: number, seasonId: string): string {
  const what = tier === 'sterk' ? t('season.rewardSterk', { title: sterkTitle(seasonId) }) : tier === 'lutke' ? t('season.rewardShine') : t('season.rewardFrame');
  return `${rankLabel(t, tier, null)}. ${what}. ${t('season.gems', { count: gems })}`;
}

/** A frame as a small ring, with no face in it: what the reward looks like. */
function FramePreview({ tier }: { tier: RankTier }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <SeasonFramed tier={tier} size={44} label={t('season.frameOf', { tier: t(TIER_NAME_KEY[tier]) })}>
      <View style={[styles.emptyFace, { backgroundColor: colors.controlTrack }]} />
    </SeasonFramed>
  );
}

/**
 * The season while it loads, in the page's own column: the emblem and its
 * name, the three games' meters, and the rewards' first rows.
 */
function SeasonSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <View style={styles.content} accessibilityLabel={t('common.loading')}>
      <GlassCard>
        <View style={styles.hero}>
          <Skeleton width={136} height={136} radius={radii.pill} />
          <SkeletonText size={typography.sizes.xxl} lineHeight={HERO_TITLE_LINE} width={160} align="center" style={styles.heroSkeleton} />
          <SkeletonText size={typography.sizes.md} width={88} align="center" />
          <SkeletonText size={typography.sizes.sm} lineHeight={19} width={120} align="center" style={styles.daysSkeleton} />
          <SkeletonText size={typography.sizes.sm} lineHeight={19} width="60%" align="center" style={styles.stretch} />
        </View>
      </GlassCard>
      <View style={styles.section}>
        <SkeletonText size={typography.sizes.xs} width={112} />
        <SkeletonText size={typography.sizes.sm} lineHeight={19} width="84%" />
        <GlassCard>
          <View style={styles.games}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.game}>
                <View style={styles.gameHead}>
                  <SkeletonText size={typography.sizes.md} width={i % 2 ? 96 : 120} />
                  <SkeletonText size={typography.sizes.sm} lineHeight={19} width={64} />
                </View>
                <Skeleton height={6} radius={radii.pill} />
              </View>
            ))}
          </View>
        </GlassCard>
      </View>
      <View style={styles.section}>
        <SkeletonText size={typography.sizes.xs} width={80} />
        <SkeletonText size={typography.sizes.sm} lineHeight={19} width="76%" />
        <GlassCard padding="tight">
          {/* one for each tier with a reward, as the season pays them */}
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.reward}>
              <Skeleton width={52} height={52} radius={radii.pill} />
              <View style={styles.flex}>
                <SkeletonText size={typography.sizes.md} width="40%" />
                <SkeletonText size={typography.sizes.sm} lineHeight={19} width="64%" />
              </View>
            </View>
          ))}
        </GlassCard>
      </View>
    </View>
  );
}

/** display(34) sets 1.12 */
const HERO_TITLE_LINE = Math.round(typography.sizes.xxl * typography.displayLineHeight);

const styles = StyleSheet.create({
  // a centred line in the hero spans it, so a bar given as a share of it has something to be a share of
  stretch: { alignSelf: 'stretch' },
  heroSkeleton: { marginTop: spacing.sm },
  daysSkeleton: { marginTop: spacing.xs },
  content: { paddingHorizontal: layout.gutter, paddingVertical: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, width: '100%', maxWidth: 680, alignSelf: 'center' },
  hero: { alignItems: 'center', gap: spacing.xs },
  dim: { opacity: 0.55 },
  heroTitle: { ...display(typography.sizes.xxl), marginTop: spacing.sm },
  meaning: { fontSize: typography.sizes.md },
  days: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  small: { fontSize: typography.sizes.sm, lineHeight: 19 },
  center: { textAlign: 'center' },
  section: { gap: spacing.sm },
  games: { gap: spacing.md },
  game: { gap: spacing.xs },
  gameHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  gameName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  reward: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  flex: { flex: 1, gap: 2 },
  rewardName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  rewardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gems: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  gemsText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  emblems: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  emblem: { alignItems: 'center', width: 88, gap: 2 },
  emblemText: { fontSize: typography.sizes.xs },
  frameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH_TARGET + 20 },
  wearText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  emptyFace: { flex: 1, borderRadius: radii.pill },
});
