import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  badgeDef,
  badgeTierKey,
  fireLadder,
  fireLevel,
  fireSizeToFit,
  freezeLine,
  hueSteps,
  nextFireStage,
  splitWeeks,
  weekInsights,
  weekStats,
  type FireLadderPlace,
  type TodayBadge,
} from '@kurda/shared';
import { badgeMeaning, badgeName, tierName } from '../badges/format';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import type { RootNavigation } from '../navigation/rootStack';
import { BadgeMedal } from '../ranks/art';
import { useDirection } from '../reports/direction';
import { FIRE_NEXT, FIRE_STAGE_NAME } from '../streak/fireWords';
import type { Streak } from '../streak/format';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { Fire } from '../theme/Fire';
import { Icon } from '../theme/Icon';
import { Pressable } from '../theme/Pressable';
import { Skeleton } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { ClayButton } from '../theme/glass';
import { pressedDim } from '../theme/motion';
import { layout, radii, spacing, typography, wash } from '../theme/tokens';
import { DailyZer } from './DailyZer';
import { Insights } from './Insights';
import { RepairOffer, Restored } from './Repair';
import type { Today, TodayView } from './today';
import { WeekRow, thisWeek } from './WeekRow';

/**
 * The daily view, as on the website: one sheet for the streak and the daily Zêr, opened from the home card, Learn's
 * fire and the profile. The fire with the streak under it, this week's days, today's Zêr, the week's stats, what the
 * insights say, the latest badge, and quietly the freezes, a restore while one is offered, the longest streak and the
 * fire's stages. The insights open as a second step in the same sheet, with a ‹ back. `onStreak` hands a restored
 * streak to the opener; `onLearn` is the way to a lesson when today's Zêr waits for one.
 */
export function DailySheet({
  visible,
  onClose,
  today,
  onStreak,
  onLearn,
}: {
  visible: boolean;
  onClose: () => void;
  today: Today;
  onStreak?: (streak: Streak) => void;
  onLearn?: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const [step, setStep] = useState<'view' | 'insights'>('view');
  useEffect(() => {
    if (visible) setStep('view');
  }, [visible]);
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={step === 'insights' ? t('daily.insights.title') : t('profile.stat.streak')}
      onBack={step === 'insights' ? () => setStep('view') : undefined}
      contentStyle={styles.scroller}
      testID="daily-sheet"
    >
      {visible ? (
        <DailyBody
          today={today}
          step={step}
          onInsights={() => setStep('insights')}
          onStreak={onStreak}
          onLearn={
            onLearn
              ? () => {
                  onClose();
                  onLearn();
                }
              : undefined
          }
        />
      ) : null}
    </BottomSheet>
  );
}

/** The open sheet's content, mounted only while open, so the just-restored state is forgotten on close. */
function DailyBody({
  today,
  step,
  onInsights,
  onStreak,
  onLearn,
}: {
  today: Today;
  step: 'view' | 'insights';
  onInsights: () => void;
  onStreak?: (streak: Streak) => void;
  onLearn?: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [restored, setRestored] = useState<Streak | null>(null);
  const view = today.view;
  if (!view) {
    return today.failed ? (
      <View style={styles.body}>
        <Text style={[styles.quiet, { color: colors.textSecondary }]}>{t('error.generic')}</Text>
        <ClayButton label={t('common.retry')} variant="outline" onPress={today.reload} />
      </View>
    ) : (
      <DailySkeleton />
    );
  }
  const weeks = splitWeeks(view);
  const insights = weekInsights(weeks, view.streak.daysLearned ?? 0);
  if (step === 'insights') {
    return (
      <SheetScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Insights weeks={weeks} insights={insights} />
      </SheetScrollView>
    );
  }
  const streak = restored ?? view.streak;
  const offer = restored ? null : (view.streak.repair ?? null);
  return (
    <SheetScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} testID="daily-scroll">
      {restored ? <Restored streak={restored} /> : <DailyHead days={streak.current} />}
      <WeekRow week={thisWeek(view.days, view.today, view.weekStart)} />
      {offer ? (
        <RepairOffer
          offer={offer}
          onRestored={(next) => {
            setRestored(next);
            today.change({ streak: next });
            onStreak?.(next);
          }}
        />
      ) : null}
      <DailyZer daily={view.daily} onClaimed={(daily) => today.change({ daily })} onLearn={onLearn} />
      <WeekStatsCard view={view} />
      {insights.length > 0 ? (
        <Row onPress={onInsights} testID="daily-insights-row" label={insights.length === 1 ? t('daily.insights.availableOne') : t('daily.insights.available', { count: insights.length })}>
          <View style={[styles.rowIcon, { backgroundColor: wash(colors.gold) }]}>
            <Icon name="bolt" size={18} color={colors.goldText} />
          </View>
        </Row>
      ) : null}
      {view.badge ? <LatestBadge badge={view.badge} /> : null}
      <FreezeLine streak={streak} />
      <FireSteps days={streak.current} longest={streak.longest} />
    </SheetScrollView>
  );
}

/** The head fire's square, whatever its stage. */
const HEAD_FIRE = 120;

