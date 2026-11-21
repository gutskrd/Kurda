import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Animated, AppState, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { hueSteps, type GamesAvailability, type PracticeHub, type PracticeHubUnit, type PracticeMode } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useFontScale } from '../a11y/useFontScale';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { ScreenHeader } from '../navigation/ScreenHeader';
import type { RootNavigation } from '../navigation/rootStack';
import { REST, TONES } from '../coursemap/path';
import { haptic, refreshFelt } from '../feedback/haptics';
import { micRefused } from '../recording/useMicRecorder';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { useCourseDialect } from '../learn/courseDialect';
import { useDirection } from '../reports/direction';
import { useListEntrance, usePop } from '../theme/animate';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { PressableScale, Rise } from '../theme/MotionParts';
import { Skeleton } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { display, sectionLabel } from '../theme/fonts';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { exercisesOf, type PhoneExercise } from './exercises';
import { ROW_HUES, heroOf, hubRows, practiceXpRange, type Hero, type HubRow, type Line } from './hub';

/**
 * The practice hub: a top card with the one thing most worth doing (due words, the last finished unit, the
 * hardest words, or the lessons before any) and one button saying what a session pays, then a row for every other
 * kind with its own badge hue. Empty kinds stay listed, dimmed, saying what would fill them; the two lesson
 * exercises appear only while available (exercises.ts). Loaded in one request (GET /practice/hub) on focus and
 * pull, with exercise availability awaited so the list arrives whole. A microphone denied for good turns the
 * speaking row into a link to Settings.
 */
export function PracticeHubScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const dialect = useCourseDialect();
  const [hub, setHub] = useState<PracticeHub | null>(null);
  const [exercises, setExercises] = useState<PhoneExercise[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refused, setRefused] = useState(false);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    const [res, mic, games] = await Promise.all([
      client.get<PracticeHub>('/practice/hub'),
      micRefused(),
      client.get<GamesAvailability>(`/games/availability?dialect=${dialect}`),
    ]);
    setRefused(mic);
    setExercises(games.ok ? exercisesOf(games.data) : []);
    if (res.ok) {
      setHub(res.data);
      setError(null);
    } else setError(res.error);
  }, [client, dialect]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Back from Settings, where the microphone may just have been allowed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void micRefused().then(setRefused);
    });
    return () => sub?.remove();
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const start = useCallback(
    (mode: PracticeMode, unitId?: string) => navigation.navigate('Practice', unitId ? { mode, unitId } : { mode }),
    [navigation],
  );

  // One row object per kind while the hub is unchanged, so the memoised rows re-render only when it changes.
  const rows = useMemo(() => (hub ? hubRows(hub, { micRefused: refused, exercises }) : []), [hub, refused, exercises]);
  const entering = useListEntrance(hub !== null);

  const press = useCallback(
    (row: HubRow) => {
      if (!row.action) return;
      haptic('select');
      if (row.action.kind === 'start') start(row.action.mode);
      else if (row.action.kind === 'pick') setPicking(true);
      else if (row.action.kind === 'open') navigation.navigate(row.action.route);
      else void Linking.openSettings().catch(() => undefined);
    },
    [start, navigation],
  );

  const say = (line: Line) => t(line.key, line.count === undefined ? undefined : { count: formatNumber(line.count, locale) });

  return (
    <GradientBackground>
      <ScreenHeader title={t('practice.title')} onBack={onExit} browse />
      <AsyncBoundary loading={!hub && !error} error={!hub ? error : null} onRetry={() => void load()} skeleton={<HubSkeleton />}>
        {() =>
          hub ? (
            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFelt(refresh)} tintColor={colors.primary} />}
            >
              <Rise delay={entering(0)}>
                <HeroCard
                  hero={heroOf(hub)}
                  onStart={start}
                  onLessons={() => navigation.popTo('Tabs', { screen: 'Learn', params: { view: 'lessons' } })}
                />
              </Rise>
              <Text style={[sectionLabel, styles.section, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
                {t('practice.hub.list')}
              </Text>
              <View style={styles.rows}>
                {rows.map((row, i) => (
                  // The card at the top is the first to arrive; each row follows a beat after the one above.
                  <Rise key={row.key} delay={entering(i + 1)}>
                    <PracticeRow row={row} detail={say(row.detail)} onPress={press} />
                  </Rise>
                ))}
              </View>
            </ScrollView>
          ) : null
        }
      </AsyncBoundary>
      {hub ? (
        <UnitPicker
          visible={picking}
          units={hub.units}
          onClose={() => setPicking(false)}
          onPick={(unit) => {
            haptic('select');
            setPicking(false);
            start('unit', unit.unitId);
          }}
        />
      ) : null}
    </GradientBackground>
  );
}

