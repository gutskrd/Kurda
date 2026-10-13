import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StoryDetail, StoryGameView } from '@kurda/shared';
import { useAuth } from '../../auth/AuthContext';
import { describeError } from '../../api/errors';
import type { ApiError, ApiResult } from '../../api/types';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { ClayButton } from '../../theme/glass';
import { Icon } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { display } from '../../theme/fonts';
import { radii, spacing, typography } from '../../theme/tokens';
import { useI18n } from '../../i18n/I18nContext';
import type { Translate } from '../../api/errors';
import { continueAfter } from '../api';
import { useStoryPrefs } from '../prefs';
import { evidenceText } from '../segments';
import { ENGLISH_TEXT_PROPS, ENGLISH_TEXT_STYLE, storyTextProps, storyTextStyle } from '../storyText';
import { Note, useFocusOn } from '../ui';
import { showEnglish } from './Question';

/** The one thing said aloud on a reveal: the verdict, and the right answer. */
export function revealAnnouncement(myCorrect: boolean | null, right: string, t: Translate): string {
  const verdict = myCorrect === true ? t('stories.reveal.right') : myCorrect === false ? t('stories.reveal.wrong') : t('stories.reveal.noAnswer');
  return `${verdict} ${t('stories.reveal.answerWas', { answer: right })}`;
}

/**
 * The answer (contract §A1 "Reveal"): the right option with a tick and the
 * words "Right answer" (never colour alone), your own choice marked, the
 * one-line explanation, and the sentence of the story that answers it, quoted
 * in the story's own direction. In a duo or group, how many got it — not who —
 * and a Continue that waits for everyone (or the reveal's time limit); the
 * host cannot skip it for the others. Alone, Next.
 */
