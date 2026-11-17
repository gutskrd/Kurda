import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PROVERB_ROUND_ITEMS, isProverbTheme, type GameDialect, type ProverbList, type ProverbTheme, type ProverbView } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { useCourseDialect } from '../learn/courseDialect';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { usePullRefresh } from '../net/usePullRefresh';
import { useDirection } from '../reports/direction';
import { COLUMN, Note } from '../stories/ui';
import { useListEntrance } from '../theme/animate';
import { Chips } from '../theme/Chips';
import { display, sectionLabel } from '../theme/fonts';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { PressableScale, Rise, heldRow } from '../theme/MotionParts';
import { Pressable } from '../theme/Pressable';
import { SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { getProverbs } from './api';
import { PROVERBS_NAME, THEME_KEY, defaultLoreDialect, kurdishIn, proverbTranslation, textIn, traditionMark, varietyName } from './labels';
import { CollectionTitle, VarietySwitch } from './parts';

type Filter = 'all' | ProverbTheme;

/**
 * Gotinên pêşiyan: the proverbs (Learn → Stories, and their own address
 * `app/learn/proverbs`).
 *
 * The proverb of the day first, set large, then the way into a short round
 * on them, the themes to keep to one of, and every proverb of the variety:
 * each in its own Kurdish and direction, its translation in the reader's
 * language (English where theirs has none yet), and where it comes from —
 * traditional, a region's, or newly written. A proverb opens on its own page.
 * Reading one pays nothing, and nothing here says it does.
 */
export function ProverbsScreen({ dialect: asked, theme, onExit }: { dialect?: GameDialect; theme?: string; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const course = useCourseDialect();
  const reduce = useReducedMotion();
  const bottom = useScreenBottomInset(spacing.lg);
  const [dialect, setDialect] = useState<GameDialect>(asked ?? defaultLoreDialect(locale, course));
  const [list, setList] = useState<ProverbList | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState<Filter>(isProverbTheme(theme) ? theme : 'all');

  const load = useCallback(async () => {
    setError(null);
    const res = await getProverbs(client, dialect);
    if (res.ok) setList(res.data);
    else setError(res.error);
  }, [client, dialect]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const pull = usePullRefresh(load);
  const delayFor = useListEntrance(list !== null);

  const switchDialect = (d: GameDialect): void => {
    if (d === dialect) return;
    setList(null);
    setFilter('all');
    setDialect(d);
  };
  const open = (p: ProverbView): void => navigation.navigate('Proverb', { slug: p.slug });

  const today = list?.today ? (list.proverbs.find((p) => p.slug === list.today) ?? null) : null;
  const themes = list?.themes ?? [];
  const shown = (list?.proverbs ?? []).filter((p) => filter === 'all' || p.themes.includes(filter));

  let body: React.ReactNode;
  if (error && !list) {
    body = <ErrorRetry message={describeError(error, t)} onRetry={() => void load()} />;
  } else if (!list) {
    body = (
      <View style={styles.skeleton} accessibilityLabel={t('common.loading')}>
        <View style={[styles.today, { backgroundColor: colors.surface }]}>
          <SkeletonText size={typography.sizes.xs} width={120} />
          <SkeletonText size={typography.sizes.lg} width="80%" />
          <SkeletonText size={typography.sizes.md} width="60%" />
        </View>
      </View>
    );
  } else if (list.proverbs.length === 0) {
    body = <Note icon="quotes">{t('lore.proverbs.empty', { variety: varietyName(dialect) })}</Note>;
  } else {
    // a round is offered only when the server can build one: five proverbs, as the website asks
    const roundable = list.proverbs.length >= PROVERB_ROUND_ITEMS;
    body = (
      <>
        {today ? <TodayProverb proverb={today} onOpen={() => open(today)} /> : null}
        {roundable ? (
        <PressableScale
          onPress={() => navigation.navigate('ProverbRound', { dialect })}
          accessibilityRole="button"
          accessibilityLabel={t('lore.round.play')}
          accessibilityHint={t('lore.round.blurb')}
          style={[styles.round, { backgroundColor: colors.surface, flexDirection: dir.row }]}
          testID="proverbs-round"
        >
          <View style={[styles.roundIcon, { backgroundColor: colors.controlTrack }]}>
            <Icon name="target" size={20} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.roundTitle, dir.text, { color: colors.textPrimary }]}>{t('lore.round.play')}</Text>
            <Text style={[styles.roundLine, dir.text, { color: colors.textSecondary }]}>{t('lore.round.blurb')}</Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip ?? undefined} />
        </PressableScale>
        ) : null}

        <View style={styles.group}>
          <Text style={[sectionLabel, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
            {t('lore.proverbs.themes')}
          </Text>
          {themes.length > 1 ? (
            <Chips<Filter> options={['all', ...themes]} value={filter} onChange={setFilter} labelOf={(f) => (f === 'all' ? t('lore.filter.all') : t(THEME_KEY[f]))} />
          ) : null}
        </View>

        {shown.length === 0 ? (
          <Note icon="quotes">{t('lore.proverbs.emptyTheme')}</Note>
        ) : (
          <View style={[styles.rows, { backgroundColor: colors.surface }]}>
            {shown.map((p, i) => (
              <Rise key={p.slug} delay={reduce ? null : delayFor(i)}>
                <ProverbRow proverb={p} first={i === 0} onOpen={() => open(p)} />
              </Rise>
            ))}
          </View>
        )}
      </>
    );
  }

  return (
    <GradientBackground>
      <ScreenHeader title={t('lore.proverbs.name')} onBack={onExit} browse />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom + spacing.lg }]} showsVerticalScrollIndicator={false} refreshControl={pull}>
        <CollectionTitle kurmanci={PROVERBS_NAME} localized={t('lore.proverbs.name')} />
        <VarietySwitch value={dialect} onChange={switchDialect} />
        {body}
      </ScrollView>
    </GradientBackground>
  );
}

