import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  FEW_PLAYERS,
  RANKED_GAMES,
  RANK_TIERS,
  STERK_RULE,
  progressToNext,
  type MyRanks,
  type RankBoard,
  type RankBoardScope,
  type RankCard,
  type RankTier,
  type RankedGame,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { AsyncBoundary } from '../net/AsyncBoundary';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { GlassCard, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { display, sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { GAME_NAME_KEY } from '../play/labels';
import { getMyRanks, getRankBoard } from './api';
import { PlacementEmblem, RankEmblem } from './art';
import { TIER_NAME_KEY, cardHeadline, daysLeftText, nextStepText, rankLabel, rankName, seasonTitle, tierMeaning } from './format';
import { Meter } from './Meter';
import { ShieldPips } from './RankCard';
import { PLACING_TINT, rankTint } from './tint';

/**
 * One game's rank up close (contract 4 §R, §U): the emblem large, the points
 * and the way to the next division, the climb from Deşt to Stêrk with where
 * you stand on it, and the game's boards — your friends (always, at any age)
 * and the top players (known adults only, by name only when their profile is
 * public; hidden while too few people play rated for a top list to mean
 * anything).
 */
export function RanksScreen({ game: initial, onExit }: { game?: RankedGame; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [game, setGame] = useState<RankedGame>(initial ?? 'wordle-battle');
  const [ranks, setRanks] = useState<MyRanks | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (initial) setGame(initial);
  }, [initial]);

  const load = useCallback(() => {
    void getMyRanks(client).then((res) => {
      if (res.ok) {
        setRanks(res.data);
        setError(null);
      } else setError(res.error);
    });
  }, [client]);
  useFocusEffect(useCallback(() => load(), [load]));

  const card = ranks?.ranks.find((r) => r.game === game) ?? null;

  return (
    <GradientBackground>
      <ScreenHeader title={t('ranks.title')} onBack={onExit} />
      <View style={styles.picker}>
        <Segmented<RankedGame> options={RANKED_GAMES} value={game} onChange={setGame} labelOf={(g) => t(GAME_NAME_KEY[g])} groupLabel={t('play.sheet.game')} />
      </View>
      <AsyncBoundary loading={!ranks && !error} error={!ranks ? error : null} onRetry={load} skeleton={<RanksSkeleton />}>
        {() =>
          ranks && card ? (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <Hero card={card} />
              <Pressable
                onPress={() => navigation.navigate('Season')}
                accessibilityRole="button"
                style={({ pressed }) => [styles.seasonRow, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
              >
                <Icon name="calendar" size={18} color={colors.textSecondary} />
                <View style={styles.flex}>
                  <Text style={[styles.seasonTitle, { color: colors.textPrimary }]}>
                    {seasonTitle(t, ranks.season)} · {daysLeftText(t, ranks.season.daysLeft)}
                  </Text>
                  <Text style={[styles.small, { color: colors.textSecondary }]}>
                    {card.season.peakTier
                      ? t('ranks.seasonPeak', { rank: t(TIER_NAME_KEY[card.season.peakTier]), count: card.season.ratedGames })
                      : t('ranks.seasonGames', { count: card.season.ratedGames })}
                  </Text>
                </View>
                <Icon name="chevron-right" size={16} color={colors.textSecondary} />
              </Pressable>
              <Ladder card={card} />
              <Boards game={game} />
            </ScrollView>
          ) : null
        }
      </AsyncBoundary>
    </GradientBackground>
  );
}

/**
 * A game's rank while it loads, in the page's own layout: the emblem, the
 * rank's name, its points and meter, the three numbers, the season's row and
 * the climb — the column the screen is about to fill.
 */
function RanksSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.content} accessibilityLabel={t('common.loading')}>
      <GlassCard>
        <View style={styles.hero}>
          <Skeleton width={148} height={148} radius={radii.pill} />
          <SkeletonText size={typography.sizes.xxl} lineHeight={HERO_TITLE_LINE} width={150} align="center" style={styles.heroTitleRow} />
          <SkeletonText size={typography.sizes.md} width={96} align="center" />
          <SkeletonText size={typography.sizes.lg} width={88} align="center" />
          <Skeleton height={10} radius={radii.pill} style={styles.heroMeter} />
          <SkeletonText size={typography.sizes.sm} lineHeight={19} width="70%" align="center" style={styles.stretch} />
        </View>
        <View style={[styles.stats, { borderTopColor: colors.separator }]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.stat}>
              <SkeletonText size={typography.sizes.lg} width={32} align="center" />
              <SkeletonText size={typography.sizes.xs} width={52} align="center" />
            </View>
          ))}
        </View>
      </GlassCard>
      <View style={[styles.seasonRow, { backgroundColor: colors.controlTrack }]}>
        <Skeleton width={18} height={18} radius={radii.pill} raised />
        <View style={styles.flex}>
          <SkeletonText size={typography.sizes.md} width="62%" raised />
          <SkeletonText size={typography.sizes.sm} lineHeight={19} width="44%" raised />
        </View>
      </View>
      <View style={styles.section}>
        <SkeletonText size={typography.sizes.xs} width={72} />
        <GlassCard padding="tight">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={styles.rung}>
              <Skeleton width={44} height={44} radius={radii.pill} />
              <View style={styles.flex}>
                <SkeletonText size={typography.sizes.md} width={i % 2 ? '36%' : '48%'} />
                <SkeletonText size={typography.sizes.sm} lineHeight={19} width="40%" />
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

