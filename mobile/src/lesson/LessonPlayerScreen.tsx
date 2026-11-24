import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable, ReachReset } from '../theme/Pressable';
import {
  answerMarkedInPlace,
  feedbackKind,
  isSoraniDialect,
  nextLaunch,
  pairKey,
  praiseFor,
  practisableMistakes,
  reactionDelayMs,
  typedHint,
  verdictMoment,
  verdictVoice,
  type NewWord,
  type ResumeMemory,
  type SpeakerId,
  type TypedHint,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { GrammarTips } from '../grammar/GrammarTips';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonLines } from '../theme/Skeleton';
import { BottomSheet } from '../theme/BottomSheet';
import { SlideSwap } from '../theme/SlideSwap';
import { useScreenBottomInset, useScreenTopInset } from '../navigation/tabBarLayout';
import { useHardwareBack } from '../navigation/hardwareBack';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useModalSlide, useReducedMotion } from '../a11y/useReducedMotion';
import { encodeAnswer } from './answers';
import { BADGE, NewWordBadge } from './components/AskParts';
import { ExerciseSlide } from './components/ExerciseSlide';
import { FeedbackFooter } from './components/FeedbackFooter';
import { knownVoice, type CharacterReaction } from '../characters/SpeakingCharacter';
import { conversationCast } from '../characters/ConversationStage';
import { hushReactions, sayReactionLater, stopReaction } from '../characters/reactions';
import { autoplayOn } from '../feedback/autoplayPref';
import { LessonResults } from './components/LessonResults';
import { ProgressBar } from './components/ProgressBar';
import { RunLabel, RunMoment } from './components/RunCount';
import { emptyMatch, type MatchState } from './match';
import { RUN_SHOWN_FROM, answerFeel, currentExercise, initPlayer, isReask, nextRun, progress, reduce, runMilestone, type Feedback, type PutAwayType } from './player';
import { NO_MOMENTS, lessonMoments, type LessonMoments, type Standing, type StreakMark } from './moments';
import { haptic } from '../feedback/haptics';
import { playSound } from '../feedback/sounds';
import { AnswerQueue } from './queue';
import type { AnswerResult, Exercise, RetryResult, SelfRating, SessionResults, SessionView } from './types';
import type { ApiClient } from '../api/client';
import type { CourseMap } from '../coursemap/types';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import type { TranslationKey } from '../i18n/translations';
import { deviceStore } from '../keyboard/deviceStore';
import { useQuietInvites } from '../play/quietInvites';
import { useDirection } from '../reports/direction';
import { Loading } from '../theme/Loading';
import { pressedDim } from '../theme/motion';
import { PressableScale } from '../theme/MotionParts';
import { useValley } from './ValleyScope';
import { Hills } from './components/Hills';
import { lessonTitle } from './lessonTitle';
import { CARD } from './valley';

/** Endpoint paths for a playable session; lessons and practice differ only here. */
export interface SessionPaths {
  answers: (sessionId: string) => string;
  /** A second try at a missed item: graded, never recorded. */
  retry: (sessionId: string) => string;
  complete: (sessionId: string) => string;
}

const LESSON_PATHS: SessionPaths = {
  answers: (id) => `/sessions/${id}/answers`,
  retry: (id) => `/sessions/${id}/retry`,
  complete: (id) => `/sessions/${id}/complete`,
};

/*
 * The server keeps every answer for resuming but not the second tries, which count for nothing. Which were asked is
 * kept on the phone per session (the shared player's `ResumeMemory`), as the website keeps it per tab, so a reopened
 * lesson does not ask one twice. Losing it costs one extra question, never an answer.
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
interface LessonWaysOn {
  /** Opens another lesson in this one's place ("Next lesson"). */
  onNext?: (lessonId: string) => void;
  /** Practises these exercises now, in this one's place. */
  onPractise?: (exerciseIds: string[]) => void;
  /** Back to the lesson path. */
  onPath?: () => void;
}