/**
 * The top card on the pale violet wash: what it offers and how much, Hamo at its end, and one button saying what
 * a session pays. One ground and one violet button every day, so the eye goes to the button. Hamo cheers on
 * arrival and greets a tap; the text says everything he would, so screen readers skip him. The button pops once
 * the card settles.
 */
function HeroCard({
  hero,
  onStart,
  onLessons,
}: {
  hero: Hero;
  onStart: (mode: PracticeMode, unitId?: string) => void;
  onLessons: () => void;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const violet = hueSteps(scheme, 'violet');
  const eyebrow = hero.kind === 'unit' ? t('practice.hub.unitReview', { n: formatNumber(hero.unit.number, locale) }) : hero.kind === 'none' ? null : t('learn.tools.review');
  const title =
    hero.kind === 'due'
      ? hero.count === 1
        ? t('learn.tools.dueOne')
        : t('learn.tools.due', { count: formatNumber(hero.count, locale) })
      : hero.kind === 'unit'
        ? hero.unit.title
        : hero.kind === 'weak'
          ? t('learn.tools.dueNone')
          : t('practice.hub.noneTitle');
  const body = t(
    hero.kind === 'due' ? 'practice.hub.dueBody' : hero.kind === 'unit' ? 'practice.hub.unitBody' : hero.kind === 'weak' ? 'practice.hub.weakBody' : 'practice.hub.noneBody',
  );
  const go = () => {
    if (hero.kind === 'none') onLessons();
    else if (hero.kind === 'unit') onStart('unit', hero.unit.unitId);
    else onStart('review');
  };
  const label = hero.kind === 'none' ? t('practice.hub.toLessons') : t('practice.hub.start');
  // What a session pays, on the button; the way to the lessons pays nothing of its own.
  const xp = hero.kind === 'none' ? null : practiceXpRange();
  const pays = xp ? t('practice.hub.xp', { min: formatNumber(xp.min, locale), max: formatNumber(xp.max, locale) }) : null;
  const spoken = hero.kind === 'none' ? label : `${label}, ${title}, ${pays}`;

  const pop = usePop();
  useEffect(() => {
    const id = setTimeout(pop.run, BUTTON_POP_AT_MS);
    return () => clearTimeout(id);
  }, [pop.run]);

  return (
    <View style={[styles.hero, { backgroundColor: violet.wash }]} testID="practice-hero">
      <View style={[styles.heroTop, { flexDirection: dir.row }]}>
        <View style={styles.heroWords}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, dir.text, { color: violet.deep }]} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <Text style={[styles.heroTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[styles.heroBody, dir.text, { color: colors.textPrimary }]}>{body}</Text>
        </View>
        <View style={styles.heroCharacter} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SpeakingCharacter speaker="hamo" player={null} playing={false} crop="half" height={CHARACTER_HEIGHT} flip={!dir.rtl} reaction="cheer" onPress={() => undefined} />
        </View>
      </View>
      <Animated.View style={{ transform: [{ scale: pop.scale }] }}>
        <ClayButton label={label} badge={pays ?? undefined} accessibilityLabel={spoken} tone="primary" size="large" onPress={go} />
      </Animated.View>
    </View>
  );
}

/**
 * One kind of practice: name, a line, and a badge in its own hue (pale wash, glyph in the deep shade) that pops
 * under the finger, so the row responds before the next screen opens. An empty kind is dimmed with a grey badge.
 * A line about something waiting is violet. Memoised, so rows re-render only when the hub changes.
 */