function Hero({ card }: { card: RankCard }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const head = cardHeadline(card);
  const placing = head.kind === 'placing';
  const title = placing ? t('ranks.placing', { played: head.played, of: head.of }) : rankName(t, head.tier, head.division);
  const meaning = placing ? null : tierMeaning(t, head.tier);
  const next = nextStepText(t, card);
  const fraction = placing ? head.played / Math.max(1, head.of) : (card.progress ?? progressToNext(card.points)).fraction;
  return (
    <GlassCard>
      <View style={styles.hero}>
        {placing ? (
          <PlacementEmblem done={head.played} size={148} label={title} />
        ) : (
          <RankEmblem tier={head.tier} division={head.division} size={148} label={rankLabel(t, head.tier, head.division)} />
        )}
        <View style={styles.heroTitleRow}>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]} accessibilityRole="header">
            {title}
          </Text>
          {card.provisional && !placing ? (
            <View style={[styles.question, { backgroundColor: colors.controlTrack }]} accessible accessibilityLabel={t('ranks.provisional')}>
              <Text style={[styles.questionText, { color: colors.textSecondary }]}>?</Text>
            </View>
          ) : null}
        </View>
        {meaning ? <Text style={[styles.heroMeaning, { color: colors.textSecondary }]}>{meaning}</Text> : null}
        {placing ? (
          <Text style={[styles.heroSub, { color: colors.textSecondary }]}>{t('ranks.placingHint', { count: Math.max(0, head.of - head.played) })}</Text>
        ) : (
          <Text style={[styles.points, { color: colors.textPrimary }]}>{t('ranks.pointsCount', { count: formatNumber(card.points, locale) })}</Text>
        )}
        <Meter fraction={fraction} tint={placing ? PLACING_TINT[scheme] : rankTint(head.tier, scheme)} height={10} label={next ?? undefined} style={styles.heroMeter} />
        {next ? <Text style={[styles.small, { color: colors.textSecondary }]}>{next}</Text> : null}
        {card.provisional && !placing ? <Text style={[styles.small, styles.centerText, { color: colors.textSecondary }]}>{t('ranks.provisional')}</Text> : null}
        {card.shieldGames > 0 ? <ShieldPips count={card.shieldGames} /> : null}
        {card.resting ? <Text style={[styles.small, styles.centerText, { color: colors.textSecondary }]}>{t('ranks.restingOwn')}</Text> : null}
      </View>
      <View style={[styles.stats, { borderTopColor: colors.separator }]}>
        <Stat value={formatNumber(card.ratedGames, locale)} label={t('ranks.stat.games')} />
        <Stat value={formatNumber(card.wins, locale)} label={t('ranks.stat.wins')} />
        <Stat value={formatNumber(card.bestPoints, locale)} label={t('ranks.stat.best')} />
      </View>
    </GlassCard>
  );
}