/**
 * The lesson player: loads a session and plays it through SessionPlayer, which it shares with practice. `courseId`
 * is the course it was opened from, so the results can offer the course's next lesson.
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
  // The lesson's name from its course map: null while loading, undefined if unavailable.
  const [title, setTitle] = useState<string | null | undefined>(courseId ? null : undefined);

  useEffect(() => {
    if (!courseId) {
      setTitle(undefined);
      return;
    }
    let active = true;
    setTitle(null);
    void client.get<CourseMap>(`/courses/${encodeURIComponent(courseId)}/map`).then((res) => {
      if (active) setTitle((res.ok ? lessonTitle(res.data, lessonId) : null) ?? undefined);
    });
    return () => {
      active = false;
    };
  }, [client, courseId, lessonId]);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    void client.get<SessionView>(`/lessons/${encodeURIComponent(lessonId)}/session`).then(async (res) => {
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
  if (!loaded) return <SessionLoading onExit={onExit} />;
  return (
    <SessionPlayer view={loaded.view} memory={loaded.memory} paths={LESSON_PATHS} onExit={onExit} offerReminders courseId={courseId} title={title} {...waysOn} />
  );
}

/**
 * A lesson or practice session loading: the exercise's shape in grey under the hills, and the ✕ where the player
 * will have it. Both open as headerless full-screen modals, so this is the only way out of a slow load.
 */
export function SessionLoading({ onExit }: { onExit: () => void }): React.JSX.Element {
  return <SessionLoadingBody onExit={onExit} />;
}

