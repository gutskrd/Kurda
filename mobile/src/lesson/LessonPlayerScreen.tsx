import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { feedbackKind, nextLaunch, praiseFor, practisableMistakes, typedHint, type ResumeMemory, type TypedHint } from '@kurda/shared';
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
import { ConversationExercise } from './components/ConversationExercise';
import { FeedbackFooter } from './components/FeedbackFooter';
import { knownVoice, type CharacterReaction } from '../characters/SpeakingCharacter';
import { conversationCast } from '../characters/ConversationStage';
import { LessonResults } from './components/LessonResults';
import { ListeningExercise } from './components/ListeningExercise';
import { MatchPairsExercise } from './components/MatchPairsExercise';
import { MultipleChoiceExercise } from './components/MultipleChoiceExercise';
import { ProgressBar } from './components/ProgressBar';
import { SpeakingExercise } from './components/SpeakingExercise';
import { WritingExercise } from './components/WritingExercise';
import { TranslateExercise } from './components/TranslateExercise';
import { emptyMatch, type MatchState } from './match';
import { RUN_SHOWN_FROM, answerFeel, currentExercise, initPlayer, isReask, nextRun, progress, reduce, runMilestone, type Feedback, type PutAwayType } from './player';
import { NO_MOMENTS, lessonMoments, type LessonMoments, type Standing, type StreakMark } from './moments';
import { haptic } from '../feedback/haptics';
import { playSound } from '../feedback/sounds';
import { AnswerQueue } from './queue';
import type { AnswerResult, RetryResult, SelfRating, SessionResults, SessionView } from './types';
import type { ApiClient } from '../api/client';
import type { CourseMap } from '../coursemap/types';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { deviceStore } from '../keyboard/deviceStore';
import { useQuietInvites } from '../play/quietInvites';
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

/*
 * The server keeps every answer, and a lesson resumes from it; it does not keep
 * the second tries, which count for nothing. Which of those were asked is kept
 * on the phone for the session, so a lesson opened again after the app was
 * closed does not ask one twice (the shared player's `ResumeMemory`), as the
 * website keeps it for the tab. Losing it costs one extra question, never an
 * answer.
 */
const reaskedKey = (sessionId: string): string => `hevalo:reasked:${sessionId}`;

