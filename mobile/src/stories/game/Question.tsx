import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { PressableScale, heldDim } from '../../theme/MotionParts';
import type { StoryDetail, StoryGameView, StoryGlossEntry } from '@kurda/shared';
import { useAuth } from '../../auth/AuthContext';
import { describeError } from '../../api/errors';
import type { ApiError, ApiResult } from '../../api/types';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { ClayButton } from '../../theme/glass';
import { Icon } from '../../theme/Icon';
import { Tile } from '../../theme/Tile';
import { useTheme } from '../../theme/ThemeProvider';
import { display } from '../../theme/fonts';
import { radii, spacing, typography } from '../../theme/tokens';
import { useI18n } from '../../i18n/I18nContext';
import { advanceGame, answerQuestion } from '../api';
import { sendAnswer } from '../answer';
import { useStoryPrefs } from '../prefs';
import { STORY_BODY_SIZE, StoryText } from '../StoryText';
import { storyRowDirection, storyTextProps, storyTextStyle } from '../storyText';
import { Note, Sheet, useFocusOn } from '../ui';
import { closesSoon, isTimed, secondsLeft, useTicker } from './clock';
import { ExtraTimeSwitch } from './ExtraTimeSwitch';
import { questionIn } from '../legend';
import { translatedText, translationToggle } from './translated';

/** An option tile's minimum height, shared with the reveal. */
export const OPTION_MIN_HEIGHT = 60;

/** Progress under "Question 2 of 5": one short line per question, done and current ones in violet. Hidden from screen readers, which hear the words. */
export function QuestionSteps({ index, total }: { index: number; total: number }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.steps} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="question-steps">
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.step, { backgroundColor: i <= index ? colors.primary : colors.controlTrack }]} />
      ))}
    </View>
  );
}

/** Whether English shows under the question: this phone's setting, else only at level 1. */
export function showEnglish(pref: boolean | null, level: number): boolean {
  return pref ?? level === 1;
}

type Sending = { choice: number; state: 'sending' | 'failed' | 'late'; error?: string };

/**
 * One question (contract §A1 "Question"). Its title takes screen-reader focus when a new question arrives, and
 * nothing else here does. The timer is a bar announced once at ten seconds left; an untimed group question says only
 * that it closes soon in its last half minute. An answer is resent until it lands or the question closes (answer.ts),
 * showing "Sending…" then "Answer locked" with how many have answered, never who.
 */
