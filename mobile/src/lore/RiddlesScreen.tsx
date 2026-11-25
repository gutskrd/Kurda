import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RIDDLE_DIFFICULTIES, type GameDialect, type RiddleCard, type RiddleDifficulty, type RiddleList } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { deviceStore } from '../keyboard/deviceStore';
import { useCourseDialect } from '../learn/courseDialect';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { usePullRefresh } from '../net/usePullRefresh';
import { useDirection } from '../reports/direction';
import { COLUMN, Note, Pill } from '../stories/ui';
import { useListEntrance } from '../theme/animate';
import { Chips, ChipsSkeleton } from '../theme/Chips';
import { display, sectionLabel } from '../theme/fonts';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { PressableScale, Rise, heldDim, heldRow } from '../theme/MotionParts';
import { Pressable } from '../theme/Pressable';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { getRiddles } from './api';
import { rememberList } from './store';
import { DIFFICULTY_KEY, RIDDLES_NAME, STATE_KEY, defaultLoreDialect, inReaderLanguage, kurdishIn, textIn } from './labels';
import { CollectionTitle, VarietySwitch } from './parts';
import { dialectNameKey } from '../i18n/dialectName';

type Filter = 'all' | RiddleDifficulty;

/** Where a guest has said they have read the note about keeping their riddles: said once, on this phone. */
const GUEST_NOTE_KEY = 'hevalo.lore.guest-note.v1';

/** A riddle's state as a mark beside its question: nothing yet, begun, solved, its answer seen. */
const STATE_ICON: Record<RiddleCard['state'], IconName | null> = { new: null, trying: 'lightbulb', solved: 'check', revealed: 'eye' };

/**
 * The riddles (Learn → Stories, and `app/learn/riddles`): how many of the variety the reader has solved, the variety
 * switch, the riddle of the day set large, then every riddle by difficulty with chips to filter. Each row is the
 * question in its own Kurdish, with its translation when translations are on, and a mark for where the reader stands.
 *
 * A list never holds an answer, hint or explanation, and this screen asks for none. A guest plays like anyone, with
 * their riddles kept on the guest account; a quiet note says once that an account keeps them everywhere.
 */