export function Reveal({
  view,
  story,
  apply,
  announce,
}: {
  view: StoryGameView;
  story: StoryDetail | null;
  apply: (res: ApiResult<StoryGameView>) => ApiError | null;
  announce: (message: string) => void;
}): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { prefs, update } = useStoryPrefs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = view.reveal;
  const q = view.question;
  const headRef = useRef<Text>(null);
  const said = useRef<number | null>(null);
  useFocusOn(headRef, r ? r.index : null);

  // the review item carries the prompt and options once the game is over; before that, the question does
  const item = view.results?.review.find((x) => x.index === r?.index);
  const prompt = item?.prompt ?? q?.prompt ?? '';
  const options = item?.options ?? q?.options ?? [];
  const right = r ? (options[r.correctIndex] ?? '') : '';

  useEffect(() => {
    if (!r || said.current === r.index) return;
    said.current = r.index;
    announce(revealAnnouncement(r.myCorrect, right, t));
  }, [r, right, announce, t]);

  if (!r) return null;
  const dialect = view.settings.dialect;
  const dir = storyTextStyle(dialect);
  const props = storyTextProps(dialect);
  const english = showEnglish(prefs.englishUnder, view.settings.level);
  const quote = story ? evidenceText(story.paragraphs, r.evidenceParagraph, r.evidenceSentence) : null;
  const last = r.index === (q?.total ?? view.settings.questionCount) - 1;
  const solo = view.mode === 'solo';

  const next = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const err = apply(await continueAfter(client, view.id, r.index));
    setBusy(false);
    if (err && err.status !== 409) setError(describeError(err, t));
  };

  const verdictIcon = r.myCorrect === true ? 'check' : r.myCorrect === false ? 'close' : 'timer';
  const verdictColor = r.myCorrect === true ? colors.success : r.myCorrect === false ? colors.danger : colors.textSecondary;

  return (
    <>
      <Text style={[styles.index, { color: colors.textSecondary }]}>
        {t('stories.questionOf', { index: r.index + 1, total: q?.total ?? view.settings.questionCount })}
      </Text>
      <View style={[styles.verdict, { backgroundColor: r.myCorrect === true ? colors.successFill : r.myCorrect === false ? colors.dangerFill : colors.controlTrack }]}>
        <Icon name={verdictIcon} size={24} color={verdictColor} />
        <Text ref={headRef} style={[styles.verdictText, { color: verdictColor }]} accessibilityRole="header">
          {r.myCorrect === true ? t('stories.reveal.right') : r.myCorrect === false ? t('stories.reveal.wrong') : t('stories.reveal.noAnswer')}
        </Text>
      </View>

      <Text {...props} style={[styles.prompt, { color: colors.textPrimary }, dir]}>
        {prompt}
      </Text>

      <View style={styles.options}>
        {options.map((option, i) => {
          const correct = i === r.correctIndex;
          const mine = i === r.myChoice;
          const tag = correct ? t('stories.reveal.rightAnswer') : mine ? t('stories.reveal.yourAnswer') : null;
          return (
            <View
              key={i}
              accessible
              accessibilityLabel={[`${i + 1}. ${option}`, tag, correct && mine ? t('stories.reveal.yourAnswer') : null].filter(Boolean).join(', ')}
              style={[
                styles.option,
                { backgroundColor: correct ? colors.successFill : mine ? colors.dangerFill : colors.glassFill },
              ]}
            >
              {correct || mine ? (
                <Icon name={correct ? 'check' : 'close'} size={18} color={correct ? colors.success : colors.danger} />
              ) : (
                <View style={styles.iconSpace} />
              )}
              <View style={styles.optionMain}>
                <Text {...props} style={[styles.optionText, { color: colors.textPrimary }, dir]}>
                  {option}
                </Text>
                {tag ? (
                  <Text style={[styles.tag, { color: correct ? colors.success : colors.danger }]}>
                    {correct && mine ? `${tag} · ${t('stories.reveal.yourAnswer')}` : tag}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {r.explanation ? (
        <View style={styles.explain}>
          <Text {...props} style={[styles.explanation, { color: colors.textPrimary }, dir]}>
            {r.explanation}
          </Text>
          {r.explanationEn && english ? (
            <Text {...ENGLISH_TEXT_PROPS} style={[styles.english, { color: colors.textSecondary }, ENGLISH_TEXT_STYLE]}>
              {r.explanationEn}
            </Text>
          ) : null}
          {r.explanationEn ? (
            <Pressable onPress={() => update({ englishUnder: !english })} accessibilityRole="button" style={styles.toggle} hitSlop={8}>
              <Text style={[styles.toggleText, { color: colors.primary }]}>{english ? t('stories.question.hideEnglish') : t('stories.question.showEnglish')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {quote ? (
        <View style={[styles.quote, { backgroundColor: colors.controlTrack }]}>
          <View style={[styles.quoteBar, { backgroundColor: colors.primary }]} />
          <View style={styles.quoteMain}>
            <Text style={[styles.quoteLabel, { color: colors.textSecondary }]}>{t('stories.reveal.fromStory')}</Text>
            <Text {...props} style={[styles.quoteText, { color: colors.textPrimary }, dir]}>
              {quote}
            </Text>
          </View>
        </View>
      ) : null}

      {!solo ? (
        <Text style={[styles.count, { color: colors.textSecondary }]}>
          {t('stories.reveal.gotIt', { correct: r.correctCount, answered: r.answeredCount })}
        </Text>
      ) : null}
      {!last ? <Text style={[styles.count, { color: colors.textSecondary }]}>{t('stories.reveal.seeAgain')}</Text> : null}

      {error ? <Note tone="danger" icon="alert">{error}</Note> : null}
      {!solo && view.meContinued ? (
        <Text style={[styles.waiting, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">
          {t('stories.reveal.waiting', { done: view.continuedCount, total: view.activeCount })}
        </Text>
      ) : (
        <ClayButton
          label={last ? t('stories.reveal.results') : solo ? t('stories.reveal.next') : t('common.continue')}
          tone="primary"
          size="large"
          busy={busy}
          onPress={() => void next()}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  index: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, padding: spacing.md },
  verdictText: { ...display(typography.sizes.lg) },
  prompt: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, lineHeight: 28 },
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionMain: { flex: 1, gap: 2 },
  optionText: { fontSize: typography.sizes.md, lineHeight: 22 },
  tag: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  explain: { gap: spacing.xs },
  explanation: { fontSize: typography.sizes.md, lineHeight: 23 },
  english: { fontSize: typography.sizes.sm, lineHeight: 20 },
  toggle: { alignSelf: 'flex-start', minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  toggleText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  quote: { flexDirection: 'row', borderRadius: radii.md, padding: spacing.md, gap: spacing.md },
  quoteBar: { width: 3, borderRadius: radii.pill },
  quoteMain: { flex: 1, gap: spacing.xs },
  iconSpace: { width: 18 },
  quoteLabel: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  quoteText: { fontSize: typography.sizes.md, lineHeight: 24, fontStyle: 'italic' },
  count: { fontSize: typography.sizes.sm, textAlign: 'center' },
  waiting: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, textAlign: 'center' },
});
