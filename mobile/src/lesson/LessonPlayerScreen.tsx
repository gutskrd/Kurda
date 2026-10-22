import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { GrammarTips } from '../grammar/GrammarTips';
import { radii, spacing, typography } from '../theme/tokens';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonLines } from '../theme/Skeleton';
import { BottomSheet } from '../theme/BottomSheet';
import { useScreenBottomInset, useScreenTopInset } from '../navigation/tabBarLayout';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { encodeAnswer } from './answers';
import { FeedbackFooter } from './components/FeedbackFooter';
import { knownVoice } from '../characters/SpeakingCharacter';
import { LessonResults } from './components/LessonResults';
import { ListeningExercise } from './components/ListeningExercise';
import { MatchPairsExercise } from './components/MatchPairsExercise';
import { MultipleChoiceExercise } from './components/MultipleChoiceExercise';
import { ProgressBar } from './components/ProgressBar';
import { SpeakingExercise } from './components/SpeakingExercise';
import { WritingExercise } from './components/WritingExercise';
import { TranslateExercise } from './components/TranslateExercise';
import { emptyMatch, type MatchState } from './match';
import { answerFeel, currentExercise, initPlayer, isReask, progress, reduce } from './player';
import { NO_MOMENTS, lessonMoments, type LessonMoments, type Standing, type StreakMark } from './moments';
import { haptic } from '../feedback/haptics';
import { playSound } from '../feedback/sounds';
import { AnswerQueue } from './queue';
import type { AnswerResult, Exercise, RetryResult, SelfRating, SessionResults, SessionView } from './types';
import type { ApiClient } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';

/** Endpoint paths for a playable session — lessons and practice differ only here. */
export interface SessionPaths {
  answers: (sessionId: string) => string;
  /** a second try at a missed item: graded, never recorded */
  retry: (sessionId: string) => string;
  complete: (sessionId: string) => string;
}

const LESSON_PATHS: SessionPaths = {
  answers: (id) => `/sessions/${id}/answers`,
  retry: (id) => `/sessions/${id}/retry`,
  complete: (id) => `/sessions/${id}/complete`,
};

/**
 * The lesson player (KUR-029). Loads a session, drives the pure player
 * reducer, renders each exercise type, grades answers server-side, and
 * shows a completion summary. Answers submitted while offline are queued
 * and flushed on reconnect. The core is shared with practice mode (KUR-034)
 * via SessionPlayer.
 */
export function LessonPlayerScreen({ lessonId, onExit }: { lessonId: string; onExit: () => void }) {
  const { client } = useAuth();
  const { t } = useI18n();
  const [view, setView] = useState<SessionView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    void client.get<SessionView>(`/lessons/${lessonId}/session`).then((res) => {
      if (!active) return;
      if (res.ok) setView(res.data);
      else setLoadError(describeError(res.error, t));
    });
    return () => {
      active = false;
    };
  }, [client, lessonId, attempt]);

  if (loadError) {
    return (
      <GradientBackground>
        <Stuck title={t('lesson.loadFailed')} detail={loadError} onRetry={() => setAttempt((n) => n + 1)} onExit={onExit} />
      </GradientBackground>
    );
  }
  if (!view) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <Skeleton width="55%" height={22} />
          <SkeletonLines count={3} />
          <Skeleton height={140} radius={radii.lg} />
        </View>
      </GradientBackground>
    );
  }
  return <SessionPlayer view={view} paths={LESSON_PATHS} onExit={onExit} offerReminders />;
}

/**
 * The playable session core, shared by lessons and practice. Given an
 * initial view and the endpoint paths, it drives the reducer, renders
 * exercises, grades answers (with offline queueing), and shows results.
 */