export function Question({
  view,
  story,
  apply,
  refresh,
  serverNow,
  announce,
  onGloss,
}: {
  view: StoryGameView;
  story: StoryDetail | null;
  apply: (res: ApiResult<StoryGameView>) => ApiError | null;
  refresh: () => void;
  serverNow: () => number;
  announce: (message: string) => void;
  onGloss: (entry: StoryGlossEntry) => void;
}): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const { prefs, update } = useStoryPrefs();
  const q = view.question;
  const titleRef = useRef<Text>(null);
  const [sending, setSending] = useState<Sending | null>(null);
  const [storyOpen, setStoryOpen] = useState(false);
  const [hostBusy, setHostBusy] = useState(false);
  const warned = useRef<number | null>(null);
  const timed = isTimed(view);
  useTicker(timed ? 250 : 5_000, true);
  useFocusOn(titleRef, q ? q.index : null);

  // A new question clears the last one's sending state and story sheet.
  useEffect(() => {
    setSending(null);
    setStoryOpen(false);
  }, [q?.index]);

  // The question on screen now, so an answer still in flight when the next arrives cannot apply "too late" or its choice to it.
  const shownIndex = useRef(q?.index);
  shownIndex.current = q?.index;

  const left = timed ? secondsLeft(view.phaseEndsAt, serverNow()) : null;
  useEffect(() => {
    if (left !== null && left <= 10 && left > 0 && warned.current !== q?.index && q?.myChoice === null) {
      warned.current = q?.index ?? null;
      announce(t('stories.question.tenSeconds'));
    }
  }, [left, q?.index, q?.myChoice, announce, t]);

  if (!q) return null;
  const dialect = view.settings.dialect;
  const english = showEnglish(prefs.englishUnder, view.settings.level);
  // The question in the reader's language where the story has it, else English (shown under the Kurdish on request).
  const tr = questionIn(q, locale);
  const trSet = tr ? translatedText(tr.lang) : null;
  const locked = q.myChoice !== null;
  const chosen = locked ? q.myChoice : (sending?.choice ?? null);
  const total = view.settings.timerSeconds * (view.extraTime ? 2 : 1);

  const answer = async (choice: number): Promise<void> => {
    if (locked || sending?.state === 'sending') return;
    const index = q.index;
    setSending({ choice, state: 'sending' });
    const out = await sendAnswer({
      send: () => answerQuestion(client, view.id, index, choice),
      serverNow,
      phaseEndsAt: view.phaseEndsAt,
      movedOn: () => shownIndex.current !== index,
    });
    // The game moved on meanwhile; the newer view already shows where it is.
    if (shownIndex.current !== index) return;
    switch (out.kind) {
      case 'accepted':
        apply({ ok: true, data: out.view });
        setSending(null);
        if (view.mode !== 'solo') announce(t('stories.question.locked'));
        return;
      case 'already':
      case 'not-current':
        // It arrived after all, or the question already moved on: show where the game is.
        refresh();
        setSending(null);
        return;
      case 'too-late':
        setSending({ choice, state: 'late' });
        announce(t('stories.question.tooLate'));
        return;
      case 'failed':
        setSending({ choice, state: 'failed', error: describeError(out.error, t) });
    }
  };

  const status = locked
    ? view.mode === 'solo'
      ? null
      : t('stories.question.lockedCount', { answered: view.answeredCount, total: view.activeCount })
    : sending?.state === 'sending'
      ? t('stories.question.sending')
      : null;

  return (
    <>
      <View style={styles.head}>
        <Text ref={titleRef} style={[styles.index, { color: colors.textSecondary }]} accessibilityRole="header">
          {t('stories.questionOf', { index: q.index + 1, total: q.total })}
        </Text>
        {view.settings.textDuring === 'visible' && story ? (
          <PressableScale
            onPress={() => setStoryOpen(true)}
            accessibilityRole="button"
            style={[styles.storyButton, { backgroundColor: colors.controlTrack }]}
          >
            <Icon name="story" size={16} color={colors.primary} />
            <Text style={[styles.storyButtonText, { color: colors.primary }]}>{t('stories.question.story')}</Text>
          </PressableScale>
        ) : null}
      </View>
      <QuestionSteps index={q.index} total={q.total} />

      {timed && left !== null ? <TimerBar left={left} total={total} /> : null}

      <Text {...storyTextProps(dialect)} style={[styles.prompt, { color: colors.textPrimary }, storyTextStyle(dialect)]}>
        {q.prompt}
      </Text>
      {tr?.prompt && trSet && english ? (
        <Text {...trSet.props} style={[styles.english, { color: colors.textSecondary }, trSet.style]}>
          {tr.prompt}
        </Text>
      ) : null}
      {tr?.prompt ? (
        <Pressable
          onPress={() => update({ englishUnder: !english })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.toggle, pressed && heldDim]}
          hitSlop={8}
        >
          <Text style={[styles.toggleText, { color: colors.primary }]}>{translationToggle(tr.lang, english, t)}</Text>
        </Pressable>
      ) : null}

      <View style={styles.options}>
        {q.options.map((option, i) => {
          const on = chosen === i;
          return (
            // A lesson's lipped answer tile: it sinks under the finger, takes the brand ink once chosen, and fades when another is.
            <Tile
              key={i}
              state={on ? 'picked' : locked ? 'disabled' : 'idle'}
              onPress={() => void answer(i)}
              disabled={locked || sending?.state === 'sending'}
              accessibilityLabel={`${i + 1}. ${option}`}
              {...storyTextProps(dialect)}
              selected={on}
              faceStyle={[styles.option, { flexDirection: storyRowDirection(dialect) }]}
            >
              {(ink) => (
                <>
                  <View style={[styles.badge, { backgroundColor: on ? colors.primary : colors.controlTrack }]}>
                    <Text style={[styles.badgeText, { color: on ? colors.textOnPrimary : colors.textPrimary }]}>{i + 1}</Text>
                  </View>
                  <View style={styles.optionMain}>
                    <Text {...storyTextProps(dialect)} style={[styles.optionText, { color: ink }, storyTextStyle(dialect)]}>
                      {option}
                    </Text>
                    {english && trSet && tr?.options?.[i] ? (
                      <Text {...trSet.props} style={[styles.optionTranslation, { color: ink }, trSet.style]}>
                        {tr.options[i]}
                      </Text>
                    ) : null}
                  </View>
                </>
              )}
            </Tile>
          );
        })}
      </View>

      {status ? (
        <View style={styles.statusRow}>
          {/* Sent but not judged: violet, so no tick says "right" before the reveal. */}
          {locked ? <Icon name="check" size={16} color={colors.primary} /> : null}
          <Text style={[styles.status, { color: colors.textPrimary }]}>{status}</Text>
        </View>
      ) : null}
      {sending?.state === 'late' ? <Note tone="danger" icon="timer">{t('stories.question.tooLate')}</Note> : null}
      {sending?.state === 'failed' ? (
        <>
          <Note tone="danger" icon="alert">{sending.error ?? t('common.tryAgain')}</Note>
          <ClayButton label={t('stories.question.sendAgain')} tone="primary" onPress={() => void answer(sending.choice)} />
        </>
      ) : null}
      {closesSoon(view, serverNow()) && !locked ? (
        <Text style={[styles.soon, { color: colors.textSecondary }]}>{t('stories.question.closesSoon')}</Text>
      ) : null}

      {view.isHost && view.mode !== 'solo' && view.settings.timerSeconds === 0 ? (
        <ClayButton
          label={t('stories.question.revealNow')}
          variant="outline"
          busy={hostBusy}
          onPress={() => {
            setHostBusy(true);
            void advanceGame(client, view.id, { status: 'question', index: q.index }).then((res) => {
              setHostBusy(false);
              apply(res);
            });
          }}
        />
      ) : null}

      <ExtraTimeSwitch view={view} apply={apply} />

      {storyOpen && story ? (
        <Sheet
          title={story.title}
          dialect={dialect}
          onClose={() => setStoryOpen(false)}
          // Looking at the story must not hide how long is left.
          footer={timed && left !== null ? <TimerBar left={left} total={total} withText /> : undefined}
        >
          <StoryText story={story} fontSize={Math.round(STORY_BODY_SIZE * prefs.textScale)} onGloss={onGloss} />
        </Sheet>
      ) : null}
    </>
  );
}

