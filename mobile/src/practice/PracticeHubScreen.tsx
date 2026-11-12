import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Animated, AppState, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GamesAvailability, PracticeHub, PracticeHubUnit, PracticeMode } from '@kurda/shared';
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
import { ROW_TONES, heroOf, heroTone, hubRows, practiceXpRange, type Hero, type HubRow, type Line } from './hub';

/**
 * Practice's hub: the one thing most worth doing now, and every other kind of
 * practice a tap away.
 *
 * At the top, a card in colour with one button: the words due for review,
 * with how many; with none due, the unit finished last, to go back over; with
 * nothing to go back over, the hardest words again; and before any lesson,
 * the way to the lessons. Hamo stands at its end, glad to see you, and the
 * button says what a session pays. Under it, a row for each other kind —
 * mistakes, words, listening, speaking, a unit of your choice — its name and
 * one line, with a big badge in its own colour at the end that pops under the
 * finger. Two of the rows open an exercise with a screen of its own, Build a
 * Kurdish Sentence after the words and Hear It, Find It after listening, each
 * there only while it can be done in the learner's Kurdish (exercises.ts).
 * The card and the rows rise in one after another as the hub arrives
 * (`useListEntrance`), and simply stand there on a later visit. A kind with
 * nothing in it stays in the list, dimmed, and says what would put something
 * there, so nothing disappears without a word.
 *
 * It reads the hub in one request (GET /practice/hub), again each time the
 * screen comes back into view — after a session, the counts have moved — and
 * when pulled down. What the exercises can be done with is asked alongside
 * it and waited for, so the list arrives whole and no row moves under a
 * thumb; when that cannot be had the hub stands without them. Speaking also
 * listens to the microphone: refused for
 * good, its row is the way to Settings, and coming back from there finds out
 * whether it was allowed.
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

  // back from Settings, where the microphone may just have been allowed
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

  // one row object per kind for as long as the hub stands, so the rows (memoised) are drawn again only when it changes
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
      <ScreenHeader title={t('practice.title')} onBack={onExit} />
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
                  onLessons={() => navigation.navigate('Tabs', { screen: 'Learn', params: { view: 'lessons' } })}
                />
              </Rise>
              <Text style={[sectionLabel, styles.section, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
                {t('practice.hub.list')}
              </Text>
              <View style={styles.rows}>
                {rows.map((row, i) => (
                  // the card at the top is the first to arrive; each row follows a beat after the one above
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
 * The card at the top, in the colour of what it offers (hub.ts `heroTone`):
 * what it is, how much, Hamo at its end, and one button that says what a
 * session pays. Hamo cheers as the card arrives and greets a tap; the words
 * beside him say everything he would, so a screen reader passes him by. The
 * button pops once the card has settled: the way in, offered.
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
  const { scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const tone = TONES[scheme][heroTone(hero)];
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
  // what a session pays, on the button; the way to the lessons pays nothing of its own
  const xp = hero.kind === 'none' ? null : practiceXpRange();
  const pays = xp ? t('practice.hub.xp', { min: formatNumber(xp.min, locale), max: formatNumber(xp.max, locale) }) : null;
  const spoken = hero.kind === 'none' ? label : `${label}, ${title}, ${pays}`;

  const pop = usePop();
  useEffect(() => {
    const id = setTimeout(pop.run, BUTTON_POP_AT_MS);
    return () => clearTimeout(id);
  }, [pop.run]);

  return (
    <View style={[styles.hero, { backgroundColor: tone.fill }]} testID="practice-hero">
      <View style={[styles.heroTop, { flexDirection: dir.row }]}>
        <View style={styles.heroWords}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, dir.text, { color: tone.ink }]} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <Text style={[styles.heroTitle, dir.text, { color: tone.ink }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[styles.heroBody, dir.text, { color: tone.ink }]}>{body}</Text>
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
 * One kind of practice: its name and one line, and at the end a big badge in
 * its own colour with its glyph, which pops under the finger — the row
 * answers before the next screen does. A kind with nothing in it is dimmed,
 * its badge in grey. Memoised: the hub's rows are drawn again only when the
 * hub changes, not as the screen's own state does.
 */
const PracticeRow = memo(function PracticeRow({ row, detail, onPress }: { row: HubRow; detail: string; onPress: (row: HubRow) => void }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const scale = useFontScale({ max: 1.6 });
  const off = row.action === null;
  const title = t(row.title);
  const glyph = Math.round(26 * scale);
  const tone = TONES[scheme][ROW_TONES[row.key]];
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
        <Text style={[styles.rowDetail, dir.text, { color: row.waiting ? colors.goldText : colors.textSecondary }]}>{detail}</Text>
      </View>
      <Animated.View
        style={[
          styles.rowBadge,
          { width: glyph + BADGE_ROOM, height: glyph + BADGE_ROOM, backgroundColor: off ? rest.fill : tone.fill, transform: [{ scale: pop.scale }] },
        ]}
      >
        <Icon name={row.icon} size={glyph} color={off ? rest.ink : tone.ink} />
      </Animated.View>
    </PressableScale>
  );
});

/** The units finished, each in its own colour with its number, the latest first: tap one to review it. */
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

/** How long a load may take before its placeholder shows: a quick answer arrives without a flash of grey. */
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
/** The card at its usual size: Hamo beside its words, and the large button */
const HERO_HEIGHT = 222;
/** a row at its usual size */
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
  eyebrow: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  heroTitle: { ...display(typography.sizes.lg) },
  heroBody: { fontSize: typography.sizes.sm, lineHeight: 20, opacity: 0.9 },
  // he stands at the card's foot, waist at its padding, so the button sits under his hands
  heroCharacter: { marginBottom: -(spacing.md + 4) + spacing.xs },

  section: { marginTop: spacing.lg, marginBottom: spacing.xs },
  rows: { gap: spacing.sm },
  row: { minHeight: ROW_HEIGHT, borderRadius: radii.lg, paddingStart: spacing.md + 4, paddingEnd: spacing.sm + 2, paddingVertical: spacing.sm + 2, alignItems: 'center', gap: spacing.md },
  rowBadge: { borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  rowWords: { flex: 1, gap: 2 },
  rowTitle: { fontSize: typography.ios.row, fontWeight: typography.weights.semibold },
  rowDetail: { fontSize: typography.sizes.sm },

  picker: { gap: spacing.sm, paddingBottom: spacing.md },
  unit: { minHeight: MIN_TOUCH_TARGET + spacing.md, borderRadius: radii.lg, padding: spacing.sm + 4, alignItems: 'center', gap: spacing.md },
  unitDisc: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, borderBottomWidth: 3, alignItems: 'center', justifyContent: 'center' },
  unitNumber: { fontSize: typography.ios.row, fontWeight: typography.weights.bold },
});
