import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { RIDDLE_MATCHING, riddleXp, type RiddleAnswer, type RiddleDetail, type RiddleGuessResult, type RiddleHint, type RiddleNear } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { KurdishAnswerInput } from '../lesson/components/KurdishAnswerInput';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useHardwareBack } from '../navigation/hardwareBack';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { COLUMN, Note, Pill, Sheet, useAnnouncer } from '../stories/ui';
import { display } from '../theme/fonts';
import { ClayButton, ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { DrawnCheck, MenuIn, Rise, heldDim } from '../theme/MotionParts';
import { Pressable } from '../theme/Pressable';
import { SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import type { TranslationKey } from '../i18n/translations';
import { getRiddle, revealRiddle, riddleUrl, takeHint } from './api';

/** How a near guess is told, by how it was near. */
const NEAR_KEY: Record<RiddleNear, TranslationKey> = {
  close: 'lore.riddle.near',
  spelling: 'lore.riddle.spelling',
  language: 'lore.riddle.inKurdish',
};
import { CATEGORY_KEY, DIFFICULTY_KEY, centred, dialectOfSlug, inReaderLanguage, kurdishIn } from './labels';
import { InLanguage } from './parts';
import { mergeHints, rememberAnswer, rememberedAnswer, rememberedList } from './store';

/**
 * One riddle (`app/learn/riddles/<slug>`): the question in its own Kurdish with its translation a tap away, the hints
 * taken, a guess field with the Kurdish key bar, and Show the answer, which confirms once and opens the answer screen.
 * The server judges a guess (shared `riddleGuessMatches`) and the line under the field says what it forgives. Nothing
 * here holds an answer, an untaken hint or an explanation before the learner asks. A solve pays the riddle's XP, half
 * after a hint and none after the answer was seen; Challenge a friend shares the question, never the answer.
 */
export function RiddleScreen({ slug, onExit }: { slug: string; onExit: () => void }): React.JSX.Element {
  useHardwareBack(onExit);
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const bottom = useScreenBottomInset(spacing.lg);
  const { announce, region } = useAnnouncer();
  const [riddle, setRiddle] = useState<RiddleDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [hints, setHints] = useState<RiddleHint[]>([]);
  // The hint taken in this sitting, which unfolds; the ones that came with the page are simply there.
  const [fresh, setFresh] = useState<number | null>(null);
  const [guess, setGuess] = useState('');
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null);
  // How near the last wrong guess was, when it was: said instead of a plain "not quite"
  const [near, setNear] = useState<RiddleNear | null>(null);
  const [solved, setSolved] = useState<{ answer: RiddleAnswer; xp: number } | null>(null);
  const [busy, setBusy] = useState<'guess' | 'hint' | 'reveal' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [translated, setTranslated] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    void getRiddle(client, slug).then((res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRiddle(res.data.riddle);
      setHints(mergeHints(slug, res.data.riddle.hintsUsed));
    });
  }, [client, slug]);
  useEffect(load, [load]);

  const daily = rememberedList(dialectOfSlug(slug))?.daily === slug;

  /** The next hint, asked for now and not before. */
  const hint = async (): Promise<void> => {
    if (!riddle || busy) return;
    const index = hints.length;
    if (index >= riddle.hintCount) return;
    setBusy('hint');
    setProblem(null);
    const res = await takeHint(client, slug, index);
    setBusy(null);
    if (!res.ok) {
      // A hint taken on another phone first: the page is read again, with every hint it has.
      if (res.error.code === 'HINT_ORDER') load();
      else setProblem(describeError(res.error, t));
      return;
    }
    haptic('tap');
    setHints(mergeHints(slug, [res.data.hint]));
    setFresh(res.data.hint.index);
    announce(t('lore.riddle.hintN', { n: res.data.hint.index + 1 }));
  };

  const check = async (): Promise<void> => {
    const text = guess.trim();
    if (!riddle || !text || busy) return;
    setBusy('guess');
    setProblem(null);
    // The interface language goes with the guess, so an answer typed in it is told to say it in Kurdish.
    const res = await client.post<RiddleGuessResult>(`/riddles/${encodeURIComponent(slug)}/guess`, { guess: text, locale });
    setBusy(null);
    if (!res.ok) {
      setProblem(describeError(res.error, t));
      return;
    }
    if (res.data.correct) {
      rememberAnswer(slug, res.data.answer, true, res.data.xp);
      setVerdict('right');
      setSolved({ answer: res.data.answer, xp: res.data.xp });
      haptic('correct');
      announce(t('lore.riddle.right'));
    } else {
      setVerdict('wrong');
      setNear(res.data.near ?? null);
      haptic('wrong');
      announce(t(res.data.near ? NEAR_KEY[res.data.near] : 'lore.riddle.wrong'));
    }
  };

  /** Asked once, in the sheet: the answer, then its own screen. */
  const reveal = async (): Promise<void> => {
    if (busy) return;
    setBusy('reveal');
    const res = await revealRiddle(client, slug);
    setBusy(null);
    if (!res.ok) {
      setConfirm(false);
      setProblem(describeError(res.error, t));
      return;
    }
    rememberAnswer(slug, res.data.answer, false);
    setConfirm(false);
    navigation.replace('RiddleAnswer', { slug });
  };

  /** A riddle solved or seen before: its answer again, from what this phone has or from the server (which then changes nothing). */
  const seeAnswer = async (): Promise<void> => {
    if (rememberedAnswer(slug)) {
      navigation.replace('RiddleAnswer', { slug });
      return;
    }
    await reveal();
  };

  const challenge = (): void => {
    if (!riddle) return;
    // The question and where to find it; the answer stays with whoever solves it.
    void Share.share({ message: t('lore.riddle.shareMessage', { question: riddle.question, url: riddleUrl(slug) }) }).catch(() => undefined);
  };

  if (error || !riddle) {
    return (
      <GradientBackground>
        <ScreenHeader title={t('lore.riddles.name')} onBack={onExit} />
        {error ? (
          error.status === 404 ? (
            <View style={styles.content}>
              <Note icon="question">{t('lore.riddle.unavailable')}</Note>
            </View>
          ) : (
            <ErrorRetry message={describeError(error, t)} onRetry={load} />
          )
        ) : (
          <View style={[styles.content, styles.skeleton]} accessibilityLabel={t('common.loading')}>
            <SkeletonText size={typography.sizes.xl} width="86%" />
            <SkeletonText size={typography.sizes.xl} width="64%" />
          </View>
        )}
      </GradientBackground>
    );
  }

  const ku = kurdishIn(riddle.dialect);
  const translation = inReaderLanguage(riddle.translations, locale);
  const before = solved ? 'solved' : riddle.state === 'solved' || riddle.state === 'revealed' ? riddle.state : null;
  const xp = riddleXp(riddle.difficulty, { hintsUsed: hints.length, guesses: 0, revealed: false });
  const rule = RIDDLE_MATCHING[riddle.dialect];
  const moreHints = hints.length < riddle.hintCount;

  return (
    <GradientBackground>
      <ScreenHeader title={t('lore.riddles.name')} onBack={onExit} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.facts, { flexDirection: dir.row }]}>
          {/* How hard it is is information, not a prize: the quiet pill, as its neighbours are. */}
          <Pill label={t(DIFFICULTY_KEY[riddle.difficulty])} />
          <Pill label={t(CATEGORY_KEY[riddle.category])} />
          {daily ? <Pill icon="calendar" label={t('lore.riddles.daily')} /> : null}
        </View>

        <View style={styles.questionBlock}>
          <Text {...ku.props} style={[styles.question, { color: colors.textPrimary }, centred(ku.style)]} accessibilityRole="header" testID="riddle-question">
            {riddle.question}
          </Text>
          {translation ? (
            <>
              {translated ? <InLanguage text={translation.value.question} lang={translation.lang} align="center" style={[styles.translation, { color: colors.textSecondary }]} /> : null}
              <Pressable
                onPress={() => setTranslated((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: translated }}
                style={({ pressed }) => [styles.translationToggle, { flexDirection: dir.row }, pressed && heldDim]}
              >
                <Icon name="translate" size={14} color={colors.primary} />
                <Text style={[styles.translationToggleText, { color: colors.primary }]}>{translated ? t('stories.reader.hideTranslation') : t('stories.reader.translation')}</Text>
              </Pressable>
            </>
          ) : null}
        </View>

        {hints.length > 0 ? (
          <View style={styles.hints}>
            {hints.map((h) => (
              <Rise key={h.index} delay={h.index === fresh && !reduce ? 0 : null}>
                <HintCard hint={h} dialect={riddle.dialect} />
              </Rise>
            ))}
          </View>
        ) : null}

        {solved ? (
          <MenuIn style={[styles.solved, { backgroundColor: colors.successFill }]} accessibilityLiveRegion="polite" testID="riddle-solved">
            <DrawnCheck size={28} color={colors.success} />
            <Text style={[styles.solvedTitle, { color: colors.textPrimary }]}>{t('lore.riddle.right')}</Text>
            <Text {...kurdishIn(riddle.dialect).props} style={[styles.solvedAnswer, { color: colors.textPrimary }, centred(kurdishIn(riddle.dialect).style)]}>
              {solved.answer.answer}
            </Text>
            {solved.xp > 0 ? <Text style={[styles.solvedXp, { color: colors.goldText }]}>{t('games.solo.results.xp', { xp: solved.xp })}</Text> : null}
            <ClayButton label={t('lore.riddle.seeWhy')} tone="primary" size="large" icon="lightbulb" onPress={() => navigation.replace('RiddleAnswer', { slug })} style={styles.stretch} />
          </MenuIn>
        ) : before ? (
          <View style={styles.after}>
            <Note icon={before === 'solved' ? 'check' : 'eye'}>{before === 'solved' ? t('lore.riddle.solvedNote') : t('lore.riddle.revealedNote')}</Note>
            <ClayButton label={t('lore.riddle.seeAnswer')} tone="primary" size="large" busy={busy === 'reveal'} onPress={() => void seeAnswer()} />
          </View>
        ) : (
          <View style={styles.guess}>
            <Text style={[styles.label, dir.text, { color: colors.textPrimary }]} nativeID="riddle-guess-label">
              {t('lore.riddle.guessLabel')}
            </Text>
            <KurdishAnswerInput
              text={guess}
              onChangeText={(next) => {
                setGuess(next);
                if (verdict === 'wrong') setVerdict(null);
              }}
              dialect={riddle.dialect}
              disabled={busy === 'guess'}
              placeholder=""
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('lore.riddle.guessLabel')}
              verdict={verdict}
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface }]}
            />
            {verdict === 'wrong' ? (
              <Text style={[styles.wrong, dir.text, { color: colors.textPrimary }]}>{t(near ? NEAR_KEY[near] : 'lore.riddle.wrong')}</Text>
            ) : null}
            <ClayButton label={t('games.solo.check')} tone="primary" size="large" busy={busy === 'guess'} disabled={guess.trim() === ''} onPress={() => void check()} />
            <Text style={[styles.small, dir.text, { color: colors.textSecondary }]}>{t('lore.riddle.matching', { before: rule.before[0], after: rule.after[0] })}</Text>
            <Text style={[styles.small, dir.text, { color: colors.goldText }]}>
              {hints.length === 0 && riddle.hintCount > 0 ? t('lore.riddle.worth', { xp }) : t('lore.riddle.worthNow', { xp })}
            </Text>
            <View style={styles.helpers}>
              {moreHints ? (
                <ClayButton
                  label={t('lore.riddle.takeHint', { n: hints.length + 1, total: riddle.hintCount })}
                  icon="lightbulb"
                  variant="outline"
                  busy={busy === 'hint'}
                  onPress={() => void hint()}
                />
              ) : null}
              <ClayButton label={t('lore.riddle.showAnswer')} icon="eye" variant="outline" onPress={() => setConfirm(true)} />
            </View>
          </View>
        )}

        {problem ? <Note tone="danger" icon="alert">{problem}</Note> : null}

        <ClayButton label={t('lore.riddle.challenge')} icon="share" onPress={challenge} />
        {region}
      </ScrollView>

      {confirm ? (
        <Sheet
          title={t('lore.riddle.confirmTitle')}
          onClose={() => setConfirm(false)}
          footer={
            <>
              <ClayButton label={t('lore.riddle.showAnswer')} tone="primary" size="large" busy={busy === 'reveal'} onPress={() => void reveal()} testID="riddle-reveal-confirm" />
              <ClayButton label={t('lore.riddle.keepThinking')} onPress={() => setConfirm(false)} />
            </>
          }
        >
          <Text style={[styles.sheetText, dir.text, { color: colors.textSecondary }]}>{t('lore.riddle.confirmBody')}</Text>
        </Sheet>
      ) : null}
    </GradientBackground>
  );
}