async function readReasked(sessionId: string): Promise<string[]> {
  try {
    const raw = await deviceStore.get(reaskedKey(sessionId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeReasked(sessionId: string, ids: readonly string[] | null): void {
  if (ids === null || ids.length === 0) void deviceStore.remove(reaskedKey(sessionId));
  else void deviceStore.set(reaskedKey(sessionId), JSON.stringify(ids));
}

/** Where a finished lesson can go next, given by whoever opened it. */
export interface LessonWaysOn {
  /** open another lesson in this one's place ("Next lesson") */
  onNext?: (lessonId: string) => void;
  /** practise these exercises now, in this one's place */
  onPractise?: (exerciseIds: string[]) => void;
  /** back to the lesson path */
  onPath?: () => void;
}

/**
 * The lesson player (KUR-029). Loads a session, drives the pure player
 * reducer, renders each exercise type, grades answers server-side, and
 * shows a completion summary. Answers submitted while offline are queued
 * and flushed on reconnect. The core is shared with practice mode (KUR-034)
 * via SessionPlayer.
 *
 * `courseId` is the course it was opened from, so the results can offer the
 * course's next lesson.
 */
export function LessonPlayerScreen({
  lessonId,
  courseId,
  onExit,
  ...waysOn
}: { lessonId: string; courseId?: string; onExit: () => void } & LessonWaysOn) {
  const { client } = useAuth();
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<{ view: SessionView; memory: ResumeMemory } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    void client.get<SessionView>(`/lessons/${lessonId}/session`).then(async (res) => {
      if (!active) return;
      if (!res.ok) {
        setLoadError(describeError(res.error, t));
        return;
      }
      const reasked = await readReasked(res.data.sessionId);
      if (active) setLoaded({ view: res.data, memory: { reasked } });
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
  if (!loaded) {
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
  return <SessionPlayer view={loaded.view} memory={loaded.memory} paths={LESSON_PATHS} onExit={onExit} offerReminders courseId={courseId} {...waysOn} />;
}

/** How long "No more listening in this lesson" stays, with its Undo. */
const UNDO_MS = 5000;

/**
 * The playable session core, shared by lessons and practice. Given an
 * initial view and the endpoint paths, it drives the reducer, renders
 * exercises, grades answers (with offline queueing), and shows results.
 *
 * While it is open, an invite to play waits (play/quietInvites.ts): the
 * lesson is the one thing on the screen, and the invite shows the moment the
 * learner leaves it.
 */
export function SessionPlayer({
  view,
  paths,
  onExit,
  offerReminders = false,
  kind = 'lesson',
  memory,
  courseId,
  onNext,
  onPractise,
  onPath,
}: {
  view: SessionView;
  paths: SessionPaths;
  onExit: () => void;
  /** a finished lesson may offer reminders; practice does not */
  offerReminders?: boolean;
  /** a lesson, or a practice session (which is never called a perfect lesson) */
  kind?: 'lesson' | 'practice';
  /** what this phone remembers of the session from before (`ResumeMemory`) */
  memory?: ResumeMemory;
  /** the course a lesson was opened from, for its next lesson */
  courseId?: string;
} & LessonWaysOn) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();
  const bottomInset = useScreenBottomInset(spacing.lg);
  // the way out and the bar read from the right in Soranî and Arabic, as every other screen's header does
  const dir = useDirection();
  const [state, dispatch] = useReducer(reduce, view, (v) => initPlayer(v, memory));
  const queue = useRef(new AnswerQueue()).current;
  // right answers in a row (shared `nextRun`), which the chime climbs with, the banner names from the third and the bar warms for
  const run = useRef(0);
  const [inARow, setInARow] = useState(0);
  /*
   * How the verdict on screen is met: the run's milestone it reached, if it
   * did, and whether it was the first answer given this time — when Hevalo
   * comes in to react where nobody else is on screen.
   */
  const answers = useRef(0);
  const [reacting, setReacting] = useState<{ milestone: number | null; first: boolean }>({ milestone: null, first: false });
  // the last Kurdish praise said, so the next right answer is told something else
  const praised = useRef<string | null>(null);
  const [praise, setPraise] = useState<string | null>(null);
  useQuietInvites(true);

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
  // streak, today's goal and the league as they stood when it opened
  const before = useRef<Standing | null>(null);
  const [moments, setMoments] = useState<LessonMoments>(NO_MOMENTS);
  // where a finished lesson can go next: the course's next lesson, and whether today's goal is met
  const [next, setNext] = useState<{ lessonId: string; title: string } | null>(null);
  const [goalDone, setGoalDone] = useState(false);
  // "no more listening in this lesson", said with its Undo for a few seconds after it was asked for
  const [awayAt, setAwayAt] = useState<number | null>(null);

  // the second tries asked so far, kept on the phone until the lesson is finished
  useEffect(() => {
    if (kind === 'lesson') writeReasked(view.sessionId, state.status === 'finished' ? null : state.reasked);
  }, [kind, view.sessionId, state.reasked, state.status]);

  useEffect(() => {
    if (awayAt === null) return;
    const id = setTimeout(() => setAwayAt(null), UNDO_MS);
    return () => clearTimeout(id);
  }, [awayAt]);

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
      case 'conversation':
        // the question after it is chosen as a multiple-choice answer is
        return { type: 'conversation' as const, choice };
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
      case 'conversation':
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
  // things stand, for what else this lesson did (a goal met, a new level, the
  // league), and read the course again for the lesson that comes next
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
      const outcome = { kind, accuracy: res.data.accuracy, skipped: state.skipped.length };
      void readStanding(client).then(({ standing }) => {
        setMoments(lessonMoments(before.current, standing, streakNow, outcome));
        setGoalDone(standing?.goalCompleted === true);
      });
      if (kind === 'lesson' && courseId && onNext) {
        void client.get<CourseMap>(`/courses/${courseId}/map`).then((map) => {
          if (map.ok) setNext(nextLaunch(map.data, view.lessonId));
        });
      }
    });
    // once as the session finishes, and again on a retry
  }, [state.status, results, client, view.sessionId, paths, completeAttempt]);

  // what was typed, so the feedback can set it beside the right answer
  const given =
    draft?.type === 'translate' || draft?.type === 'listening' || draft?.type === 'writing' ? draft.text.trim() : undefined;
  const reask = isReask(state);
  // how the answer on screen was graded, for the exercise to answer back with
  const verdict = state.feedback ? (state.feedback.accepted ? 'right' : 'wrong') : null;

  /*
   * A verdict arriving: felt and heard (`feelAnswer`), the run counted on, and
   * what it is met with decided — a run's milestone, Hevalo on the first
   * answer, a word of Kurdish praise for a right one.
   */
  const heard = (feedback: Pick<Feedback, 'exerciseType' | 'accepted' | 'verdict'>): void => {
    feelAnswer(feedback, run);
    setInARow(run.current);
    const right = feedbackKind(feedback) === 'correct';
    setReacting({ milestone: right ? runMilestone(run.current) : null, first: answers.current === 0 });
    answers.current += 1;
    const word = right ? praiseFor(ex?.dialect ?? view.dialect, { index: state.index, run: run.current, previous: praised.current }) : null;
    if (word) praised.current = word;
    setPraise(word);
  };

  /** "Can't listen now" / "Can't speak now": this one, and every one of its kind still to come in the lesson. */
  const putOff = (type: PutAwayType): void => {
    dispatch({ type: 'SKIP', all: type });
    setAwayAt(Date.now());
  };

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
        heard({ exerciseType: ex.type, accepted: res.data.accepted, verdict: res.data.verdict });
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
      heard({ exerciseType: ex.type, accepted: res.data.accepted, verdict: res.data.verdict });
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
      heard({ exerciseType: ex?.type, accepted: last.accepted, verdict: last.verdict });
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
          next={next}
          goalDone={goalDone}
          practise={practisableMistakes(results.mistakes ?? [], state.exercises)}
          onDone={onExit}
          onNext={onNext}
          onPractise={onPractise}
          onPath={onPath}
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

  /*
   * Somebody on screen already reacts to the verdict when the exercise has its
   * own character on a stage (a listening clip's, a speaking model's, the
   * question's, a conversation's) — or the banner's own, beside "Hear it".
   * Otherwise Hevalo comes in: on the first answer, at every miss (curious,
   * never sad) and at a run's milestone — not at every right answer, so the
   * moment keeps its value. A spoken answer is the learner's own rating, and
   * is left to them.
   */
  const staged =
    (ex?.type === 'listening' && knownVoice(ex.audioVoice) !== null) ||
    ((ex?.type === 'speaking' || ex?.type === 'multiple_choice') && !!ex.modelAudioUrl && knownVoice(ex.modelAudioVoice) !== null) ||
    (ex?.type === 'conversation' && conversationCast(ex.speakers ?? []) !== null);
  const fb = state.feedback;
  const standIn: CharacterReaction | null =
    !fb || staged || fb.exerciseType === 'speaking'
      ? null
      : !fb.accepted
        ? 'hmm'
        : reacting.first || reacting.milestone !== null
          ? 'cheer'
          : null;
  // what kind of slip a typed answer was, when it was one thing (shared `typedHint`)
  const typed = fb?.exerciseType === 'translate' || fb?.exerciseType === 'writing' || fb?.exerciseType === 'listening';
  const hint =
    fb && typed && fb.verdict !== 'correct' && fb.given !== undefined && fb.correction
      ? hintWords(typedHint(fb.given, fb.correction, ex?.dialect ?? view.dialect), t)
      : null;
  const putOffLink =
    (ex?.type === 'listening' || ex?.type === 'speaking') && state.status === 'answering'
      ? { label: t(ex.type === 'listening' ? 'lesson.listen.skip' : 'lesson.speak.skip'), onPress: () => putOff(ex.type as PutAwayType) }
      : null;

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
            <ProgressBar value={progress(state)} warm={inARow >= RUN_SHOWN_FROM} />
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
        {ex?.type === 'conversation' ? (
          // a fresh one for each step, so a conversation still playing stops
          // rather than following into the next one
          <ConversationExercise
            key={state.index}
            exercise={ex}
            choice={choice}
            onSelect={setChoice}
            dialect={view.dialect}
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
          // a fresh one for each step, so each clip plays by itself as its exercise appears
          <ListeningExercise
            key={state.index}
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
            milestone={reacting.milestone}
            staged={staged}
            standIn={standIn}
            dialect={ex?.dialect ?? view.dialect}
            hint={hint}
            praise={praise}
            onWhy={view.grammarMd && ex?.type !== 'speaking' ? () => setShowTips(true) : undefined}
            putOff={putOffLink}
            putAway={
              awayAt !== null && state.putAway
                ? {
                    label: t(state.putAway.type === 'listening' ? 'lesson.skipAll.listening' : 'lesson.skipAll.speaking'),
                    onUndo: () => {
                      dispatch({ type: 'UNSKIP' });
                      setAwayAt(null);
                    },
                  }
                : null
            }
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
 * in a row (`run`, counted per lesson by the shared `nextRun`); a miss starts
 * the run again, and a spoken answer — the learner's own rating — leaves it
 * where it was.
 */
function feelAnswer(feedback: Pick<Feedback, 'exerciseType' | 'accepted'>, run: { current: number }): void {
  const feel = answerFeel(feedback.exerciseType, feedback.accepted);
  if (feel) haptic(feel);
  if (feel === 'correct') playSound('correct', run.current);
  else if (feel === 'wrong') playSound('wrong');
  run.current = nextRun(run.current, feedback);
}

/** A typed miss's kind of slip in words: "Only the marks differ: e → ê". */
function hintWords(hint: TypedHint | null, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string | null {
  if (!hint) return null;
  switch (hint.kind) {
    case 'marks':
    case 'lookalike':
      return t(hint.kind === 'marks' ? 'lesson.hint.marks' : 'lesson.hint.lookalike', { pairs: hint.pairs.map(pairText).join(', ') });
    case 'order':
      return t('lesson.hint.order');
    case 'missing':
      return t('lesson.hint.missing', { word: hint.word });
    case 'extra':
      return t('lesson.hint.extra', { word: hint.word });
  }
}

/**
 * "e → ê": the letter written, and the one it should be. The arrow follows the
 * letters' own script, so it points from the one to the other however the
 * line around it runs: Soranî's letters read from the right.
 */
function pairText([from, to]: [string, string]): string {
  return ARABIC_SCRIPT.test(to) ? `${from} ← ${to}` : `${from} → ${to}`;
}

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

interface DailyGoalReply {
  completed?: boolean;
  earnedXp?: number;
  goal?: number;
  effectiveGoal?: number;
}

interface LeagueReply {
  mode?: 'league' | 'personal';
  optedOut?: boolean;
  joined?: boolean;
  tier?: string | null;
  rank?: number;
  weeklyXp?: number;
}

/**
 * `/me`, `/me/daily-goal` and `/me/league`, read together: where the learner
 * stands, for `lessonMoments`. The league counts only while the learner races
 * in one — never in their own week, never opted out.
 */
async function readStanding(client: ApiClient): Promise<{ standing: Standing | null; skipSpeaking: boolean }> {
  const [me, goal, league] = await Promise.all([
    client.get<{ user: { skipSpeaking?: boolean; level?: { level?: number; progress?: number }; streak?: StreakMark } }>('/me'),
    client.get<DailyGoalReply>('/me/daily-goal'),
    client.get<LeagueReply>('/me/league'),
  ]);
  if (!me.ok) return { standing: null, skipSpeaking: false };
  const user = me.data.user;
  const target = goal.ok ? goal.data.effectiveGoal || goal.data.goal : undefined;
  const racing = league.ok && league.data.mode === 'league' && league.data.joined === true && !league.data.optedOut ? league.data : null;
  return {
    skipSpeaking: !!user.skipSpeaking,
    standing: {
      level: typeof user.level?.level === 'number' ? user.level.level : null,
      streak: user.streak ? { current: user.streak.current, lastActiveOn: user.streak.lastActiveOn ?? null } : null,
      goalCompleted: goal.ok && typeof goal.data.completed === 'boolean' ? goal.data.completed : null,
      goal: goal.ok && typeof goal.data.earnedXp === 'number' && target ? { earned: goal.data.earnedXp, target } : null,
      league:
        racing && typeof racing.rank === 'number' && typeof racing.weeklyXp === 'number' && racing.tier
          ? { rank: racing.rank, weeklyXp: racing.weeklyXp, tier: racing.tier }
          : null,
      levelProgress: typeof user.level?.progress === 'number' ? user.level.progress : null,
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