export function RiddlesScreen({ dialect: asked, onExit }: { dialect?: GameDialect; onExit: () => void }): React.JSX.Element {
  const { client, isGuest } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const course = useCourseDialect();
  const reduce = useReducedMotion();
  const bottom = useScreenBottomInset(spacing.lg);
  const [dialect, setDialect] = useState<GameDialect>(asked ?? defaultLoreDialect(locale, course));
  const [list, setList] = useState<RiddleList | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [translated, setTranslated] = useState(false);
  const [guestNote, setGuestNote] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await getRiddles(client, dialect);
    if (res.ok) {
      rememberList(dialect, res.data.riddles, res.data.daily);
      setList(res.data);
    } else setError(res.error);
  }, [client, dialect]);

  // Read again on coming back from a riddle: one just solved moves the count and its mark.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const pull = usePullRefresh(load);

  useEffect(() => {
    if (!isGuest) return;
    let live = true;
    void deviceStore.get(GUEST_NOTE_KEY).then((seen) => {
      if (live && !seen) setGuestNote(true);
    });
    return () => {
      live = false;
    };
  }, [isGuest]);
  const dismissGuestNote = (): void => {
    setGuestNote(false);
    void deviceStore.set(GUEST_NOTE_KEY, '1');
  };

  const switchDialect = (d: GameDialect): void => {
    if (d === dialect) return;
    setList(null);
    setFilter('all');
    setDialect(d);
  };

  const open = (r: RiddleCard): void => navigation.navigate('Riddle', { slug: r.slug });
  const delayFor = useListEntrance(list !== null);

  const daily = list?.daily ? (list.riddles.find((r) => r.slug === list.daily) ?? null) : null;
  const groups = RIDDLE_DIFFICULTIES.filter((d) => filter === 'all' || filter === d)
    .map((d) => ({ difficulty: d, riddles: (list?.riddles ?? []).filter((r) => r.difficulty === d) }))
    .filter((g) => g.riddles.length > 0);
  const offered = RIDDLE_DIFFICULTIES.filter((d) => list?.riddles.some((r) => r.difficulty === d));

  let body: React.ReactNode;
  if (error && !list) {
    body = <ErrorRetry message={describeError(error, t)} onRetry={() => void load()} />;
  } else if (!list) {
    body = <ListSkeleton />;
  } else if (list.total === 0) {
    body = <Note icon="question">{t('lore.riddles.empty', { variety: t(dialectNameKey(dialect)) })}</Note>;
  } else {
    let shown = 0;
    body = (
      <>
        {daily ? <DailyRiddle riddle={daily} translated={translated} onOpen={() => open(daily)} /> : null}
        <View style={[styles.listHead, { flexDirection: dir.row }]}>
          <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('lore.riddles.all')}
          </Text>
          <Pressable
            onPress={() => setTranslated((v) => !v)}
            accessibilityRole="switch"
            accessibilityState={{ checked: translated }}
            hitSlop={{ top: 4, bottom: 4 }}
            style={({ pressed }) => [styles.toggle, { flexDirection: dir.row }, pressed && heldDim]}
          >
            <Icon name="translate" size={16} color={colors.primary} />
            <Text style={[styles.toggleText, { color: colors.primary }]}>{translated ? t('lore.translations.hide') : t('lore.translations.show')}</Text>
          </Pressable>
        </View>
        {offered.length > 1 ? (
          <Chips<Filter>
            options={['all', ...offered]}
            value={filter}
            onChange={setFilter}
            labelOf={(f) => (f === 'all' ? t('lore.filter.all') : t(DIFFICULTY_KEY[f]))}
          />
        ) : null}
        {groups.map((g) => {
          const from = shown;
          shown += g.riddles.length;
          return (
            <View key={g.difficulty} style={styles.group}>
              <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
                {t(DIFFICULTY_KEY[g.difficulty])}
              </Text>
              <View style={[styles.rows, { backgroundColor: colors.surface }]}>
                {g.riddles.map((r, i) => (
                  <Rise key={r.slug} delay={reduce ? null : delayFor(from + i)}>
                    <RiddleRow riddle={r} first={i === 0} translated={translated} daily={r.slug === list.daily} onOpen={() => open(r)} />
                  </Rise>
                ))}
              </View>
            </View>
          );
        })}
      </>
    );
  }

  const solvedLine = list && list.total > 0 ? t('lore.riddles.solved', { solved: formatNumber(list.solved, locale), total: formatNumber(list.total, locale) }) : null;
  const loading = !list && !error;

  return (
    <GradientBackground>
      <ScreenHeader title={t('lore.riddles.name')} onBack={onExit} browse />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom + spacing.lg }]} showsVerticalScrollIndicator={false} refreshControl={pull}>
        <CollectionTitle kurmanci={RIDDLES_NAME} localized={t('lore.riddles.name')} line={solvedLine} pending={loading} />
        {loading || (list && list.total > 0) ? <SolvedBar solved={list?.solved ?? 0} total={list?.total ?? 0} /> : null}
        <VarietySwitch value={dialect} onChange={switchDialect} />
        {guestNote ? (
          <View style={[styles.guest, { backgroundColor: colors.controlTrack, flexDirection: dir.row }]}>
            <Icon name="person" size={16} color={colors.textSecondary} />
            <View style={styles.guestBody}>
              <Text style={[styles.guestText, dir.text, { color: colors.textPrimary }]}>{t('lore.guest.riddles')}</Text>
              <Pressable
                onPress={() => navigation.navigate('ClaimAccount')}
                accessibilityRole="button"
                style={({ pressed }) => [styles.guestLink, pressed && heldDim]}
              >
                <Text style={[styles.guestLinkText, dir.text, { color: colors.primary }]}>{t('guest.createAccount')}</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={dismissGuestNote}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={({ pressed }) => [styles.guestClose, pressed && heldDim]}
            >
              <Icon name="close" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}
        {body}
      </ScrollView>
    </GradientBackground>
  );
}