/**
 * The time left on a timed question: a bar that turns red in the last ten seconds, read as "12 seconds left".
 * `withText` shows the seconds too, where the bar stands alone (the Story sheet).
 */
function TimerBar({ left, total, withText }: { left: number; total: number; withText?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const urgent = left <= 10;
  return (
    <View style={styles.timer}>
      {withText ? (
        <Text style={[styles.timerText, { color: urgent ? colors.danger : colors.textSecondary }]} importantForAccessibility="no" accessibilityElementsHidden>
          {t('stories.question.timeLeft', { seconds: left })}
        </Text>
      ) : null}
      <View
        style={[styles.track, { backgroundColor: colors.controlTrack }]}
        accessibilityRole="progressbar"
        accessibilityLabel={t('stories.question.timeLeft', { seconds: left })}
        accessibilityValue={{ min: 0, max: total, now: left }}
      >
        <View
          style={[
            styles.fill,
            { width: `${total > 0 ? Math.min(100, (left / total) * 100) : 0}%`, backgroundColor: urgent ? colors.danger : colors.primary },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', gap: spacing.xs },
  step: { flex: 1, height: 4, borderRadius: radii.pill },
  timer: { gap: spacing.xs },
  timerText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  index: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, letterSpacing: 0.5 },
  storyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
  },
  storyButtonText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  track: { height: 8, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radii.pill },
  prompt: { ...display(typography.sizes.lg), lineHeight: 30 },
  english: { fontSize: typography.sizes.md, lineHeight: 22 },
  toggle: { alignSelf: 'flex-start', minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  toggleText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  options: { gap: spacing.sm },
  // A full-width tile's face: the number, then the words from where the text starts.
  option: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.md,
    minHeight: OPTION_MIN_HEIGHT,
    paddingVertical: spacing.sm,
  },
  badge: { width: 30, height: 30, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  optionMain: { flex: 1, gap: 2 },
  optionText: { fontSize: typography.sizes.md, lineHeight: 22 },
  optionTranslation: { fontSize: typography.sizes.sm, lineHeight: 19, opacity: 0.8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  status: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, textAlign: 'center' },
  soon: { fontSize: typography.sizes.sm, textAlign: 'center' },
});