export function SessionPlayer({
  view,
  paths,
  onExit,
  offerReminders = false,
}: {
  view: SessionView;
  paths: SessionPaths;
  onExit: () => void;
  /** a finished lesson may offer reminders; practice does not */
  offerReminders?: boolean;
}) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();
  const bottomInset = useScreenBottomInset(spacing.lg);
  // the way out and the bar read from the right in Soranî and Arabic, as every other screen's header does
  const dir = useDirection();
  const [state, dispatch] = useReducer(reduce, view, (v) => initPlayer(v));
  const queue = useRef(new AnswerQueue()).current;
  // right answers in a row, which the chime climbs with and the banner names from the third
  const run = useRef(0);
  const [inARow, setInARow] = useState(0);

  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [match, setMatch] = useState<MatchState>(emptyMatch);
  const [recorded, setRecorded] = useState(false);
  const [selfRating, setSelfRating] = useState<SelfRating | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /*
   * An answer that did not get through: 'offline' when there was no
   * connection (it waits in the queue), 'failed' when the server could not
   * take it just then. Each says which — "you're offline" to somebody who is
   * not is the app blaming their phone for its own hiccup.
   */
  const [stall, setStall] = useState<'offline' | 'failed' | null>(null);
  const [results, setResults] = useState<SessionResults | null>(null);
  const [skipSpeaking, setSkipSpeaking] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // the finished lesson could not be added up (offline, a server hiccup): said, with a retry, never a spinner for ever
  const [completeFailed, setCompleteFailed] = useState(false);
  const [completeAttempt, setCompleteAttempt] = useState(0);

  const ex = currentExercise(state);

  // what a finished lesson is compared with (moments.ts): the level, the
  // streak and today's goal as they stood when it opened
  const before = useRef<Standing | null>(null);
  const [moments, setMoments] = useState<LessonMoments>(NO_MOMENTS);

  // learner's course-wide "skip speaking" preference (KUR-036), and where they stand
  useEffect(() => {
    void readStanding(client).then(({ standing, skipSpeaking: skip }) => {
      before.current = standing;
      setSkipSpeaking(skip);
    });
  }, [client]);

  // auto-skip speaking exercises when the learner has opted out
  useEffect(() => {
    if (ex?.type === 'speaking' && skipSpeaking && state.status === 'answering') {
      dispatch({ type: 'SKIP' });
    }
  }, [ex, skipSpeaking, state.status]);

  // reset the input whenever a new exercise comes on screen
  useEffect(() => {
    setChoice(null);
    setText('');
    setMatch(emptyMatch);
    setRecorded(false);
    setSelfRating(null);
    setStall(null);
  }, [state.index]);

  const draft = useMemo(() => {
    if (!ex) return null;
    switch (ex.type) {
      case 'multiple_choice':
        return { type: 'multiple_choice' as const, choice };
      case 'translate':
        return { type: 'translate' as const, text };
      case 'listening':
        return { type: 'listening' as const, text };
      case 'writing':
        return { type: 'writing' as const, text };
      case 'speaking':
        return { type: 'speaking' as const, recorded, selfRating };
      case 'match_pairs':
        return { type: 'match_pairs' as const, matches: match.matches };
    }
  }, [ex, choice, text, match, recorded, selfRating]);

  const canCheck = useMemo(() => {
    if (!ex || !draft) return false;
    switch (draft.type) {
      case 'multiple_choice':
        return draft.choice !== null;
      case 'translate':
      case 'listening':
      case 'writing':
        return draft.text.trim().length > 0;
      case 'speaking':
        // recorded, heard beside the model, and rated
        return draft.recorded && draft.selfRating !== null;
      case 'match_pairs':
        return draft.matches.length === (ex.lefts?.length ?? 0);
    }
  }, [ex, draft]);

  // finish → complete the session and show results; then ask again where
  // things stand, for what else this lesson did (a goal met, a new level)
  useEffect(() => {
    if (state.status !== 'finished' || results) return;
    setCompleteFailed(false);
    void client.post<SessionResults>(paths.complete(view.sessionId)).then((res) => {
      if (!res.ok) {
        setCompleteFailed(true);
        return;
      }
      setResults(res.data);
      const streakNow: StreakMark = { current: res.data.streak.current, lastActiveOn: res.data.streak.lastActiveOn };
      void readStanding(client).then(({ standing }) => setMoments(lessonMoments(before.current, standing, streakNow)));
    });
  }, [state.status, results, client, view.sessionId, paths, completeAttempt]);

  // what was typed, so the feedback can set it beside the right answer
  const given =
    draft?.type === 'translate' || draft?.type === 'listening' || draft?.type === 'writing' ? draft.text.trim() : undefined;
  const reask = isReask(state);
  // how the answer on screen was graded, for the exercise to answer back with
  const verdict = state.feedback ? (state.feedback.accepted ? 'right' : 'wrong') : null;

  const check = useCallback(async () => {
    if (!ex || !draft || submitting) return;
    setSubmitting(true);
    const body = { exerciseId: ex.id, answer: encodeAnswer(draft) };
    // a second try at a miss is graded and never recorded, so it is not queued
    // for later either: offline, the learner simply tries again
    if (reask) {
      const res = await client.post<RetryResult>(paths.retry(view.sessionId), body);
      setSubmitting(false);
      if (res.ok) {
        setStall(null);
        feelAnswer(ex.type, res.data.accepted, run, setInARow);
        dispatch({ type: 'ANSWERED', result: res.data, given });
      }
      // refused (the session ended, say): the second try counts for nothing,
      // so it is let go rather than asked over and over
      else if (res.error.kind === 'client') dispatch({ type: 'SKIP' });
      else setStall(res.error.kind === 'network' ? 'offline' : 'failed');
      return;
    }
    const res = await client.post<AnswerResult>(paths.answers(view.sessionId), body);
    setSubmitting(false);
    if (res.ok) {
      // a retry that went through puts the verdict back where the retry was
      setStall(null);
      feelAnswer(ex.type, res.data.accepted, run, setInARow);
      dispatch({ type: 'ANSWERED', result: res.data, given });
    } else if (res.error.kind === 'network') {
      queue.enqueue({ exerciseId: ex.id, answer: body.answer });
      setStall('offline');
    } else {
      setStall('failed'); // surface a retry for transient server errors too
    }
  }, [ex, draft, submitting, client, view.sessionId, queue, paths, reask, given]);

  const retry = useCallback(async () => {
    if (queue.isEmpty()) {
      await check();
      return;
    }
    setSubmitting(true);
    const sent = await queue.flush(async (pending) => {
      const res = await client.post<AnswerResult>(paths.answers(view.sessionId), {
        exerciseId: pending.exerciseId,
        answer: pending.answer,
      });
      return res.ok ? res.data : null;
    });
    setSubmitting(false);
    const last = sent[sent.length - 1];
    if (last) {
      setStall(null);
      feelAnswer(ex?.type, last.accepted, run, setInARow);
      dispatch({ type: 'ANSWERED', result: last, given });
    }
  }, [queue, client, view.sessionId, paths, check, given, ex]);

  /*
   * The ✕ before anything is answered just goes. After that it asks once,
   * saying how far the lesson has come and that nothing is lost — the answers
   * stay on the server and the lesson opens where it stopped — so a stray tap
   * near the corner does not end it, and leaving is never made to feel bad.
   */
  const quit = () => {
    if (state.answeredCount === 0) {
      onExit();
      return;
    }
    haptic('select');
    setLeaving(true);
  };

  if (state.status === 'finished' && results) {
    return (
      <GradientBackground>
        <LessonResults
          results={results}
          exercises={state.exercises}
          skipped={state.skipped.length}
          moments={moments}
          offerReminders={offerReminders}
          onDone={onExit}
        />
      </GradientBackground>
    );
  }
  if (state.status === 'finished' && completeFailed) {
    return (
      <GradientBackground>
        <Stuck title={t('lesson.resultsFailed')} onRetry={() => setCompleteAttempt((n) => n + 1)} onExit={onExit} />
      </GradientBackground>
    );
  }
  if (state.status === 'finished') {
    return (
      <GradientBackground>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.tallying, { color: colors.textSecondary }]}>{t('lesson.tallying')}</Text>
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      {/* the Check button rides above the keyboard while an answer is typed, rather than under it */}
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { flexDirection: dir.row, paddingTop: topInset }]}>
          <Pressable
            onPress={quit}
            accessibilityRole="button"
            accessibilityLabel={t('lesson.quit')}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Icon name="close" size={24} color={colors.textSecondary} />
          </Pressable>
          <View style={styles.progressWrap}>
            <ProgressBar value={progress(state)} />
          </View>
          {view.grammarMd ? (
            <Pressable
              onPress={() => setShowTips(true)}
              accessibilityRole="button"
              accessibilityLabel={t('lesson.grammarTips')}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            >
              <Icon name="lightbulb" size={22} color={colors.goldText} />
            </Pressable>
          ) : null}
        </View>
        {reask ? <Text style={[styles.reask, { color: colors.textSecondary }]}>{t('lesson.secondTry')}</Text> : null}

      <BottomSheet visible={leaving} onClose={() => setLeaving(false)} title={t('lesson.leave.title')} testID="lesson-leave">
        <Text style={[styles.leaveBody, dir.text, { color: colors.textSecondary }]}>
          {t('lesson.leave.body', { done: state.answeredCount, total: state.exercises.length })}
        </Text>
        <View style={styles.leaveActions}>
          <ClayButton label={t('lesson.leave.stay')} tone="primary" onPress={() => setLeaving(false)} />
          <ClayButton label={t('lesson.leave.go')} variant="outline" onPress={onExit} />
        </View>
      </BottomSheet>

      {view.grammarMd ? (
        <Modal visible={showTips} animationType="slide" onRequestClose={() => setShowTips(false)}>
          <GrammarTips source={view.grammarMd} onClose={() => setShowTips(false)} />
        </Modal>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {ex?.type === 'multiple_choice' ? (
          <MultipleChoiceExercise
            exercise={ex}
            choice={choice}
            onSelect={setChoice}
            disabled={state.status !== 'answering'}
            feedback={state.feedback}
          />
        ) : null}
        {ex?.type === 'translate' ? (
          <TranslateExercise
            exercise={ex}
            text={text}
            onChangeText={setText}
            dialect={view.dialect}
            verdict={verdict}
            disabled={state.status !== 'answering'}
          />
        ) : null}
        {ex?.type === 'listening' ? (
          <ListeningExercise
            exercise={ex}
            text={text}
            onChangeText={setText}
            dialect={view.dialect}
            verdict={verdict}
            onSkip={() => dispatch({ type: 'SKIP' })}
            disabled={state.status !== 'answering'}
          />
        ) : null}
        {ex?.type === 'writing' ? (
          <WritingExercise
            exercise={ex}
            text={text}
            onChangeText={setText}
            dialect={view.dialect}
            verdict={verdict}
            disabled={state.status !== 'answering'}
          />
        ) : null}
        {ex?.type === 'speaking' ? (
          // a fresh one for each step: two speaking exercises in a row would
          // otherwise share one microphone, and the first one's take (or one
          // still running when it was skipped) would follow into the second
          <SpeakingExercise
            key={state.index}
            exercise={ex}
            onSetRecorded={setRecorded}
            selfRating={selfRating}
            onRate={setSelfRating}
            onSkip={() => dispatch({ type: 'SKIP' })}
            disabled={state.status !== 'answering'}
          />
        ) : null}
        {ex?.type === 'match_pairs' ? (
          <MatchPairsExercise
            exercise={ex}
            state={match}
            onChange={setMatch}
            disabled={state.status !== 'answering'}
            verdict={verdict}
          />
        ) : null}
      </ScrollView>

        {stall ? (
          <Pressable
            onPress={retry}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityState={{ disabled: submitting, busy: submitting }}
            style={[styles.offline, { backgroundColor: colors.controlTrack, marginBottom: bottomInset }]}
          >
            <Text style={[styles.offlineText, { color: colors.textSecondary }]}>
              {submitting ? t('lesson.syncing') : stall === 'offline' ? t('lesson.offlineRetry') : t('lesson.failedRetry')}
            </Text>
          </Pressable>
        ) : (
          <FeedbackFooter
            feedback={state.feedback}
            inARow={inARow}
            staged={(ex?.type === 'listening' && knownVoice(ex.audioVoice) !== null) || (ex?.type === 'speaking' && knownVoice(ex.modelAudioVoice) !== null)}
            canCheck={canCheck}
            submitting={submitting}
            onCheck={check}
            onContinue={() => dispatch({ type: 'CONTINUE' })}
          />
        )}
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

/**
 * Something the lesson needed did not come — the lesson itself, or its
 * results. Said plainly, with the one thing that may fix it and a way out.
 */
function Stuck({ title, detail, onRetry, onExit }: { title: string; detail?: string; onRetry: () => void; onExit: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.centered}>
      <Text style={[styles.errorText, { color: colors.textPrimary }]} accessibilityRole="header">
        {title}
      </Text>
      {detail ? <Text style={[styles.errorDetail, { color: colors.textSecondary }]}>{detail}</Text> : null}
      <View style={styles.stuckActions}>
        <ClayButton label={t('common.retry')} tone="primary" size="large" onPress={onRetry} />
        <ClayButton label={t('common.back')} onPress={onExit} />
      </View>
    </View>
  );
}

/**
 * Felt and heard as the verdict arrives (`answerFeel`): crisp when right, a
 * gentle double when not. A right answer's chime climbs a step for each one
 * in a row (`run`, counted per lesson); a miss starts the run again.
 */
function feelAnswer(
  type: Exercise['type'] | undefined,
  accepted: boolean,
  run: { current: number },
  shown: (inARow: number) => void,
): void {
  const feel = answerFeel(type, accepted);
  if (feel) haptic(feel);
  if (feel === 'correct') {
    playSound('correct', run.current);
    run.current += 1;
  } else if (feel === 'wrong') {
    playSound('wrong');
    run.current = 0;
  }
  shown(run.current);
}

/** `/me` and `/me/daily-goal`, read together: where the learner stands, for `lessonMoments`. */
async function readStanding(client: ApiClient): Promise<{ standing: Standing | null; skipSpeaking: boolean }> {
  const [me, goal] = await Promise.all([
    client.get<{ user: { skipSpeaking?: boolean; level?: { level?: number }; streak?: StreakMark } }>('/me'),
    client.get<{ completed?: boolean }>('/me/daily-goal'),
  ]);
  if (!me.ok) return { standing: null, skipSpeaking: false };
  const user = me.data.user;
  return {
    skipSpeaking: !!user.skipSpeaking,
    standing: {
      level: typeof user.level?.level === 'number' ? user.level.level : null,
      streak: user.streak ? { current: user.streak.current, lastActiveOn: user.streak.lastActiveOn ?? null } : null,
      goalCompleted: goal.ok && typeof goal.data.completed === 'boolean' ? goal.data.completed : null,
    },
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  loading: { flex: 1, gap: spacing.lg, padding: spacing.xl, paddingTop: spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  // a fingertip's worth around a 24pt mark; the row's own gap does the spacing
  headerButton: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', marginHorizontal: -spacing.sm },
  pressed: { opacity: 0.6 },
  reask: { fontSize: typography.sizes.sm, paddingHorizontal: spacing.lg },
  progressWrap: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  tallying: { fontSize: typography.sizes.md },
  leaveBody: { fontSize: typography.sizes.md, lineHeight: 22 },
  leaveActions: { gap: spacing.sm, marginTop: spacing.sm },
  errorText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  errorDetail: { fontSize: typography.sizes.sm, textAlign: 'center' },
  stuckActions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  offline: {
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  offlineText: { fontSize: typography.sizes.md, textAlign: 'center' },
});