/**
 * How far through the variety's riddles the reader is: a thin ink line, as progress along a road is, drawn once
 * where it stands.
 */
function SolvedBar({ solved, total }: { solved: number; total: number }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const share = total > 0 ? Math.min(1, solved / total) : 0;
  return (
    <View style={[styles.bar, { backgroundColor: colors.controlTrack, flexDirection: dir.row }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.barFill, { width: `${Math.round(share * 100)}%`, backgroundColor: colors.primary }]} />
    </View>
  );
}

/**
 * The riddle of the day, set apart: the question large, its translation when translations are on, its difficulty and
 * the reader's standing. The whole block opens the riddle.
 */
function DailyRiddle({ riddle, translated, onOpen }: { riddle: RiddleCard; translated: boolean; onOpen: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const ku = kurdishIn(riddle.dialect);
  const translation = inReaderLanguage(riddle.translations, locale);
  const facts = [t(DIFFICULTY_KEY[riddle.difficulty]), riddle.state === 'new' ? null : t(STATE_KEY[riddle.state])].filter(Boolean).join(', ');
  return (
    <PressableScale
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={riddle.question}
      {...ku.props}
      accessibilityValue={{ text: `${t('lore.riddles.daily')}, ${facts}` }}
      style={[styles.daily, { backgroundColor: colors.surface }]}
      testID="riddle-daily"
    >
      {/* A label in the page's quiet ink, as the website has it: gold is for what is earned. */}
      <View style={[styles.dailyKicker, { flexDirection: dir.row }]}>
        <Icon name="calendar" size={14} color={colors.textSecondary} />
        <Text style={[sectionLabel, { color: colors.textSecondary }]}>{t('lore.riddles.daily')}</Text>
      </View>
      <Text {...ku.props} style={[styles.dailyQuestion, { color: colors.textPrimary }, ku.style]}>
        {riddle.question}
      </Text>
      {translated && translation ? (
        <Text {...textIn(translation.lang).props} style={[styles.dailyTranslation, { color: colors.textSecondary }, textIn(translation.lang).style]}>
          {translation.value.question}
        </Text>
      ) : null}
      <View style={[styles.dailyFoot, { flexDirection: dir.row }]}>
        <Pill label={t(DIFFICULTY_KEY[riddle.difficulty])} />
        {riddle.state !== 'new' ? <Pill label={t(STATE_KEY[riddle.state])} tone={riddle.state === 'solved' ? 'success' : 'plain'} /> : null}
        <View style={styles.flex} />
        <Text style={[styles.dailyGo, { color: colors.primary }]}>{riddle.state === 'solved' || riddle.state === 'revealed' ? t('lore.riddle.seeAnswer') : t('lore.riddles.go')}</Text>
        <Icon name="chevron-right" size={16} color={colors.primary} style={dir.flip ?? undefined} />
      </View>
    </PressableScale>
  );
}

/** One riddle in the list: where the reader stands with it, its question, and its translation when asked for. */
function RiddleRow({
  riddle,
  first,
  translated,
  daily,
  onOpen,
}: {
  riddle: RiddleCard;
  first: boolean;
  translated: boolean;
  daily: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const ku = kurdishIn(riddle.dialect);
  const translation = inReaderLanguage(riddle.translations, locale);
  const icon = STATE_ICON[riddle.state];
  const value = [t(STATE_KEY[riddle.state]), daily ? t('lore.riddles.daily') : null].filter(Boolean).join(', ');
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={riddle.question}
      {...ku.props}
      accessibilityValue={{ text: value }}
      style={({ pressed }) => [styles.row, { flexDirection: dir.row }, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }, pressed && heldRow(colors.controlTrack)]}
    >
      <View style={[styles.mark, { backgroundColor: riddle.state === 'solved' ? colors.successFill : colors.controlTrack }]} aria-hidden>
        {icon ? <Icon name={icon} size={14} color={riddle.state === 'solved' ? colors.success : colors.textSecondary} /> : null}
      </View>
      <View style={styles.rowMain}>
        <Text {...ku.props} style={[styles.question, { color: colors.textPrimary }, ku.style]} numberOfLines={3}>
          {riddle.question}
        </Text>
        {translated && translation ? (
          <Text {...textIn(translation.lang).props} style={[styles.rowTranslation, { color: colors.textSecondary }, textIn(translation.lang).style]} numberOfLines={3}>
            {translation.value.question}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip ?? undefined} />
    </Pressable>
  );
}

/**
 * The list while it loads, in its own styles: the riddle of the day (label, question, difficulty and the way in), the
 * list's heading with the translations switch, the filter chips, then a difficulty's first rows.
 */
function ListSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const text = typography.sizes.text;
  return (
    <View style={styles.skeleton} accessibilityLabel={t('common.loading')}>
      <View style={[styles.daily, { backgroundColor: colors.surface }]}>
        <SkeletonText size={text} width={120} />
        <View>
          <SkeletonText size={text} lineHeight={styles.dailyQuestion.lineHeight} />
          <SkeletonText size={text} lineHeight={styles.dailyQuestion.lineHeight} width="62%" />
        </View>
        <View style={[styles.dailyFoot, { flexDirection: dir.row }]}>
          <Skeleton width={56} height={24} radius={radii.pill} />
          <View style={styles.flex} />
          <SkeletonText size={text} width={64} />
        </View>
      </View>
      <View style={[styles.listHead, { flexDirection: dir.row }]}>
        <SkeletonText size={text} width={88} />
        <SkeletonText size={text} width={132} />
      </View>
      <ChipsSkeleton />
      <View style={styles.group}>
        <SkeletonText size={text} width={48} />
        <View style={[styles.rows, { backgroundColor: colors.surface }]}>
          {(['58%', '74%', '46%', '66%'] as const).map((w, i) => (
            <View
              key={i}
              style={[styles.row, { flexDirection: dir.row }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
            >
              <Skeleton width={styles.mark.width} height={styles.mark.height} radius={radii.pill} />
              <View style={styles.rowMain}>
                <SkeletonText size={text} lineHeight={styles.question.lineHeight} />
                <SkeletonText size={text} lineHeight={styles.question.lineHeight} width={w} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { ...COLUMN, paddingHorizontal: layout.gutter, paddingTop: spacing.sm, gap: spacing.lg },
  heading: { ...sectionLabel },
  bar: { height: 4, borderRadius: radii.pill, overflow: 'hidden', marginTop: -spacing.md },
  barFill: { height: 4, borderRadius: radii.pill },
  guest: { alignItems: 'flex-start', gap: spacing.sm, borderRadius: radii.md, paddingLeft: spacing.md, paddingRight: spacing.xs, paddingVertical: spacing.xs },
  guestBody: { flex: 1, gap: 2, paddingVertical: spacing.sm },
  guestText: { fontSize: typography.sizes.text, lineHeight: 20 },
  guestLink: { minHeight: 28, justifyContent: 'center' },
  guestLinkText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  guestClose: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  daily: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  dailyKicker: { alignItems: 'center', gap: spacing.xs },
  dailyQuestion: { ...display(typography.sizes.text), lineHeight: Math.round(typography.sizes.text * 1.35) },
  dailyTranslation: { fontSize: typography.sizes.text, lineHeight: 24 },
  dailyFoot: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, minHeight: MIN_TOUCH_TARGET - spacing.sm },
  dailyGo: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  flex: { flex: 1 },
  listHead: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: -spacing.sm },
  toggle: { alignItems: 'center', gap: spacing.xs, minHeight: MIN_TOUCH_TARGET },
  toggleText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  group: { gap: spacing.sm },
  rows: { borderRadius: radii.lg, paddingHorizontal: spacing.md },
  row: { alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: spacing.sm + 2 },
  mark: { width: 24, height: 24, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, gap: 2 },
  question: { fontSize: typography.sizes.text, lineHeight: 24 },
  rowTranslation: { fontSize: typography.sizes.text, lineHeight: 20 },
  skeleton: { gap: spacing.lg },
});
