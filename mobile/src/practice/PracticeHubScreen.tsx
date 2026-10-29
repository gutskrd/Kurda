import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AppState, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PracticeHub, PracticeHubUnit, PracticeMode } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useFontScale } from '../a11y/useFontScale';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { ScreenHeader } from '../navigation/ScreenHeader';
import type { RootNavigation } from '../navigation/rootStack';
import { TONES } from '../coursemap/path';
import { haptic, refreshFelt } from '../feedback/haptics';
import { micRefused } from '../recording/useMicRecorder';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { useDirection } from '../reports/direction';
import { BottomSheet } from '../theme/BottomSheet';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon, type IconName } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { Skeleton } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { display, sectionLabel } from '../theme/fonts';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { heroOf, hubRows, type Hero, type HubRow, type Line } from './hub';

/**
 * Practice's hub: the one thing most worth doing now, and every other kind of
 * practice a tap away.
 *
 * At the top, a card with one button: the words due for review, with how many;
 * with none due, the unit finished last, to go back over; with nothing to go
 * back over, the hardest words again; and before any lesson, the way to the
 * lessons. Under it, a row for each other kind — mistakes, words, listening,
 * speaking, a unit of your choice — each a big target with one line under its
 * name. A kind with nothing in it stays in the list, dimmed, and says what
 * would put something there, so nothing disappears without a word.
 *
 * It reads the hub in one request (GET /practice/hub), again each time the
 * screen comes back into view — after a session, the counts have moved — and
 * when pulled down. Speaking also listens to the microphone: refused for
 * good, its row is the way to Settings, and coming back from there finds out
 * whether it was allowed.
 */
export function PracticeHubScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [hub, setHub] = useState<PracticeHub | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refused, setRefused] = useState(false);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    const [res, mic] = await Promise.all([client.get<PracticeHub>('/practice/hub'), micRefused()]);
    setRefused(mic);
    if (res.ok) {
      setHub(res.data);
      setError(null);
    } else setError(res.error);
  }, [client]);

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

  const start = (mode: PracticeMode, unitId?: string) => navigation.navigate('Practice', unitId ? { mode, unitId } : { mode });

  const press = (row: HubRow) => {
    if (!row.action) return;
    haptic('select');
    if (row.action.kind === 'start') start(row.action.mode);
    else if (row.action.kind === 'pick') setPicking(true);
    else void Linking.openSettings().catch(() => undefined);
  };

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
              <HeroCard
                hero={heroOf(hub)}
                onStart={start}
                onLessons={() => navigation.navigate('Tabs', { screen: 'Learn', params: { view: 'lessons' } })}
              />
              <Text style={[sectionLabel, styles.section, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
                {t('practice.hub.list')}
              </Text>
              <View style={styles.rows}>
                {hubRows(hub, { micRefused: refused }).map((row) => (
                  <PracticeRow key={row.key} row={row} detail={say(row.detail)} onPress={() => press(row)} />
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

/** The card at the top: what it is, how much, and one button. */
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
  const tone = hero.kind === 'unit' ? TONES[scheme][hero.unit.tone] : null;
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
  const icon: IconName = hero.kind === 'unit' ? 'trophy' : hero.kind === 'none' ? 'book' : 'review';
  const go = () => {
    if (hero.kind === 'none') onLessons();
    else if (hero.kind === 'unit') onStart('unit', hero.unit.unitId);
    else onStart('review');
  };
  const label = hero.kind === 'none' ? t('practice.hub.toLessons') : t('practice.hub.start');

  return (
    <View style={[styles.hero, { backgroundColor: colors.surface }]} testID="practice-hero">
      <View style={[styles.heroTop, { flexDirection: dir.row }]}>
        <View style={styles.heroWords}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, dir.text, { color: tone ? tone.text : colors.goldText }]} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <Text style={[styles.heroTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[styles.heroBody, dir.text, { color: colors.textSecondary }]}>{body}</Text>
        </View>
        <View
          style={[styles.heroIcon, { backgroundColor: tone ? tone.fill : colors.controlTrack }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Icon name={icon} size={28} color={tone ? tone.ink : colors.textPrimary} />
        </View>
      </View>
      <ClayButton label={label} accessibilityLabel={hero.kind === 'none' ? label : `${label}, ${title}`} tone="primary" size="large" onPress={go} />
    </View>
  );
}

/** One kind of practice: its icon, its name and one line, a chevron when it can be started. */
function PracticeRow({ row, detail, onPress }: { row: HubRow; detail: string; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const scale = useFontScale({ max: 1.6 });
  const off = row.action === null;
  const title = t(row.title);
  const glyph = Math.round(24 * scale);
  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${detail}`}
      accessibilityHint={row.action?.kind === 'settings' ? t('lesson.speak.openSettings') : undefined}
      accessibilityState={{ disabled: off }}
      style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.surface }]}
      testID={`practice-row-${row.key}`}
    >
      <View style={[styles.rowIcon, { width: glyph + 20, height: glyph + 20, backgroundColor: colors.controlTrack }]}>
        <Icon name={row.icon} size={glyph} color={off ? colors.textSecondary : colors.textPrimary} />
      </View>
      <View style={styles.rowWords}>
        <Text style={[styles.rowTitle, dir.text, { color: off ? colors.textSecondary : colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.rowDetail, dir.text, { color: row.waiting ? colors.goldText : colors.textSecondary }]}>{detail}</Text>
      </View>
      {off ? null : <Icon name="chevron-right" size={18} color={colors.textSecondary} style={dir.flip ?? undefined} />}
    </PressableScale>
  );
}

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

/** the card at its usual size: a line, a two-line title, a line, and the large button */
const HERO_HEIGHT = 196;
/** a row at its usual size */
const ROW_HEIGHT = 72;

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.sm },

  hero: { borderRadius: radii.lg, padding: spacing.md + 4, gap: spacing.md },
  heroTop: { alignItems: 'flex-start', gap: spacing.md },
  heroWords: { flex: 1, gap: spacing.xs },
  eyebrow: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  heroTitle: { ...display(typography.sizes.lg) },
  heroBody: { fontSize: typography.sizes.sm, lineHeight: 20 },
  heroIcon: { width: 56, height: 56, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },

  section: { marginTop: spacing.lg, marginBottom: spacing.xs },
  rows: { gap: spacing.sm },
  row: { minHeight: ROW_HEIGHT, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4, alignItems: 'center', gap: spacing.md },
  rowIcon: { borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  rowWords: { flex: 1, gap: 2 },
  rowTitle: { fontSize: typography.ios.row, fontWeight: typography.weights.semibold },
  rowDetail: { fontSize: typography.sizes.sm },

  picker: { gap: spacing.sm, paddingBottom: spacing.md },
  unit: { minHeight: MIN_TOUCH_TARGET + spacing.md, borderRadius: radii.lg, padding: spacing.sm + 4, alignItems: 'center', gap: spacing.md },
  unitDisc: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radii.pill, borderBottomWidth: 3, alignItems: 'center', justifyContent: 'center' },
  unitNumber: { fontSize: typography.ios.row, fontWeight: typography.weights.bold },
});