const PracticeRow = memo(function PracticeRow({ row, detail, onPress }: { row: HubRow; detail: string; onPress: (row: HubRow) => void }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const scale = useFontScale({ max: 1.6 });
  const off = row.action === null;
  const title = t(row.title);
  const glyph = Math.round(26 * scale);
  const hue = hueSteps(scheme, ROW_HUES[row.key]);
  const rest = REST[scheme];
  const pop = usePop();
  return (
    <PressableScale
      onPress={() => onPress(row)}
      onPressIn={off ? undefined : pop.run}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${detail}`}
      accessibilityHint={row.action?.kind === 'settings' ? t('lesson.speak.openSettings') : undefined}
      accessibilityState={{ disabled: off }}
      style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.surface }]}
      testID={`practice-row-${row.key}`}
    >
      <View style={styles.rowWords}>
        <Text style={[styles.rowTitle, dir.text, { color: off ? colors.textSecondary : colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.rowDetail, dir.text, { color: row.waiting ? colors.primary : colors.textSecondary }]}>{detail}</Text>
      </View>
      <Animated.View
        style={[
          styles.rowBadge,
          { width: glyph + BADGE_ROOM, height: glyph + BADGE_ROOM, backgroundColor: off ? rest.fill : hue.wash, transform: [{ scale: pop.scale }] },
        ]}
      >
        <Icon name={row.icon} size={glyph} color={off ? rest.ink : hue.deep} />
      </Animated.View>
    </PressableScale>
  );
});

/** Finished units, each in its own colour with its number, latest first; tap one to review it. */
function UnitPicker({
  visible,
  units,
  onClose,
  onPick,
}: {
  visible: boolean;
  units: PracticeHubUnit[];
  onClose: () => void;
  onPick: (unit: PracticeHubUnit) => void;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('practice.hub.unit')}>
      <ScrollView contentContainerStyle={styles.picker}>
        {units.map((unit) => {
          const tone = TONES[scheme][unit.tone];
          const name = t('coursemap.path.unit', { n: formatNumber(unit.number, locale) });
          return (
            <PressableScale
              key={unit.unitId}
              onPress={() => onPick(unit)}
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${unit.title}`}
              style={[styles.unit, { flexDirection: dir.row, backgroundColor: colors.surface }]}
            >
              <View style={[styles.unitDisc, { backgroundColor: tone.fill, borderColor: tone.lip }]}>
                <Text style={[styles.unitNumber, { color: tone.ink }]} maxFontSizeMultiplier={1.4}>
                  {formatNumber(unit.number, locale)}
                </Text>
              </View>
              <View style={styles.rowWords}>
                <Text style={[styles.eyebrow, dir.text, { color: tone.text }]}>{name}</Text>
                <Text style={[styles.rowTitle, dir.text, { color: colors.textPrimary }]}>{unit.title}</Text>
              </View>
              <Icon name="chevron-right" size={18} color={colors.textSecondary} style={dir.flip ?? undefined} />
            </PressableScale>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

/** How long a load may take before its placeholder shows, so a quick answer arrives without a grey flash. */
const PLACEHOLDER_AFTER_MS = 300;

/** The hub while it loads, shape for shape: the card, the heading, the five rows. */
function HubSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShown(true), PLACEHOLDER_AFTER_MS);
    return () => clearTimeout(id);
  }, []);
  return (
    <View style={[styles.content, { opacity: shown ? 1 : 0 }]} accessibilityLabel={t('common.loading')}>
      <Skeleton height={HERO_HEIGHT} radius={radii.lg} />
      <Skeleton width={96} height={12} style={styles.section} />
      <View style={styles.rows}>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} height={ROW_HEIGHT} radius={radii.lg} />
        ))}
      </View>
    </View>
  );
}

/** Hamo on the card, head to waist: as tall as its words, not taller than the card wants to be. */
const CHARACTER_HEIGHT = 116;
/** The card at its usual size: Hamo beside its words, and the large button. */
const HERO_HEIGHT = 222;
/** A row at its usual size. */
const ROW_HEIGHT = 76;
/** Room round a badge's glyph: the badge is a tile, not an icon. */
const BADGE_ROOM = 30;
/** When the button pops, once the card has risen in. */
const BUTTON_POP_AT_MS = 520;

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.sm },

  hero: { borderRadius: radii.lg, padding: spacing.md + 4, gap: spacing.md },
  heroTop: { alignItems: 'flex-end', gap: spacing.sm },
  heroWords: { flex: 1, gap: spacing.xs, alignSelf: 'center' },
  eyebrow: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  heroTitle: { ...display(typography.sizes.text) },
  heroBody: { fontSize: typography.sizes.text, lineHeight: 20, opacity: 0.82 },
  // He stands at the card's foot, waist at its padding, so the button sits under his hands.
  heroCharacter: { marginBottom: -(spacing.md + 4) + spacing.xs },

  section: { marginTop: spacing.lg, marginBottom: spacing.xs },
  rows: { gap: spacing.sm },
  row: { minHeight: ROW_HEIGHT, borderRadius: radii.lg, paddingStart: spacing.md + 4, paddingEnd: spacing.sm + 2, paddingVertical: spacing.sm + 2, alignItems: 'center', gap: spacing.md },
  rowBadge: { borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  rowWords: { flex: 1, gap: 2 },
  rowTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  rowDetail: { fontSize: typography.sizes.text },

  picker: { gap: spacing.sm, paddingBottom: spacing.md },
  unit: { minHeight: MIN_TOUCH_TARGET + spacing.md, borderRadius: radii.lg, padding: spacing.sm + 4, alignItems: 'center', gap: spacing.md },
  unitDisc: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, borderBottomWidth: 3, alignItems: 'center', justifyContent: 'center' },
  unitNumber: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
});
