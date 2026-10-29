import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { justDone, nextChest, questRows, waitingRows, withOpened, type QuestDay, type QuestRow, type QuestStep } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useAuth } from '../auth/AuthContext';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useScreenBottomInset, useScreenTopInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { EmptyState } from '../theme/EmptyState';
import { display, sectionLabel } from '../theme/fonts';
import { ClayButton, ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Skeleton } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { ChestScreen } from './ChestScreen';
import { QuestRows } from './QuestRows';

/**
 * Today's three quests, in one of two places.
 *
 * After a lesson that moved any (`place: 'lesson'`, with the session's
 * `steps`), it is a moment of its own between the streak and wherever the
 * learner was going: "Daily quests", each bar moving from where the lesson
 * found it to where it left it, and a quest finished just now lifting with a
 * gold edge. With a chest to open the main button is "Open chest", and
 * "Later" leaves it waiting on Learn; without one, "Continue" goes on.
 *
 * From Learn (`place: 'learn'`) it is the quests as they stand, with a way
 * back and "Open chest" while one waits.
 *
 * Under today's three, in either place, "Earlier" lists the quests of the
 * last week that were done and whose chests were never opened: a chest is
 * not lost at midnight.
 *
 * "Open chest" opens each chest waiting, one after another (ChestScreen):
 * Continue on one goes to the next, and after the last back to where the
 * learner was going — the lesson's way on, or this list. The list is read
 * from `GET /me/quests` when it opens; after a lesson, if it cannot be read,
 * the quests the lesson moved are shown on their own.
 */
export function QuestsScreen({ place, steps = [], onDone }: { place: 'lesson' | 'learn'; steps?: QuestStep[]; onDone: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const top = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);
  const [day, setDay] = useState<QuestDay | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState<string[]>([]);
  const [chest, setChest] = useState<QuestRow | null>(null);

  useEffect(() => {
    let live = true;
    setStatus('loading');
    void client.get<QuestDay>('/me/quests').then((res) => {
      if (!live) return;
      if (res.ok) setDay(res.data);
      setStatus(res.ok ? 'ready' : 'failed');
    });
    return () => {
      live = false;
    };
  }, [client, attempt]);

  const rows = useMemo(() => withOpened(questRows(day, place === 'lesson' ? steps : []), opened), [day, steps, place, opened]);
  const earlier = useMemo(() => withOpened(waitingRows(day), opened), [day, opened]);
  // the chests open in the order they are listed: today's, then the earlier days'
  const all = useMemo(() => [...rows, ...earlier], [rows, earlier]);
  // after a lesson the list waits for its answer; if none comes, the steps are what is known
  const shown = status === 'loading' ? null : rows;
  const finishedNow = place === 'lesson' && (shown ?? []).some(justDone);
  const waiting = nextChest(all);

  useEffect(() => {
    if (finishedNow) AccessibilityInfo.announceForAccessibility?.(t('quests.justDone'));
  }, [finishedNow, t]);

  const chestDone = useCallback(
    (open: boolean) => {
      const was = chest;
      if (!was) return;
      const after = open ? withOpened(all, [was.id]) : all;
      if (open) setOpened((ids) => [...ids, was.id]);
      // a chest that stayed shut ends the run of them: it waits on Learn
      const next = open ? nextChest(after, was.id) : null;
      setChest(next);
      if (!next && place === 'lesson') onDone();
    },
    [chest, all, place, onDone],
  );

  if (chest) return <ChestScreen key={chest.id} questId={chest.id} tier={chest.chest} onDone={chestDone} />;

  const body =
    status === 'failed' && place === 'learn' ? (
      <ErrorRetry onRetry={() => setAttempt((n) => n + 1)} />
    ) : shown === null ? (
      <RowsSkeleton />
    ) : shown.length === 0 && earlier.length === 0 ? (
      <EmptyState title={t('quests.empty')} />
    ) : (
      <>
        <QuestRows rows={shown} play={place === 'lesson'} />
        {earlier.length > 0 ? (
          <>
            <Text style={[styles.earlier, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('quests.earlier')}
            </Text>
            <QuestRows rows={earlier} />
          </>
        ) : null}
        {day ? (
          <View style={[styles.month, { flexDirection: dir.row, borderColor: colors.separator }]}>
            <Icon name="calendar" size={20} color={colors.goldText} />
            <Text style={[styles.monthText, dir.text, { color: colors.textPrimary }]}>
              {t('quests.month', { count: formatNumber(day.monthDone, locale) })}
            </Text>
          </View>
        ) : null}
      </>
    );

  const actions = waiting ? (
    <>
      <ClayButton label={t('quests.openChest')} tone="primary" size="large" icon="gift" onPress={() => setChest(waiting)} />
      {place === 'lesson' ? (
        <Pressable onPress={onDone} accessibilityRole="button" style={({ pressed }) => [styles.later, pressed && styles.pressed]}>
          <Text style={[styles.laterText, { color: colors.textSecondary }]}>{t('quests.later')}</Text>
        </Pressable>
      ) : null}
    </>
  ) : place === 'lesson' && shown !== null ? (
    <ClayButton label={t('common.continue')} tone="primary" size="large" onPress={onDone} />
  ) : null;

  if (place === 'learn') {
    return (
      <GradientBackground>
        <View style={styles.screen} testID="quests-screen">
          <ScreenHeader title={t('quests.title')} leading="close" backLabel={t('common.close')} onBack={onDone} />
          <ScrollView style={styles.screen} contentContainerStyle={[styles.column, styles.learnColumn]}>
            {body}
          </ScrollView>
          {actions ? <View style={[styles.bar, { paddingBottom: bottom }]}>{actions}</View> : null}
        </View>
      </GradientBackground>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: top }]} testID="quests-screen">
      <ScrollView style={styles.screen} contentContainerStyle={[styles.column, styles.lessonColumn]}>
        {finishedNow ? <Text style={[styles.kicker, { color: colors.goldText }]}>{t('quests.justDone')}</Text> : null}
        <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
          {t('quests.title')}
        </Text>
        {body}
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: bottom }]}>{actions}</View>
    </View>
  );
}

/** Three rows in grey while the list is on its way, each the height a row will be. */
function RowsSkeleton(): React.JSX.Element {
  return (
    <View style={styles.skeletons}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={ROW_HEIGHT} radius={radii.lg} />
      ))}
    </View>
  );
}

/** A row: its words (17pt on a 22pt line), the bar under them, and the padding round both. */
const ROW_HEIGHT = 22 + spacing.sm + 46 * (100 / 120) + spacing.md + spacing.sm + 2;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { paddingHorizontal: layout.gutter, gap: spacing.md, maxWidth: layout.column, width: '100%', alignSelf: 'center' },
  lessonColumn: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.lg },
  learnColumn: { paddingTop: spacing.md, paddingBottom: spacing.xl },
  kicker: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center' },
  title: { ...display(typography.sizes.xxl), textAlign: 'center', marginBottom: spacing.sm },
  month: { alignItems: 'center', gap: spacing.sm + 4, borderWidth: 1.5, borderRadius: radii.lg, padding: spacing.md },
  monthText: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  earlier: { ...sectionLabel, marginTop: spacing.sm },
  skeletons: { gap: spacing.sm + 4 },
  bar: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm, gap: spacing.xs },
  later: { minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  pressed: { opacity: 0.6 },
});