/** The fire, the streak's number large under it, and one line: "day streak", or how a streak starts. */
function DailyHead({ days }: { days: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const level = fireLevel(days);
  const number = formatNumber(days, locale);
  const unit = days > 0 ? t(days === 1 ? 'daily.view.unitOne' : 'daily.view.unit') : t('learn.today.streakStart');
  return (
    <View style={styles.head} accessible accessibilityRole="header" accessibilityLabel={days > 0 ? `${number} ${unit}` : unit} testID="daily-head">
      <View style={styles.fire}>
        <Fire size={fireSizeToFit(level.stage, HEAD_FIRE, HEAD_FIRE)} level={level} framed />
      </View>
      <Text style={[styles.number, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.2}>
        {number}
      </Text>
      <Text style={[styles.unit, { color: colors.textSecondary }]}>{unit}</Text>
    </View>
  );
}

/** A row that opens something: the insights, the latest badge. */
function Row({ label, onPress, children, testID }: { label: string; onPress: () => void; children: React.ReactNode; testID?: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.row, { flexDirection: dir.row, backgroundColor: colors.surface, opacity: pressed ? pressedDim : 1 }]}
    >
      {children}
      <Text style={[styles.rowWords, dir.text, { color: colors.textPrimary }]}>{label}</Text>
      <Icon name={dir.rtl ? 'chevron-left' : 'chevron-right'} size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

/** This week's four numbers, from the server's counts in the learner's own days. */
function WeekStatsCard({ view }: { view: TodayView }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const stats = weekStats(splitWeeks(view).current);
  const cells = [
    { key: 'days', label: t('daily.stats.days'), value: stats.days },
    { key: 'lessons', label: t('daily.stats.lessons'), value: stats.lessons },
    { key: 'practice', label: t('daily.stats.practice'), value: stats.practice },
    { key: 'xp', label: t('profile.stat.xp'), value: stats.xp },
  ];
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]} testID="daily-stats">
      <View style={[styles.cardHead, { flexDirection: dir.row }]}>
        <Text style={[styles.cardTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
          {t('daily.stats.title')}
        </Text>
        <Text style={[styles.cardNote, { color: colors.textSecondary }]}>{t('daily.insights.thisWeek')}</Text>
      </View>
      <View style={[styles.cells, { flexDirection: dir.row }]}>
        {cells.map((cell) => (
          <View key={cell.key} style={styles.cell} accessible accessibilityLabel={`${formatNumber(cell.value, locale)} ${cell.label}`}>
            <Text style={[styles.value, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
              {formatNumber(cell.value, locale)}
            </Text>
            <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={2}>
              {cell.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The badge level earned last, with its picture, leading to every badge. */
function LatestBadge({ badge }: { badge: TodayBadge }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const navigation = useNavigation<RootNavigation>();
  const def = badgeDef(badge.key);
  if (!def) return null;
  const name = badgeName(t, badge.key);
  const tier = tierName(t, badgeTierKey(def, badge.tier), def.tiers.length);
  const meaning = badgeMeaning(t, badge.key);
  const title = tier ? `${name} · ${tier}` : name;
  return (
    <Pressable
      onPress={() => navigation.navigate('Badges')}
      accessibilityRole="button"
      accessibilityLabel={`${t('daily.badge.title')}: ${title}`}
      testID="daily-badge"
      style={({ pressed }) => [styles.row, { flexDirection: dir.row, backgroundColor: colors.surface, opacity: pressed ? pressedDim : 1 }]}
    >
      <BadgeMedal badgeKey={badge.key} tier={badge.tier} tierCount={def.tiers.length} size={44} label="" />
      <View style={styles.rowText}>
        <Text style={[styles.badgeLabel, dir.text, { color: colors.textSecondary }]}>{t('daily.badge.title')}</Text>
        <Text style={[styles.rowWords, dir.text, { color: colors.textPrimary }]}>{title}</Text>
        {meaning ? <Text style={[styles.badgeLabel, dir.text, { color: colors.textSecondary }]}>{meaning}</Text> : null}
      </View>
      <Icon name={dir.rtl ? 'chevron-left' : 'chevron-right'} size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

/** The freezes in one quiet line: those saved, or how near the next one is. */
function FreezeLine({ streak }: { streak: Streak }): React.JSX.Element | null {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const freeze = freezeLine(streak);
  if (!freeze) return null;
  const n = (v: number) => formatNumber(v, locale);
  const words =
    freeze.kind === 'toward'
      ? t('lesson.streak.freeze', { done: n(freeze.done), per: n(freeze.per) })
      : freeze.count === 1
        ? t('lesson.streak.freezeReadyOne')
        : t('lesson.streak.freezeReady', { count: n(freeze.count) });
  return (
    <View style={[styles.quietRow, { flexDirection: dir.row }]} accessible accessibilityLabel={words}>
      <Icon name="ice" size={16} color={hueSteps(scheme, 'blue').base} />
      <Text style={[styles.quiet, { color: colors.textSecondary }]}>{words}</Text>
    </View>
  );
}

/** How a screen reader hears a stage, by where it stands. */
const PLACE_WORDS: Record<FireLadderPlace, TranslationKey> = {
  reached: 'fire.ladder.reached',
  now: 'fire.ladder.current',
  ahead: 'fire.ladder.ahead',
};

/** Each stage's fire fills a square this big, in a round this big, so the row is even. */
const STEP_FIRE = 30;
const STEP_ART = 40;

/**
 * The fire's stages in one row (shared `fireLadder`), as on the website: each a small fire over its day, reached ones
 * burning, the one now ringed, those ahead still and quieter. Under it the stage's name with the next as a near goal,
 * and the longest streak.
 */
function FireSteps({ days, longest }: { days: number; longest: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const n = (v: number) => formatNumber(v, locale);
  const level = fireLevel(days);
  const next = nextFireStage(days);
  return (
    <View style={styles.steps} testID="fire-steps">
      <Text style={[styles.cardTitle, styles.centred, { color: colors.textPrimary }]} accessibilityRole="header">
        {t('fire.ladder.title')}
      </Text>
      <View style={[styles.stepRow, { flexDirection: dir.row }]}>
        {fireLadder(days).map((step) => {
          const name = t(FIRE_STAGE_NAME[step.stage]);
          const now = step.place === 'now';
          return (
            <View key={step.stage} style={styles.step} accessible accessibilityLabel={t(PLACE_WORDS[step.place], { stage: name, count: n(step.day) })} testID={`step-${step.place}`}>
              <View style={[styles.stepArt, now && { backgroundColor: wash(colors.gold), borderColor: colors.gold }, step.place === 'ahead' && styles.ahead]}>
                <Fire size={fireSizeToFit(step.stage, STEP_FIRE, STEP_FIRE)} level={step.level} still={step.place === 'ahead'} framed />
              </View>
              <Text style={[styles.stepDay, { color: now ? colors.textPrimary : colors.textSecondary }, now && styles.stepDayNow]}>{n(step.day)}</Text>
            </View>
          );
        })}
      </View>
      {level.stage !== 'cold' ? (
        <Text style={[styles.quiet, styles.centred, { color: colors.textSecondary }]}>
          <Text style={{ color: colors.textPrimary, fontWeight: typography.weights.bold }}>{t(FIRE_STAGE_NAME[level.stage])}</Text>
          {next && next.stage !== 'cold' && next.stage !== 'spark' ? ` · ${t(FIRE_NEXT[next.stage], { count: n(next.at) })}` : ''}
        </Text>
      ) : null}
      <View style={[styles.quietRow, { flexDirection: dir.row }]} accessible accessibilityLabel={`${t('profile.stat.longestStreak')}: ${n(longest)}`}>
        <Text style={[styles.quiet, { color: colors.textSecondary }]}>{t('profile.stat.longestStreak')}</Text>
        <Text style={[styles.quiet, styles.strong, { color: colors.textPrimary }]}>{n(longest)}</Text>
      </View>
    </View>
  );
}

/** The sheet's shape while the view is asked for. */
function DailySkeleton(): React.JSX.Element {
  return (
    <View style={[styles.body, styles.skeleton]}>
      <Skeleton width={96} height={110} radius={radii.pill} />
      <Skeleton width={72} height={44} radius={radii.sm} />
      <Skeleton height={56} radius={radii.lg} />
      <Skeleton height={88} radius={radii.lg} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroller: { paddingHorizontal: 0 },
  body: { gap: spacing.md, paddingHorizontal: layout.gutter, paddingBottom: spacing.md },
  skeleton: { alignItems: 'center' },
  head: { alignItems: 'center', gap: 2 },
  fire: { width: HEAD_FIRE, height: HEAD_FIRE, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 56, lineHeight: 60, fontWeight: '800', letterSpacing: -1 },
  unit: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
  card: { gap: spacing.sm + 4, padding: spacing.md, borderRadius: radii.lg },
  cardHead: { alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  cardNote: { fontSize: typography.sizes.xs },
  cells: { gap: spacing.sm },
  cell: { flex: 1, alignItems: 'center', gap: 2 },
  value: { fontSize: 24, fontWeight: typography.weights.bold },
  label: { fontSize: typography.sizes.xs, textAlign: 'center' },
  row: { alignItems: 'center', gap: spacing.sm + 4, minHeight: 56, paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.sm + 6, borderRadius: radii.lg },
  rowIcon: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 1 },
  rowWords: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  badgeLabel: { fontSize: typography.sizes.xs },
  quietRow: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs + 2 },
  quiet: { fontSize: typography.sizes.xs, lineHeight: 18 },
  strong: { fontWeight: typography.weights.bold },
  centred: { textAlign: 'center' },
  steps: { gap: spacing.sm + 2, paddingTop: spacing.xs },
  stepRow: { justifyContent: 'space-between' },
  step: { flex: 1, alignItems: 'center', gap: 4 },
  stepArt: { width: STEP_ART, height: STEP_ART, borderRadius: radii.pill, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  // Still to come: quieter, never grey.
  ahead: { opacity: 0.45 },
  stepDay: { fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
  stepDayNow: { fontWeight: typography.weights.bold },
});
