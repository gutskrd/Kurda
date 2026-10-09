import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { GrammarTips } from '../grammar/GrammarTips';
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonLines } from '../theme/Skeleton';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { encodeAnswer } from './answers';
import { FeedbackFooter } from './components/FeedbackFooter';
import { LessonResults } from './components/LessonResults';
import { ListeningExercise } from './components/ListeningExercise';
import { MatchPairsExercise } from './components/MatchPairsExercise';
import { MultipleChoiceExercise } from './components/MultipleChoiceExercise';
import { ProgressBar } from './components/ProgressBar';
import { SpeakingExercise } from './components/SpeakingExercise';
import { WritingExercise } from './components/WritingExercise';
import { TranslateExercise } from './components/TranslateExercise';
import { emptyMatch, type MatchState } from './match';
import { currentExercise, initPlayer, isReask, progress, reduce } from './player';
import { AnswerQueue } from './queue';
import type { AnswerResult, RetryResult, SelfRating, SessionResults, SessionView } from './types';
import { useI18n } from '../i18n/I18nContext';

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
  const { colors } = useTheme();
  const { t } = useI18n();
  const [view, setView] = useState<SessionView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void client.get<SessionView>(`/lessons/${lessonId}/session`).then((res) => {
      if (!active) return;
      if (res.ok) setView(res.data);
      else setLoadError(describeError(res.error, t));
    });
    return () => {
      active = false;
    };
  }, [client, lessonId]);

  if (loadError) {
    return (
      <GradientBackground>
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>{t('lesson.loadFailed')}</Text>
          <Text style={[styles.errorDetail, { color: colors.textSecondary }]}>{loadError}</Text>
          <Pressable onPress={onExit} style={styles.exitButton}>
            <Text style={[styles.exitText, { color: colors.primary }]}>{t('common.back')}</Text>
          </Pressable>
        </View>
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
  return <SessionPlayer view={view} paths={LESSON_PATHS} onExit={onExit} />;
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
}: {
  view: SessionView;
  paths: SessionPaths;
  onExit: () => void;
}) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();
  const [state, dispatch] = useReducer(reduce, view, (v) => initPlayer(v));
  const queue = useRef(new AnswerQueue()).current;

  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [match, setMatch] = useState<MatchState>(emptyMatch);
  const [recorded, setRecorded] = useState(false);
  const [selfRating, setSelfRating] = useState<SelfRating | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [offline, setOffline] = useState(false);
  const [results, setResults] = useState<SessionResults | null>(null);
  const [skipSpeaking, setSkipSpeaking] = useState(false);
  const [showTips, setShowTips] = useState(false);

  const ex = currentExercise(state);

  // learner's course-wide "skip speaking" preference (KUR-036)
  useEffect(() => {
    void client.get<{ user: { skipSpeaking?: boolean } }>('/me').then((res) => {
      if (res.ok) setSkipSpeaking(!!res.data.user.skipSpeaking);
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
    setOffline(false);
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

  // finish → complete the session and show results
  useEffect(() => {
    if (state.status !== 'finished' || results) return;
    void client.post<SessionResults>(paths.complete(view.sessionId)).then((res) => {
      if (res.ok) setResults(res.data);
    });
  }, [state.status, results, client, view.sessionId, paths]);

  // what was typed, so the feedback can set it beside the right answer
  const given =
    draft?.type === 'translate' || draft?.type === 'listening' || draft?.type === 'writing' ? draft.text.trim() : undefined;
  const reask = isReask(state);

  const check = useCallback(async () => {
    if (!ex || !draft || submitting) return;
    setSubmitting(true);
    const body = { exerciseId: ex.id, answer: encodeAnswer(draft) };
    // a second try at a miss is graded and never recorded, so it is not queued
    // for later either: offline, the learner simply tries again
    if (reask) {
      const res = await client.post<RetryResult>(paths.retry(view.sessionId), body);
      setSubmitting(false);
      if (res.ok) dispatch({ type: 'ANSWERED', result: res.data, given });
      // refused (the session ended, say): the second try counts for nothing,
      // so it is let go rather than asked over and over
      else if (res.error.kind === 'client') dispatch({ type: 'SKIP' });
      else setOffline(true);
      return;
    }
    const res = await client.post<AnswerResult>(paths.answers(view.sessionId), body);
    setSubmitting(false);
    if (res.ok) {
      dispatch({ type: 'ANSWERED', result: res.data, given });
    } else if (res.error.kind === 'network') {
      queue.enqueue({ exerciseId: ex.id, answer: body.answer });
      setOffline(true);
    } else {
      setOffline(true); // surface a retry for transient server errors too
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
      setOffline(false);
      dispatch({ type: 'ANSWERED', result: last, given });
    }
  }, [queue, client, view.sessionId, paths, check, given]);

  if (state.status === 'finished' && results) {
    return (
      <GradientBackground>
        <LessonResults results={results} exercises={state.exercises} skipped={state.skipped.length} onDone={onExit} />
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
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: topInset }]}>
          <Pressable onPress={onExit} accessibilityLabel={t('lesson.quit')}>
            <Text style={[styles.quit, { color: colors.textSecondary }]}>✕</Text>
          </Pressable>
          <View style={styles.progressWrap}>
            <ProgressBar value={progress(state)} />
          </View>
          {view.grammarMd ? (
            <Pressable onPress={() => setShowTips(true)} accessibilityLabel={t('lesson.grammarTips')} hitSlop={8}>
              <Icon name="lightbulb" size={22} color={colors.gold} />
            </Pressable>
          ) : null}
        </View>
        {reask ? <Text style={[styles.reask, { color: colors.textSecondary }]}>{t('lesson.secondTry')}</Text> : null}

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
          />
        ) : null}
        {ex?.type === 'translate' ? (
          <TranslateExercise
            exercise={ex}
            text={text}
            onChangeText={setText}
            disabled={state.status !== 'answering'}
          />
        ) : null}
        {ex?.type === 'listening' ? (
          <ListeningExercise
            exercise={ex}
            text={text}
            onChangeText={setText}
            onSkip={() => dispatch({ type: 'SKIP' })}
            disabled={state.status !== 'answering'}
          />
        ) : null}
        {ex?.type === 'writing' ? (
          <WritingExercise
            exercise={ex}
            text={text}
            onChangeText={setText}
            disabled={state.status !== 'answering'}
          />
        ) : null}
        {ex?.type === 'speaking' ? (
          <SpeakingExercise
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
          />
        ) : null}
      </ScrollView>

        {offline ? (
          <Pressable onPress={retry} style={[styles.offline, { backgroundColor: colors.controlTrack }]}>
            <Text style={[styles.offlineText, { color: colors.textSecondary }]}>
              {submitting ? t('lesson.syncing') : t('lesson.offlineRetry')}
            </Text>
          </Pressable>
        ) : (
          <FeedbackFooter
            feedback={state.feedback}
            canCheck={canCheck}
            submitting={submitting}
            onCheck={check}
            onContinue={() => dispatch({ type: 'CONTINUE' })}
          />
        )}
      </View>
    </GradientBackground>
  );
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
  quit: { fontSize: typography.sizes.lg },
  reask: { fontSize: typography.sizes.sm, paddingHorizontal: spacing.lg },
  progressWrap: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  tallying: { fontSize: typography.sizes.md },
  errorText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  errorDetail: { fontSize: typography.sizes.sm, textAlign: 'center' },
  exitButton: { marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl },
  exitText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  offline: {
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  offlineText: { fontSize: typography.sizes.md },
});