function SessionLoadingBody({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const topInset = useScreenTopInset();
  const dir = useDirection();
  return (
    <GradientBackground>
      <Hills top={topInset - HILLS_ABOVE} />
      <View style={[styles.header, { flexDirection: dir.row, paddingTop: topInset }]}>
        <CloseButton label={t('common.close')} onPress={onExit} />
      </View>
      <View style={styles.loading}>
        <Skeleton width="55%" height={22} />
        <SkeletonLines count={3} />
        <Skeleton height={140} radius={radii.lg} />
      </View>
    </GradientBackground>
  );
}

/** The way out of a lesson, at the start of its bar: a round cream button reaching a fingertip round a smaller circle. */
function CloseButton({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const valley = useValley();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
    >
      <View style={[styles.round, { backgroundColor: valley.card, borderColor: valley.line }]}>
        <Icon name="close" size={16} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
}

/** How far above the lesson's bar its hills start, so the bar sits on the far ridge. */
const HILLS_ABOVE = 18;

/** How long "No more listening in this lesson" stays, with its Undo. */
const UNDO_MS = 5000;

/**
 * The playable session core shared by lessons and practice: given an initial view and endpoint paths, it drives the
 * reducer, renders exercises, grades answers (queueing them offline), and shows results. Invites wait while it is
 * open (play/quietInvites.ts).
 */
export function SessionPlayer(props: SessionPlayerProps): React.JSX.Element {
  return <SessionPlayerBody {...props} />;
}

type SessionPlayerProps = {
  view: SessionView;
  paths: SessionPaths;
  onExit: () => void;
  /** A finished lesson may offer reminders; practice does not. */
  offerReminders?: boolean;
  /** A lesson, or a practice session (never called a perfect lesson). */
  kind?: 'lesson' | 'practice';
  /** What this phone remembers of the session from before (`ResumeMemory`). */
  memory?: ResumeMemory;
  /** The course a lesson was opened from, for its next lesson. */
  courseId?: string;
  /**
   * The lesson's name, written small in red over each question. Null while still loading, with its line kept so
   * nothing moves when it arrives; absent where there is none (practice).
   */
  title?: string | null;
  /** What a finished session shows instead of a lesson's results (a jump test says whether it passed). */
  renderResults?: (results: SessionResults) => React.ReactNode;
} & LessonWaysOn;

/** The player itself, inside the lesson's valley (`SessionPlayer`). */
function SessionPlayerBody({
  view,
  paths,
  onExit,
  offerReminders = false,
  kind = 'lesson',
  memory,
  courseId,
  title,
  onNext,
  onPractise,
  onPath,
  renderResults,
}: SessionPlayerProps) {
  const { client, isGuest } = useAuth();
  const { colors } = useTheme();
  const valley = useValley();
  const { t, locale } = useI18n();
  const topInset = useScreenTopInset();
  const bottomInset = useScreenBottomInset(spacing.lg);
  // The way out and the bar mirror for right-to-left languages, like every screen's header.
  const dir = useDirection();
  const [state, dispatch] = useReducer(reduce, view, (v) => initPlayer(v, memory));
  const queue = useRef(new AnswerQueue()).current;
  // Right answers in a row (shared `nextRun`): the chime climbs with it, the banner names it from the third, and the bar warms.
  const run = useRef(0);
  const [inARow, setInARow] = useState(0);
  // How the verdict on screen is met: the run milestone it reached, if any, and whether it was the first answer given
  // this time (when Hevalo reacts where nobody else is on screen).
  const answers = useRef(0);
  const [reacting, setReacting] = useState<{ milestone: number | null; first: boolean }>({ milestone: null, first: false });
  // The run either side of the last verdict, and who stood beside it, for its reaction line.
  const verdictRun = useRef({ before: 0, after: 0 });
  const beside = useRef<{ staged: boolean; standIn: boolean }>({ staged: false, standIn: false });
  const reduceMotion = useReducedMotion();
  // The last Kurdish praise used, so the next right answer gets a different one.
  const praised = useRef<string | null>(null);
  const [praise, setPraise] = useState<string | null>(null);
  // A run milestone, shown between this exercise and the next.
  const [celebrating, setCelebrating] = useState<number | null>(null);
  useQuietInvites(true);

  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [match, setMatch] = useState<MatchState>(emptyMatch);
  const [recorded, setRecorded] = useState(false);
  const [selfRating, setSelfRating] = useState<SelfRating | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // An answer that did not get through: 'offline' (queued) or 'failed' (the server could not take it). Each says which,
  // since telling an online learner "you're offline" would blame their phone for the app's hiccup.
  const [stall, setStall] = useState<'offline' | 'failed' | null>(null);
  const [results, setResults] = useState<SessionResults | null>(null);
  const [skipSpeaking, setSkipSpeaking] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const tipsSlide = useModalSlide();
  const [leaving, setLeaving] = useState(false);
  // The finished lesson could not be totalled (offline, a server hiccup): say so with a retry, never an endless spinner.
  const [completeFailed, setCompleteFailed] = useState(false);
  const [completeAttempt, setCompleteAttempt] = useState(0);

  const ex = currentExercise(state);

  // This sitting, for the results' time: from the first exercise shown to the last answer (only this time, if resumed).
  const shownAt = useRef<number | null>(null);
  const [sitting, setSitting] = useState<{ ms: number; answers: number } | null>(null);
  useEffect(() => {
    if (ex && shownAt.current === null) shownAt.current = Date.now();
    if (state.status === 'finished' && shownAt.current !== null) {
      const from = shownAt.current;
      setSitting((was) => was ?? { ms: Date.now() - from, answers: answers.current });
    }
  }, [ex, state.status]);

  // What a finished lesson is compared with (moments.ts): level, streak, today's goal and league as they stood at the start.
  const before = useRef<Standing | null>(null);
  const [moments, setMoments] = useState<LessonMoments>(NO_MOMENTS);
  // Where a finished lesson can go next: the course's next lesson, and whether today's goal is met.
  const [next, setNext] = useState<{ lessonId: string; title: string } | null>(null);
  const [goalDone, setGoalDone] = useState(false);
  // "No more listening in this lesson", shown with its Undo for a few seconds after it was chosen.
  const [awayAt, setAwayAt] = useState<number | null>(null);
  // Listening put off: the characters' reaction lines stay quiet too, as they do through a Soranî lesson.
  const [unheard, setUnheard] = useState(false);
  const hushed = unheard || isSoraniDialect(view.dialect);
  useEffect(() => hushReactions(hushed), [hushed]);
  useEffect(() => () => hushReactions(false), []);

  // The second tries asked so far, kept on the phone until the lesson is finished.
  useEffect(() => {
    if (kind === 'lesson') writeReasked(view.sessionId, state.status === 'finished' ? null : state.reasked);
  }, [kind, view.sessionId, state.reasked, state.status]);

  useEffect(() => {
    if (awayAt === null) return;
    const id = setTimeout(() => setAwayAt(null), UNDO_MS);
    return () => clearTimeout(id);
  }, [awayAt]);

  // The learner's course-wide "skip speaking" preference, and their standing.
  useEffect(() => {
    void readStanding(client, isGuest).then(({ standing, skipSpeaking: skip }) => {
      before.current = standing;
      setSkipSpeaking(skip);
    });
  }, [client, isGuest]);

  // Speaking exercises are skipped when the learner opted out. One about to be skipped is never drawn, since it would
  // open its microphone for a frame and then slide away as if it had been asked.
  const passedOver = ex?.type === 'speaking' && skipSpeaking && state.status === 'answering';
  useEffect(() => {
    if (passedOver) dispatch({ type: 'SKIP' });
  }, [ex, passedOver]);

  // Reset the input whenever a new exercise comes on screen.
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
        // The question after it is answered like a multiple-choice item.
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
        // Recorded, heard beside the model, and rated.
        return draft.recorded && draft.selfRating !== null;
      case 'match_pairs':
        return draft.matches.length === (ex.lefts?.length ?? 0);
    }
  }, [ex, draft]);

  // Finished: complete the session and show results, then re-read the standing for what else the lesson did (a goal
  // met, a new level, the league), and the course map for the next lesson.
  useEffect(() => {
    if (state.status !== 'finished' || results) return;
    setCompleteFailed(false);
    void client.post<SessionResults>(paths.complete(view.sessionId)).then((res) => {
      if (!res.ok) {
        setCompleteFailed(true);
        return;
      }
      setResults(res.data);
      // Custom results compare no lesson moments.
      if (renderResults) return;
      const streakNow: StreakMark = { current: res.data.streak.current, lastActiveOn: res.data.streak.lastActiveOn };
      const outcome = { kind, accuracy: res.data.accuracy, skipped: state.skipped.length };
      void readStanding(client, isGuest).then(({ standing }) => {
        setMoments(lessonMoments(before.current, standing, streakNow, outcome));
        setGoalDone(standing?.goalCompleted === true);
      });
      if (kind === 'lesson' && courseId && onNext) {
        void client.get<CourseMap>(`/courses/${encodeURIComponent(courseId)}/map`).then((map) => {
          if (map.ok) setNext(nextLaunch(map.data, view.lessonId));
        });
      }
    });
    // Once as the session finishes, and again on a retry.
  }, [state.status, results, client, view.sessionId, paths, completeAttempt]);

  // What was typed, so the feedback can show it beside the right answer.
  const given =
    draft?.type === 'translate' || draft?.type === 'listening' || draft?.type === 'writing' ? draft.text.trim() : undefined;
  const reask = isReask(state);
  // How the answer on screen was graded, for the exercise to react to.
  const verdict = state.feedback ? (state.feedback.accepted ? 'right' : 'wrong') : null;
  // A picture answer is already checked where it stands; its name in the bar would be a catalogue id.
  const picture = ex?.ask === 'picture';
  const shownFeedback = useMemo(() => (state.feedback && picture ? { ...state.feedback, correction: undefined } : state.feedback), [state.feedback, picture]);
  // A miss whose right answer is an option on screen is marked there, so the bar does not say it again.
  const answerInPlace = !!ex && !!state.feedback && answerMarkedInPlace(ex, state.feedback);

  // The verdict bar rises under the exercise and takes room from it: the scroll goes to the exercise's foot, where the
  // options and the answer are, so neither the choice nor the right one is left hidden under the bar.
  const scroller = useRef<ScrollView>(null);
  const grading = state.status === 'feedback';
  const keepAnswerInView = useCallback(() => {
    if (grading) scroller.current?.scrollToEnd({ animated: !reduceMotion });
  }, [grading, reduceMotion]);

  // A verdict arriving: haptic and sound (`feelAnswer`), the run updated, and its reaction chosen: a run milestone,
  // Hevalo on the first answer, or Kurdish praise for a right one.
  const heard = (feedback: Pick<Feedback, 'exerciseType' | 'accepted' | 'verdict'>): void => {
    const before = run.current;
    feelAnswer(feedback, run);
    verdictRun.current = { before, after: run.current };
    setInARow(run.current);
    const right = feedbackKind(feedback) === 'correct';
    setReacting({ milestone: right ? runMilestone(run.current) : null, first: answers.current === 0 });
    answers.current += 1;
    const word = right ? praiseFor(ex?.dialect ?? view.dialect, { index: state.index, run: run.current, previous: praised.current }) : null;
    if (word) praised.current = word;
    setPraise(word);
  };

  /** "Can't listen now" / "Can't speak now": this exercise and every one of its kind left in the lesson. */
  const putOff = (type: PutAwayType): void => {
    dispatch({ type: 'SKIP', all: type });
    setAwayAt(Date.now());
    if (type === 'listening') setUnheard(true);
  };

  // A line from whoever stands beside the verdict (shared reactions.ts), after its own recording; going on stops it.
  useEffect(() => {
    const fb = state.feedback;
    if (!fb) return;
    const { before, after } = verdictRun.current;
    const spoken = fb.exerciseType === 'speaking';
    const said = verdictMoment({ accepted: fb.accepted, spoken, run: after, before });
    const { staged, standIn } = beside.current;
    // Beside the verdict: Hevalo at his window, the model's speaker over "Hear it", or Hevalo's portrait; else whoever is on the stage.
    const model = fb.modelAudioUrl && !staged ? knownVoice(fb.modelAudioVoice) : null;
    const by = verdictVoice({ shown: standIn ? 'hevalo' : model ? model.speaker : staged && ex ? stageSpeaker(ex) : 'hevalo', staged });
    if (!said || !by || isSoraniDialect(ex?.dialect ?? view.dialect)) return;
    // The answer's own recording, when it plays by itself, is heard first.
    const modelDue = !!fb.modelAudioUrl && !spoken && autoplayOn();
    const cancel = sayReactionLater(reactionDelayMs('verdict', reduceMotion), { moment: said, ...by }, modelDue);
    return () => {
      cancel();
      stopReaction();
    };
    // Once per verdict.
  }, [state.feedback]);

  const check = useCallback(async () => {
    if (!ex || !draft || submitting) return;
    setSubmitting(true);
    const body = { exerciseId: ex.id, answer: encodeAnswer(draft) };
    // A second try is graded and never recorded, so it is not queued either; offline, the learner simply tries again.
    if (reask) {
      const res = await client.post<RetryResult>(paths.retry(view.sessionId), body);
      setSubmitting(false);
      if (res.ok) {
        setStall(null);
        heard({ exerciseType: ex.type, accepted: res.data.accepted, verdict: res.data.verdict });
        dispatch({ type: 'ANSWERED', result: res.data, given });
      }
      // Refused (the session ended, say): the second try counts for nothing, so it is dropped rather than retried.
      else if (res.error.kind === 'client') dispatch({ type: 'SKIP' });
      else setStall(res.error.kind === 'network' ? 'offline' : 'failed');
      return;
    }
    const res = await client.post<AnswerResult>(paths.answers(view.sessionId), body);
    setSubmitting(false);
    if (res.ok) {
      // A retry that went through puts the verdict back where the retry was.
      setStall(null);
      heard({ exerciseType: ex.type, accepted: res.data.accepted, verdict: res.data.verdict });
      dispatch({ type: 'ANSWERED', result: res.data, given });
    } else if (res.error.kind === 'network') {
      queue.enqueue({ exerciseId: ex.id, answer: body.answer });
      setStall('offline');
    } else {
      setStall('failed'); // Offer a retry for transient server errors too.
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

  // Pairs graded as made (`pairOf`): the last pair submits the answer itself, once, with no Check.
  const answersItself = ex?.type === 'match_pairs' && pairKey(ex.lefts ?? [], ex.rights ?? [], ex.pairOf) !== null;
  const sentItself = useRef<number | null>(null);
  useEffect(() => {
    if (!answersItself || !canCheck || state.status !== 'answering' || sentItself.current === state.index) return;
    sentItself.current = state.index;
    void check();
  }, [answersItself, canCheck, state.status, state.index, check]);

  /** On from a verdict, via a run milestone when one was reached. */
  const goOn = (): void => {
    if (reacting.milestone !== null && celebrating === null) setCelebrating(reacting.milestone);
    else dispatch({ type: 'CONTINUE' });
  };

  /*
   * The ✕ before any answer just leaves. After that it asks once, saying how far the lesson has come and that
   * nothing is lost (answers stay on the server and the lesson resumes), so a stray tap does not end it.
   */
  const quit = () => {
    if (state.answeredCount === 0) {
      onExit();
      return;
    }
    setLeaving(true);
  };
  // Android's back acts as the ✕, asking the same once something is answered; a finished session's results leave freely.
  useHardwareBack(state.status === 'finished' ? null : quit);

  if (state.status === 'finished' && results && renderResults) return <GradientBackground>{renderResults(results)}</GradientBackground>;
  if (state.status === 'finished' && results) {
    return (
      <GradientBackground>
        <LessonResults
          results={results}
          exercises={state.exercises}
          skipped={state.skipped.length}
          // A finished lesson can be shared by its name where the map gave it; a review is practice and cannot.
          lesson={kind === 'lesson' ? { title: title ?? null } : null}
          moments={moments}
          offerReminders={offerReminders}
          next={next}
          goalDone={goalDone}
          practise={practisableMistakes(results.mistakes ?? [], state.exercises)}
          dialect={view.dialect}
          sitting={sitting}
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
          <Loading size="large" />
          <Text style={[styles.tallying, { color: colors.textSecondary }]}>{t('lesson.tallying')}</Text>
        </View>
      </GradientBackground>
    );
  }

  /*
   * Someone on screen already reacts when the exercise has its own character: the asker beside a speech bubble, a
   * speaking model on its stage, a conversation's cast, or the banner's "Hear it" speaker. Otherwise Hevalo comes in
   * on the first answer, at every miss and at run milestones, but not at every right answer, so it keeps its value. A
   * spoken answer is the learner's own rating and gets no reaction.
   */
  const staged =
    ex?.type === 'listening' ||
    ((ex?.type === 'multiple_choice' || ex?.type === 'translate') && !!ex.prompt) ||
    (ex?.type === 'writing' && !!ex.ask && !!ex.prompt) ||
    (ex?.type === 'speaking' && !!ex.modelAudioUrl && knownVoice(ex.modelAudioVoice) !== null) ||
    (ex?.type === 'conversation' && conversationCast(ex.speakers ?? []) !== null);
  const fb = state.feedback;
  // The words this question introduces, shown in the lesson name's place: in a lesson, the first time it is asked.
  const fresh: NewWord[] | null = kind === 'lesson' && !reask && ex?.newWords && ex.newWords.length > 0 ? ex.newWords : null;
  // A lesson with new words keeps the kicker line as tall as their badge, so nothing moves as it comes and goes.
  const badged = kind === 'lesson' && state.exercises.some((e) => (e.newWords?.length ?? 0) > 0);
  const standIn: CharacterReaction | null =
    !fb || staged || fb.exerciseType === 'speaking'
      ? null
      : !fb.accepted
        ? 'hmm'
        : reacting.first || reacting.milestone !== null
          ? 'cheer'
          : null;
  beside.current = { staged, standIn: standIn !== null };
  // The kind of slip a typed answer was, when it was a single one (shared `typedHint`).
  const typed = fb?.exerciseType === 'translate' || fb?.exerciseType === 'writing' || fb?.exerciseType === 'listening';
  const hint =
    fb && typed && fb.verdict !== 'correct' && fb.given !== undefined && fb.correction
      ? hintWords(typedHint(fb.given, fb.correction, ex?.dialect ?? view.dialect), t)
      : null;
  // A run long enough to be named and to warm the bar.
  const running = inARow >= RUN_SHOWN_FROM;
  const putOffLink =
    (ex?.type === 'listening' || ex?.type === 'speaking') && state.status === 'answering'
      ? { label: t(ex.type === 'listening' ? 'lesson.listen.skip' : 'lesson.speak.skip'), onPress: () => putOff(ex.type as PutAwayType) }
      : null;

  return (
    <GradientBackground>
      {/* Check rides above the keyboard while an answer is typed. */}
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* The hills behind the bar and the lesson's name, drawn first so everything sits over them. */}
        <Hills top={topInset - HILLS_ABOVE} />
        <View style={[styles.header, { flexDirection: dir.row, paddingTop: topInset }]}>
          <CloseButton label={t('lesson.quit')} onPress={quit} />
          <View style={styles.progressWrap}>
            {/* A run of right answers, named from the third over the bar it warms. */}
            {running ? <RunLabel count={inARow} end={dir.row === 'row-reverse'} /> : null}
            <ProgressBar value={progress(state)} warm={running} />
          </View>
          {view.grammarMd ? (
            <Pressable
              onPress={() => setShowTips(true)}
              accessibilityRole="button"
              accessibilityLabel={t('lesson.grammarTips')}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            >
              {/* A cream pill on the hairline, like the way out. */}
              <View style={[styles.pill, { backgroundColor: valley.card, borderColor: valley.line }]}>
                <Icon name="lightbulb" size={18} color={colors.goldText} />
              </View>
            </Pressable>
          ) : null}
        </View>
        {reask ? <Text style={[styles.reask, dir.text, { color: colors.textSecondary }]}>{t('lesson.secondTry')}</Text> : null}

      <BottomSheet visible={leaving} onClose={() => setLeaving(false)} title={t('lesson.leave.title')} testID="lesson-leave">
        <Text style={[styles.leaveBody, dir.text, { color: colors.textSecondary }]}>
          {t('lesson.leave.body', { done: formatNumber(state.answeredCount, locale), total: formatNumber(state.exercises.length, locale) })}
        </Text>
        <View style={styles.leaveActions}>
          <ClayButton label={t('lesson.leave.stay')} tone="primary" onPress={() => setLeaving(false)} />
          <ClayButton label={t('lesson.leave.go')} variant="outline" onPress={onExit} />
        </View>
      </BottomSheet>

      {view.grammarMd ? (
        <Modal visible={showTips} animationType={tipsSlide} onRequestClose={() => setShowTips(false)}>
          {/* The tips are a screen of their own over the lesson, so nothing in it caps their reach. */}
          <ReachReset>
            <GrammarTips source={view.grammarMd} onClose={() => setShowTips(false)} />
          </ReachReset>
        </Modal>
      ) : null}

      <ScrollView ref={scroller} onLayout={keepAnswerInView} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {fresh ? (
          // A new word in this question, shown in the lesson name's place in a line as tall, so nothing under it moves.
          <View style={[styles.kickerRow, styles.badged]}>
            <NewWordBadge words={fresh} />
          </View>
        ) : title !== undefined ? (
          // The lesson's name over its questions, staying put as they turn; its line is kept while it loads.
          <View style={[styles.kickerRow, badged && styles.badged]}>
            <Text style={[styles.kicker, dir.free, { color: valley.redText }]} numberOfLines={1} testID="lesson-title">
              {title ?? ' '}
            </Text>
          </View>
        ) : null}
        {/*
          Only the exercise turns, as the intro's slides do; the bar above and the footer below stay. Each step is its own
          slide, held as it leaves rather than redrawn, so it goes exactly as it stood (ExerciseSlide).
        */}
        <SlideSwap id={String(state.index)} direction="forward" mirrored={dir.rtl} held>
          {ex && !passedOver ? (
            <ExerciseSlide
              exercise={ex}
              dialect={view.dialect}
              answering={state.status === 'answering'}
              feedback={state.feedback}
              verdict={verdict}
              draft={{
                choice,
                onChoice: setChoice,
                text,
                onText: setText,
                match,
                onMatch: setMatch,
                selfRating,
                onRate: setSelfRating,
                onRecorded: setRecorded,
                onSkip: () => dispatch({ type: 'SKIP' }),
              }}
            />
          ) : null}
        </SlideSwap>
      </ScrollView>

        {stall ? (
          // It gives under the finger, so the tap is answered before the server is.
          <PressableScale
            onPress={retry}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityState={{ disabled: submitting, busy: submitting }}
            style={[styles.offline, { backgroundColor: colors.controlTrack, marginBottom: bottomInset }]}
          >
            <Text style={[styles.offlineText, { color: colors.textSecondary }]}>
              {submitting ? t('lesson.syncing') : stall === 'offline' ? t('lesson.offlineRetry') : t('lesson.failedRetry')}
            </Text>
          </PressableScale>
        ) : (
          <FeedbackFooter
            feedback={shownFeedback}
            answersItself={answersItself}
            staged={staged}
            standIn={standIn}
            answerInPlace={answerInPlace}
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
                      if (state.putAway?.type === 'listening') setUnheard(false);
                      setAwayAt(null);
                    },
                  }
                : null
            }
            canCheck={canCheck}
            submitting={submitting}
            onCheck={check}
            onContinue={goOn}
          />
        )}
        {celebrating !== null ? (
          // A run milestone, over the lesson between this exercise and the next.
          <RunMoment
            count={celebrating}
            onDone={() => {
              setCelebrating(null);
              dispatch({ type: 'CONTINUE' });
            }}
          />
        ) : null}
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

/** Something the lesson needed did not arrive (the lesson or its results), said plainly with a retry and a way out. */
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
 * The verdict's haptic and sound (`answerFeel`): crisp when right, a gentle double when not. The right-answer chime
 * climbs a step per answer in a row (`run`, via shared `nextRun`); a miss resets the run, and a spoken answer leaves
 * it unchanged.
 */
/**
 * Who stands on an exercise's own stage (PromptScene in components/SpeechBubble.tsx, the listening and speaking
 * stages): its recording's character, else Hevalo at his window; a conversation has a cast, so nobody alone.
 */
function stageSpeaker(ex: Exercise): SpeakerId | null {
  if (ex.type === 'conversation') return null;
  if (ex.type === 'translate') return 'hevalo';
  return knownVoice(ex.type === 'listening' ? ex.audioVoice : ex.modelAudioVoice)?.speaker ?? 'hevalo';
}

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

/** "e → ê": the letter written and the one expected, with the arrow following the letters' script so it points right in Soranî. */
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
 * `/me`, `/me/daily-goal` and `/me/league` read together, for `lessonMoments`. The league counts only while the
 * learner races in one. Guests are refused the league, so for them it is not requested.
 */
async function readStanding(client: ApiClient, guest = false): Promise<{ standing: Standing | null; skipSpeaking: boolean }> {
  const [me, goal, league] = await Promise.all([
    client.get<{ user: { skipSpeaking?: boolean; level?: { level?: number; progress?: number }; streak?: StreakMark } }>('/me'),
    client.get<DailyGoalReply>('/me/daily-goal'),
    guest ? Promise.resolve(null) : client.get<LeagueReply>('/me/league'),
  ]);
  if (!me.ok) return { standing: null, skipSpeaking: false };
  const user = me.data.user;
  const target = goal.ok ? goal.data.effectiveGoal || goal.data.goal : undefined;
  const racing = league?.ok && league.data.mode === 'league' && league.data.joined === true && !league.data.optedOut ? league.data : null;
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
  // Under the ✕, where the player's exercise will start.
  loading: { flex: 1, gap: spacing.lg, padding: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    // Over a run milestone, which covers the rest of the lesson.
    zIndex: 2,
    gap: spacing.sm + 4,
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  // A fingertip's reach round the 36-point circle or pill; the row's own gap does the spacing.
  headerButton: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', marginHorizontal: -spacing.xs },
  round: { width: 36, height: 36, borderRadius: radii.pill, borderWidth: CARD.edge, alignItems: 'center', justifyContent: 'center' },
  pill: { height: 36, paddingHorizontal: spacing.sm + 4, borderRadius: radii.pill, borderWidth: CARD.edge, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: pressedDim },
  reask: { fontSize: typography.sizes.text, paddingHorizontal: layout.gutter },
  progressWrap: { flex: 1 },
  body: { paddingHorizontal: layout.gutter, paddingTop: spacing.md + 6, paddingBottom: spacing.lg, flexGrow: 1 },
  // The lesson's name: small tracked capitals in red, just over the question.
  kicker: { fontSize: typography.sizes.text, lineHeight: 22, fontWeight: typography.weights.bold, letterSpacing: 1.4, textTransform: 'uppercase' },
  kickerRow: { justifyContent: 'center', marginBottom: spacing.xs },
  // The kicker's line, as tall as the "New word" badge that replaces it on some questions.
  badged: { minHeight: BADGE },
  tallying: { fontSize: typography.sizes.text },
  leaveBody: { fontSize: typography.sizes.text, lineHeight: 22 },
  leaveActions: { gap: spacing.sm, marginTop: spacing.sm },
  errorText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
  errorDetail: { fontSize: typography.sizes.text, textAlign: 'center' },
  stuckActions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  offline: {
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  offlineText: { fontSize: typography.sizes.text, textAlign: 'center' },
});