/** A hint taken: its number, its Kurdish, and what it says in the reader's language. */
function HintCard({ hint, dialect }: { hint: RiddleHint; dialect: RiddleDetail['dialect'] }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const ku = kurdishIn(dialect);
  const translation = inReaderLanguage(hint.translations, locale);
  return (
    <View style={[styles.hint, { backgroundColor: colors.controlTrack }]} testID={`riddle-hint-${hint.index}`}>
      <View style={[styles.hintHead, { flexDirection: dir.row }]}>
        {/* Which hint this is: a label in the quiet ink, as the website numbers its hints. */}
        <Icon name="lightbulb" size={14} color={colors.textSecondary} />
        <Text style={[styles.hintLabel, { color: colors.textSecondary }]}>{t('lore.riddle.hintN', { n: hint.index + 1 })}</Text>
      </View>
      <Text {...ku.props} style={[styles.hintText, { color: colors.textPrimary }, ku.style]}>
        {hint.text}
      </Text>
      {translation ? <InLanguage text={translation.value} lang={translation.lang} style={[styles.hintTranslation, { color: colors.textSecondary }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { ...COLUMN, padding: spacing.lg, gap: spacing.lg },
  skeleton: { alignItems: 'center', paddingTop: spacing.xxl },
  facts: { flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  questionBlock: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  question: { ...display(typography.sizes.xl), lineHeight: Math.round(typography.sizes.xl * 1.32) },
  translation: { fontSize: typography.sizes.md, lineHeight: 24 },
  translationToggle: { alignItems: 'center', gap: spacing.xs, minHeight: 32, paddingHorizontal: spacing.sm },
  translationToggleText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  hints: { gap: spacing.sm },
  hint: { borderRadius: radii.md, padding: spacing.md, gap: spacing.xs },
  hintHead: { alignItems: 'center', gap: spacing.xs },
  hintLabel: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  hintText: { fontSize: typography.sizes.md, lineHeight: 24 },
  hintTranslation: { fontSize: typography.sizes.sm, lineHeight: 20 },
  guess: { gap: spacing.sm },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  input: { minHeight: 52, borderRadius: radii.md, paddingHorizontal: spacing.md, fontSize: typography.sizes.lg },
  wrong: { fontSize: typography.sizes.md, lineHeight: 22 },
  small: { fontSize: typography.sizes.xs, lineHeight: 18 },
  helpers: { gap: spacing.sm, marginTop: spacing.sm },
  after: { gap: spacing.sm },
  solved: { alignItems: 'center', borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm },
  solvedTitle: { ...display(typography.sizes.lg) },
  solvedAnswer: { ...display(typography.sizes.xl), lineHeight: Math.round(typography.sizes.xl * 1.25) },
  solvedXp: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  stretch: { alignSelf: 'stretch', marginTop: spacing.xs },
  sheetText: { fontSize: typography.sizes.md, lineHeight: 22 },
});