function Stat({ value, label }: { value: string; label: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

/** The climb, top down: Stêrk, then Lûtke to Deşt, with the tier you are in marked in words. */
function Ladder({ card }: { card: RankCard }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const tiers: RankTier[] = ['sterk', ...[...RANK_TIERS].reverse().map((r) => r.key)];
  return (
    <View style={styles.section}>
      <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('ranks.ladder')}
      </Text>
      <GlassCard padding="tight">
        {tiers.map((tier) => {
          const here = card.tier === tier && !card.placement;
          const floor = tier === 'sterk' ? null : RANK_TIERS.find((r) => r.key === tier)!.floor;
          const meaning = tierMeaning(t, tier);
          const fact = tier === 'sterk' ? t('ranks.sterkRule', { share: STERK_RULE.topShare * 100, games: STERK_RULE.minGames }) : t('ranks.floor', { count: floor! });
          return (
            <View
              key={tier}
              accessible
              accessibilityLabel={[rankLabel(t, tier, null), fact, here ? t('ranks.youAreHere') : null].filter(Boolean).join('. ')}
              style={[styles.rung, here && { backgroundColor: colors.controlTrack }]}
            >
              <RankEmblem tier={tier} size={44} label={rankLabel(t, tier, null)} />
              <View style={styles.flex}>
                <Text style={[styles.rungName, { color: colors.textPrimary }]}>
                  {t(TIER_NAME_KEY[tier])}
                  {meaning ? <Text style={{ color: colors.textSecondary }}>{`  ${meaning}`}</Text> : null}
                </Text>
                <Text style={[styles.small, { color: colors.textSecondary }]}>{fact}</Text>
              </View>
              {here ? (
                <View style={[styles.here, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.hereText, { color: colors.textOnPrimary }]}>{t('ranks.youAreHere')}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </GlassCard>
    </View>
  );
}

function Boards({ game }: { game: RankedGame }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const [scope, setScope] = useState<RankBoardScope>('friends');
  const [board, setBoard] = useState<RankBoard | null>(null);

  useEffect(() => {
    let live = true;
    setBoard(null);
    void getRankBoard(client, game, scope).then((res) => {
      if (live && res.ok) setBoard(res.data);
    });
    return () => {
      live = false;
    };
  }, [client, game, scope]);

  return (
    <View style={styles.section}>
      <Text style={[sectionLabel, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('ranks.boards')}
      </Text>
      <Segmented<RankBoardScope>
        options={['friends', 'top']}
        value={scope}
        onChange={setScope}
        labelOf={(s) => (s === 'friends' ? t('ranks.board.friends') : t('ranks.board.top'))}
      />
      {!board ? null : board.hidden ? (
        <Text style={[styles.small, styles.boardNote, { color: colors.textSecondary }]}>{t('ranks.board.hidden', { count: FEW_PLAYERS })}</Text>
      ) : board.entries.length === 0 ? (
        <Text style={[styles.small, styles.boardNote, { color: colors.textSecondary }]}>
          {scope === 'friends' ? t('ranks.board.friendsEmpty') : t('ranks.board.topEmpty')}
        </Text>
      ) : (
        <GlassCard padding="tight">
          {board.entries.map((e) => {
            const name = e.isMe ? t('games.you') : (e.name ?? t('ranks.board.player'));
            const rank = e.resting ? t('ranks.resting') : e.placing || !e.tier ? t('ranks.placingShort') : rankName(t, e.tier, e.division);
            return (
              <View
                key={`${e.position}-${name}`}
                accessible
                accessibilityLabel={`#${e.position}, ${name}, ${rank}, ${t('ranks.pointsCount', { count: e.points })}`}
                style={[styles.entry, e.isMe && { backgroundColor: colors.controlTrack }]}
              >
                <Text style={[styles.pos, { color: colors.textSecondary }]}>{e.position}</Text>
                {e.tier && !e.placing && !e.resting ? (
                  <RankEmblem tier={e.tier} division={e.division} size={32} label={rankLabel(t, e.tier, e.division)} />
                ) : (
                  <View style={styles.noEmblem}>
                    <Icon name="mountains" size={18} color={colors.textSecondary} />
                  </View>
                )}
                <View style={styles.flex}>
                  <Text style={[styles.entryName, { color: colors.textPrimary }, e.isMe && styles.bold]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={[styles.small, { color: colors.textSecondary }]} numberOfLines={1}>
                    {rank}
                  </Text>
                </View>
                <Text style={[styles.entryPoints, { color: colors.textPrimary }]}>{formatNumber(e.points, locale)}</Text>
              </View>
            );
          })}
        </GlassCard>
      )}
      {board?.me && !board.entries.some((e) => e.isMe) ? (
        <Text style={[styles.small, { color: colors.textSecondary }]}>{t('ranks.board.yourPlace', { position: board.me.position, points: board.me.points })}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // a centred line in the hero spans it, so a bar given as a share of it has something to be a share of
  stretch: { alignSelf: 'stretch' },
  picker: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  content: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.lg, width: '100%', maxWidth: 680, alignSelf: 'center' },
  flex: { flex: 1, gap: 2 },
  hero: { alignItems: 'center', gap: spacing.xs },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  heroTitle: { ...display(typography.sizes.xxl) },
  heroMeaning: { fontSize: typography.sizes.md },
  heroSub: { fontSize: typography.sizes.sm, textAlign: 'center' },
  points: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  heroMeter: { marginTop: spacing.sm },
  question: { width: 24, height: 24, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  questionText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  small: { fontSize: typography.sizes.sm, lineHeight: 19 },
  centerText: { textAlign: 'center' },
  stats: { flexDirection: 'row', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: typography.sizes.xs, letterSpacing: 0.4, textTransform: 'uppercase' },
  seasonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.md, padding: spacing.md, minHeight: MIN_TOUCH_TARGET },
  seasonTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  section: { gap: spacing.sm },
  rung: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.md, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  rungName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  here: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  hereText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  boardNote: { paddingVertical: spacing.sm },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingHorizontal: spacing.sm, minHeight: MIN_TOUCH_TARGET + 8 },
  pos: { width: 24, textAlign: 'center', fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  noEmblem: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  entryName: { fontSize: typography.sizes.md },
  bold: { fontWeight: typography.weights.bold },
  entryPoints: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
});
