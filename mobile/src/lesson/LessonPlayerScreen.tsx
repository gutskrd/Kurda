import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { GrammarTips } from '../grammar/GrammarTips';
import { colors, spacing, typography } from '../theme/tokens';
import { encodeAnswer } from './answers';
import { FeedbackFooter } from './components/FeedbackFooter';
import { HeartsBar } from './components/HeartsBar';
import { LessonResults } from './components/LessonResults';
import { ListeningExercise } from './components/ListeningExercise';
import { MatchPairsExercise } from './components/MatchPairsExercise';
import { MultipleChoiceExercise } from './components/MultipleChoiceExercise';
import { ProgressBar } from './components/ProgressBar';
import { SpeakingExercise } from './components/SpeakingExercise';
import { WritingExercise } from './components/WritingExercise';
import { TranslateExercise } from './components/TranslateExercise';
import { emptyMatch, type MatchState } from './match';
import {
  STARTING_HEARTS,
  currentExercise,
  initPlayer,
  outOfHearts,
  progress,
  reduce,
} from './player';
import { AnswerQueue } from './queue';
import type { AnswerResult, SessionResults, SessionView } from './types';

/** Endpoint paths for a playable session — lessons and practice differ only here. */
export interface SessionPaths {
  answers: (sessionId: string) => string;
  complete: (sessionId: string) => string;
}

const LESSON_PATHS: SessionPaths = {
  answers: (id) => `/sessions/${id}/answers`,
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
  const [view, setView] = useState<SessionView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void client.get<SessionView>(`/lessons/${lessonId}/session`).then((res) => {
      if (!active) return;
      if (res.ok) setView(res.data);
      else setLoadError(describeError(res.error).message);
    });
    return () => {
      active = false;
    };
  }, [client, lessonId]);

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Couldn’t load the lesson.</Text>
        <Text style={styles.errorDetail}>{loadError}</Text>
        <Pressable onPress={onExit} style={styles.exitButton}>
          <Text style={styles.exitText}>Back</Text>
        </Pressable>
      </View>
    );
  }
  if (!view) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
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
  const [state, dispatch] = useReducer(reduce, view, (v) => initPlayer(v));
  const queue = useRef(new AnswerQueue()).current;

  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [match, setMatch] = useState<MatchState>(emptyMatch);
  const [audioKey, setAudioKey] = useState<string | null>(null);
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
    setAudioKey(null);
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
        return { type: 'speaking' as const, audioKey };
      case 'match_pairs':
        return { type: 'match_pairs' as const, matches: match.matches };
    }
  }, [ex, choice, text, match, audioKey]);

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
        return draft.audioKey !== null;
      case 'match_pairs':
        return draft.matches.length === (ex.lefts?.length ?? 0);
    }
  }, [ex, draft]);

  const denySpeaking = useCallback(() => {
    setSkipSpeaking(true);
    void client.patch('/me', { skipSpeaking: true });
    dispatch({ type: 'SKIP' });
  }, [client]);

  // finish → complete the session and show results
  useEffect(() => {
    if (state.status !== 'finished' || results) return;
    void client.post<SessionResults>(paths.complete(view.sessionId)).then((res) => {
      if (res.ok) setResults(res.data);
    });
  }, [state.status, results, client, view.sessionId, paths]);

  const check = useCallback(async () => {
    if (!ex || !draft || submitting) return;
    setSubmitting(true);
    const body = { exerciseId: ex.id, answer: encodeAnswer(draft) };
    const res = await client.post<AnswerResult>(paths.answers(view.sessionId), body);
    setSubmitting(false);
    if (res.ok) {
      dispatch({ type: 'ANSWERED', result: res.data });
    } else if (res.error.kind === 'network') {
      queue.enqueue({ exerciseId: ex.id, answer: body.answer });
      setOffline(true);
    } else {
      setOffline(true); // surface a retry for transient server errors too
    }
  }, [ex, draft, submitting, client, view.sessionId, queue, paths]);

  const retry = useCallback(async () => {
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
      dispatch({ type: 'ANSWERED', result: last });
    }
  }, [queue, client, view.sessionId, paths]);

  if (state.status === 'finished' && results) {
    return (
      <LessonResults
        results={results}
        exercises={state.exercises}
        failed={outOfHearts(state)}
        onDone={onExit}
      />
    );
  }
  if (state.status === 'finished') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.tallying}>Tallying results…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onExit} accessibilityLabel="Quit lesson">
          <Text style={styles.quit}>✕</Text>
        </Pressable>
        <View style={styles.progressWrap}>
          <ProgressBar value={progress(state)} />
        </View>
        {view.grammarMd ? (
          <Pressable onPress={() => setShowTips(true)} accessibilityLabel="Grammar tips" hitSlop={8}>
            <Text style={styles.tips}>💡</Text>
          </Pressable>
        ) : null}
        <HeartsBar hearts={state.hearts} max={STARTING_HEARTS} />
      </View>

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
            onSetAudioKey={setAudioKey}
            onDenyPermission={denySpeaking}
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
        <Pressable onPress={retry} style={styles.offline}>
          <Text style={styles.offlineText}>
            {submitting ? 'Syncing…' : 'You’re offline — tap to retry'}
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
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  quit: { fontSize: typography.sizes.lg, color: colors.textSecondary },
  tips: { fontSize: typography.sizes.lg },
  progressWrap: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  tallying: { color: colors.textSecondary, fontSize: typography.sizes.md },
  errorText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary },
  errorDetail: { fontSize: typography.sizes.sm, color: colors.textSecondary, textAlign: 'center' },
  exitButton: { marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl },
  exitText: { color: colors.primary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  offline: {
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  offlineText: { color: colors.textSecondary, fontSize: typography.sizes.md },
});
