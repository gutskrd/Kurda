import { StyleSheet, Text, View } from 'react-native';
import { fireLadder, fireLevel, fireSizeToFit, type FireLadderPlace } from '@kurda/shared';
import { GOLD_INK } from '../coursemap/path';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { BottomSheet, SheetScrollView } from '../theme/BottomSheet';
import { Fire } from '../theme/Fire';
import { display } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { FIRE_STAGE_NAME } from './fireWords';
import { learningStats, streakLabelKey, type Streak } from './format';

/**
 * The streak's whole story, in a sheet: how long it is, and beside it the
 * three numbers a missed day never takes away — the longest run, the days
 * learned in all, and the freezes learning has earned, with what one costs —
 * and under them the ladder of the fire's stages, what lies ahead.
 *
 * The streak is the number most likely to make somebody stop just after a
 * lapse, so it never stands here alone. Opened from the fire in Learn's
 * corner and from the streak on your profile; `streak` null keeps it closed.
 */
export function StreakSheet({ streak, onClose }: { streak: Streak | null; onClose: () => void }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <BottomSheet visible={streak !== null} onClose={onClose} title={t('profile.stat.streak')} contentStyle={styles.scroller}>
      {streak ? (
        <SheetScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <StreakDetail streak={streak} />
          <FireLadder days={streak.current} />
        </SheetScrollView>
      ) : null}
    </BottomSheet>
  );
}

/** The fire beside the streak in words: framed in a square this big, whatever its stage. */
const HEAD_FIRE = 48;

function StreakDetail({ streak }: { streak: Streak }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const days = streak.current;
  const level = fireLevel(days);
  const words = days > 0 ? t(streakLabelKey(days), { count: formatNumber(days, locale) }) : t('learn.today.streakStart');
  const stats = learningStats(streak);
  const cells = [
    { label: t('profile.stat.longestStreak'), value: stats.longest },
    { label: t('profile.stat.daysLearned'), value: stats.daysLearned },
    { label: t('profile.stat.freezes'), value: stats.freezes },
  ];
  return (
    <>
      <View style={[styles.head, { flexDirection: dir.row }]}>
        <View style={styles.headFire}>
          <Fire size={fireSizeToFit(level.stage, HEAD_FIRE, HEAD_FIRE)} level={level} framed />
        </View>
        <Text style={[styles.words, dir.text, { color: colors.textPrimary }]}>{words}</Text>
      </View>
      <View style={[styles.cells, { flexDirection: dir.row }]}>
        {cells.map((cell) => (
          <View key={cell.label} style={[styles.cell, { backgroundColor: colors.surface }]} accessible accessibilityLabel={`${cell.value} ${cell.label}`}>
            <Text style={[styles.value, { color: colors.textPrimary }]}>{formatNumber(cell.value, locale)}</Text>
            <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={2}>
              {cell.label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[styles.hint, dir.text, { color: colors.textSecondary }]}>{t('profile.freezeHint', { count: stats.sessionsPerFreeze })}</Text>
    </>
  );
}

/** How a screen reader hears a stage, by where it stands. */
const PLACE_WORDS: Record<FireLadderPlace, TranslationKey> = {
  reached: 'fire.ladder.reached',
  now: 'fire.ladder.current',
  ahead: 'fire.ladder.ahead',
};

/** Each stage's fire on the ladder, framed to fill a square this big (a spark as plain as the Newroz fire, each telling by what it has, and every row as tall), and the round it stands in. */
const RUNG_FIRE = 44;
const RUNG_ART = 52;

/**
 * The fire's stages from the spark to the Newroz fire (shared `fireLadder`),
 * each a small fire with its name and the day it comes: the ones reached
 * burning with a check, the one burning now ringed and marked "Now", the
 * ones ahead standing still and dimmed — something to look forward to,
 * never greyed out. Each is one element to a screen reader, said in full.
 */
function FireLadder({ days }: { days: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  return (
    <View style={styles.ladder} testID="fire-ladder">
      <Text style={[styles.ladderTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {t('fire.ladder.title')}
      </Text>
      {fireLadder(days).map((step) => {
        const name = t(FIRE_STAGE_NAME[step.stage]);
        const day = formatNumber(step.day, locale);
        const now = step.place === 'now';
        return (
          <View
            key={step.stage}
            style={[styles.rung, { flexDirection: dir.row }, now && { backgroundColor: `${colors.gold}26` }]}
            accessible
            accessibilityLabel={t(PLACE_WORDS[step.place], { stage: name, count: day })}
            testID={`rung-${step.place}`}
          >
            <View style={[styles.rungArt, now && { borderColor: colors.gold }, step.place === 'ahead' && styles.ahead]}>
              <Fire size={fireSizeToFit(step.stage, RUNG_FIRE, RUNG_FIRE)} level={step.level} still={step.place === 'ahead'} framed />
            </View>
            <View style={styles.rungWords}>
              <View style={[styles.rungName, { flexDirection: dir.row }]}>
                <Text style={[styles.name, dir.text, { color: colors.textPrimary }]}>{name}</Text>
                {step.place === 'reached' ? <Icon name="check" size={16} color={colors.success} /> : null}
              </View>
              <Text style={[styles.day, dir.text, { color: colors.textSecondary }]}>{t('fire.ladder.day', { count: day })}</Text>
            </View>
            {now ? (
              <View style={[styles.now, { backgroundColor: colors.gold }]}>
                <Text style={[styles.nowText, { color: GOLD_INK }]}>{t('fire.ladder.now')}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scroller: { paddingHorizontal: 0 },
  body: { gap: spacing.md, paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
  head: { alignItems: 'center', gap: spacing.sm },
  headFire: { width: HEAD_FIRE, height: HEAD_FIRE, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, ...display(typography.sizes.xl) },
  cells: { gap: spacing.sm },
  cell: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.md, paddingHorizontal: spacing.xs, borderRadius: radii.md },
  value: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  label: { fontSize: typography.sizes.xs, textAlign: 'center' },
  hint: { fontSize: typography.sizes.xs, lineHeight: 18 },
  ladder: { gap: 2, marginTop: spacing.xs },
  ladderTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, marginBottom: spacing.xs },
  rung: { alignItems: 'center', gap: spacing.sm + 4, minHeight: RUNG_ART + 4, padding: 2, borderRadius: radii.lg },
  rungArt: { width: RUNG_ART, height: RUNG_ART, borderRadius: radii.pill, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  // still to come: quieter, never grey
  ahead: { opacity: 0.5 },
  rungWords: { flex: 1, gap: 1 },
  rungName: { alignItems: 'center', gap: spacing.xs + 2 },
  name: { flexShrink: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  day: { fontSize: typography.sizes.sm, fontVariant: ['tabular-nums'] },
  now: { paddingVertical: 3, paddingHorizontal: spacing.sm + 2, borderRadius: radii.pill, marginHorizontal: spacing.sm },
  nowText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
});
