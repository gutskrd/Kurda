import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RiddleAnswer, RiddleCard } from '@kurda/shared';
import { describeError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useHardwareBack } from '../navigation/hardwareBack';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { COLUMN, Note } from '../stories/ui';
import { display, sectionLabel } from '../theme/fonts';
import { ClayButton, ErrorRetry, GradientBackground } from '../theme/glass';
import { DrawnCheck, MenuIn } from '../theme/MotionParts';
import { SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { getRiddle, getRiddles, revealRiddle } from './api';
import { centred, dialectOfSlug, inReaderLanguage, kurdishIn, traditionLine } from './labels';
import { EnglishNote, InLanguage, Section, SourcesList } from './parts';
import { nextRiddle, rememberAnswer, rememberList, rememberedAnswer, rememberedList } from './store';
import { dialectNameKey } from '../i18n/dialectName';

/**
 * A riddle's answer on a screen of its own, reached by solving it or by confirming a reveal on the riddle's page. It
 * has no address, so a link opens the riddle, never its answer. It shows the riddle, the answer large with its
 * translation, why it is right, where it comes from, its sources, and the next unsolved riddle.
 *
 * The answer is the one the riddle's page was sent; only when the screen is restored without it is it asked for again,
 * which changes nothing for a riddle already solved or revealed.
 */
export function RiddleAnswerScreen({ slug, onExit }: { slug: string; onExit: () => void }): React.JSX.Element {
  useHardwareBack(onExit);
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const bottom = useScreenBottomInset(spacing.lg);
  const dialect = dialectOfSlug(slug);
  const kept = rememberedAnswer(slug);
  const [answer, setAnswer] = useState<{ answer: RiddleAnswer; solved: boolean; xp: number } | null>(kept);
  const [list, setList] = useState<RiddleCard[] | null>(rememberedList(dialect)?.riddles ?? null);
  const [card, setCard] = useState<RiddleCard | null>(rememberedList(dialect)?.riddles.find((r) => r.slug === slug) ?? null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    setProblem(null);
    if (!rememberedAnswer(slug)) {
      void revealRiddle(client, slug).then((res) => {
        if (!res.ok) return setProblem(describeError(res.error, t));
        rememberAnswer(slug, res.data.answer, false);
        setAnswer(rememberedAnswer(slug));
      });
    }
    if (!rememberedList(dialect)) {
      void getRiddles(client, dialect).then((res) => {
        if (!res.ok) return;
        rememberList(dialect, res.data.riddles, res.data.daily);
        setList(res.data.riddles);
        setCard((c) => c ?? res.data.riddles.find((r) => r.slug === slug) ?? null);
      });
    }
  }, [client, dialect, slug, t]);
  useEffect(load, [load]);

  // The question, for a riddle the list did not have (opened from a link before the list was read).
  useEffect(() => {
    if (card) return;
    let live = true;
    void getRiddle(client, slug).then((res) => {
      if (live && res.ok) setCard(res.data.riddle);
    });
    return () => {
      live = false;
    };
  }, [card, client, slug]);

  // The one just solved or seen is no longer one to offer next.
  const now: RiddleCard['state'] = answer?.solved ? 'solved' : 'revealed';
  const next = list ? nextRiddle(list.map((r) => (r.slug === slug ? { ...r, state: now } : r)), slug) : null;

  if (!answer) {
    return (
      <GradientBackground>
        <ScreenHeader title={t('lore.riddles.name')} onBack={onExit} />
        {problem ? (
          <ErrorRetry message={problem} onRetry={load} />
        ) : (
          <View style={[styles.content, styles.skeleton]} accessibilityLabel={t('common.loading')}>
            <SkeletonText size={typography.sizes.xl} width="50%" />
            <SkeletonText size={typography.sizes.md} width="90%" />
          </View>
        )}
      </GradientBackground>
    );
  }

  const a = answer.answer;
  const ku = kurdishIn(dialect);
  const said = inReaderLanguage(a.translations, locale);
  const question = card ? inReaderLanguage(card.translations, locale) : null;

  return (
    <GradientBackground>
      <ScreenHeader title={t('lore.riddles.name')} onBack={onExit} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom + spacing.lg }]} showsVerticalScrollIndicator={false}>
        {answer.solved ? (
          <MenuIn style={[styles.moment, { flexDirection: dir.row }]} accessibilityLiveRegion="polite">
            <DrawnCheck size={22} color={colors.success} />
            <Text style={[styles.momentText, { color: colors.success }]}>{t('lore.answer.solved')}</Text>
            {answer.xp > 0 ? <Text style={[styles.momentXp, { color: colors.goldText }]}>{t('games.solo.results.xp', { xp: answer.xp })}</Text> : null}
          </MenuIn>
        ) : null}

        {card ? (
          <View style={styles.riddle}>
            <Text style={[sectionLabel, { color: colors.textSecondary }]}>{t('lore.answer.riddle')}</Text>
            <Text {...ku.props} style={[styles.question, { color: colors.textSecondary }, centred(ku.style)]}>
              {card.question}
            </Text>
            {question ? <InLanguage text={question.value.question} lang={question.lang} align="center" style={[styles.questionTranslation, { color: colors.textSecondary }]} /> : null}
          </View>
        ) : null}

        <MenuIn style={[styles.answer, { backgroundColor: colors.surface }]} testID="riddle-answer">
          <Text style={[sectionLabel, { color: colors.goldText }]} accessibilityRole="header">
            {t('lore.answer.answer')}
          </Text>
          <Text {...ku.props} style={[styles.answerText, { color: colors.textPrimary }, centred(ku.style)]}>
            {a.answer}
          </Text>
          {said ? <InLanguage text={said.value.answer} lang={said.lang} align="center" style={[styles.answerTranslation, { color: colors.textSecondary }]} /> : null}
        </MenuIn>

        <Section label={t('lore.answer.why')}>
          <Text {...ku.props} style={[styles.body, { color: colors.textPrimary }, ku.style]}>
            {a.explanation}
          </Text>
          {said ? (
            <>
              <InLanguage text={said.value.explanation} lang={said.lang} style={[styles.bodyTranslation, { color: colors.textSecondary }]} />
              <EnglishNote lang={said.lang} dialect={dialect} />
            </>
          ) : null}
        </Section>

        <Section label={t('lore.answer.origin')}>
          <Text style={[styles.body, dir.text, { color: colors.textPrimary }]}>{traditionLine('riddle', a.tradition, a.region, t)}</Text>
        </Section>

        <SourcesList sources={a.sources} />

        {problem ? <Note tone="danger" icon="alert">{problem}</Note> : null}

        <View style={styles.actions}>
          {next ? (
            <ClayButton label={t('lore.answer.next')} tone="primary" size="large" icon="question" onPress={() => navigation.replace('Riddle', { slug: next.slug })} testID="riddle-next" />
          ) : list ? (
            <Note icon="check">{t('lore.answer.allDone', { variety: t(dialectNameKey(dialect)) })}</Note>
          ) : null}
          <ClayButton label={t('lore.answer.back')} variant="outline" onPress={onExit} />
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: { ...COLUMN, padding: spacing.lg, gap: spacing.lg },
  skeleton: { alignItems: 'center', paddingTop: spacing.xxl },
  moment: { alignSelf: 'center', alignItems: 'center', gap: spacing.sm },
  momentText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  momentXp: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  riddle: { alignItems: 'center', gap: spacing.xs },
  question: { fontSize: typography.sizes.md, lineHeight: 24 },
  questionTranslation: { fontSize: typography.sizes.sm, lineHeight: 20 },
  answer: { alignItems: 'center', borderRadius: radii.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.sm },
  answerText: { ...display(typography.sizes.xxl), lineHeight: Math.round(typography.sizes.xxl * 1.2) },
  answerTranslation: { fontSize: typography.sizes.lg, lineHeight: 28 },
  body: { fontSize: typography.sizes.md, lineHeight: 26 },
  bodyTranslation: { fontSize: typography.sizes.md, lineHeight: 24 },
  actions: { gap: spacing.sm },
});