/** The proverb of the day: the saying large, its translation under it; the whole block opens its page. */
function TodayProverb({ proverb, onOpen }: { proverb: ProverbView; onOpen: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const ku = kurdishIn(proverb.dialect);
  const translation = proverbTranslation(proverb, locale);
  return (
    <PressableScale
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={proverb.text}
      {...ku.props}
      accessibilityValue={{ text: [t('lore.proverbs.today'), translation?.value.translation].filter(Boolean).join(', ') }}
      style={[styles.today, { backgroundColor: colors.surface }]}
      testID="proverb-today"
    >
      <View style={[styles.kicker, { flexDirection: dir.row }]}>
        <Icon name="calendar" size={14} color={colors.goldText} />
        <Text style={[sectionLabel, { color: colors.goldText }]}>{t('lore.proverbs.today')}</Text>
      </View>
      <Text {...ku.props} style={[styles.todayText, { color: colors.textPrimary }, ku.style]}>
        {proverb.text}
      </Text>
      {translation ? (
        <Text {...textIn(translation.lang).props} style={[styles.todayTranslation, { color: colors.textSecondary }, textIn(translation.lang).style]}>
          {translation.value.translation}
        </Text>
      ) : null}
      <View style={[styles.todayFoot, { flexDirection: dir.row }]}>
        <Text style={[styles.go, { color: colors.primary }]}>{t('lore.proverbs.read')}</Text>
        <Icon name="chevron-right" size={16} color={colors.primary} style={dir.flip ?? undefined} />
      </View>
    </PressableScale>
  );
}

/** One proverb in the list: the saying, its translation, and where it comes from. */
function ProverbRow({ proverb, first, onOpen }: { proverb: ProverbView; first: boolean; onOpen: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const ku = kurdishIn(proverb.dialect);
  const translation = proverbTranslation(proverb, locale);
  const mark = traditionMark(proverb.tradition, proverb.region, t);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={proverb.text}
      {...ku.props}
      accessibilityValue={{ text: [translation?.value.translation, mark].filter(Boolean).join(', ') }}
      style={({ pressed }) => [styles.row, { flexDirection: dir.row }, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }, pressed && heldRow(colors.controlTrack)]}
    >
      <View style={styles.rowMain}>
        <Text {...ku.props} style={[styles.rowText, { color: colors.textPrimary }, ku.style]}>
          {proverb.text}
        </Text>
        {translation ? (
          <Text {...textIn(translation.lang).props} style={[styles.rowTranslation, { color: colors.textSecondary }, textIn(translation.lang).style]} numberOfLines={3}>
            {translation.value.translation}
          </Text>
        ) : null}
        <Text style={[styles.rowMark, dir.text, { color: proverb.tradition === 'new' ? colors.textSecondary : colors.goldText }]}>{mark}</Text>
      </View>
      <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip ?? undefined} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { ...COLUMN, paddingHorizontal: layout.gutter, paddingTop: spacing.sm, gap: spacing.lg },
  skeleton: { gap: spacing.lg },
  flex: { flex: 1, gap: 2 },
  today: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  kicker: { alignItems: 'center', gap: spacing.xs },
  todayText: { ...display(typography.sizes.lg), lineHeight: Math.round(typography.sizes.lg * 1.35) },
  todayTranslation: { fontSize: typography.sizes.md, lineHeight: 24 },
  todayFoot: { alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs, minHeight: 28 },
  go: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  round: { alignItems: 'center', gap: spacing.md, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, minHeight: 64 },
  roundIcon: { width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  roundTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  roundLine: { fontSize: typography.sizes.sm, lineHeight: 20 },
  group: { gap: spacing.sm, marginBottom: -spacing.sm },
  rows: { borderRadius: radii.lg, paddingHorizontal: spacing.md },
  row: { alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH_TARGET + 16, paddingVertical: spacing.md - 4 },
  rowMain: { flex: 1, gap: 3 },
  rowText: { fontSize: typography.sizes.md, lineHeight: 24, fontWeight: typography.weights.medium },
  rowTranslation: { fontSize: typography.sizes.sm, lineHeight: 20 },
  rowMark: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, marginTop: 2 },
});
