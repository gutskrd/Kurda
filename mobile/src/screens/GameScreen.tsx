import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGameSocket } from '../game/useGameSocket';
import { useRematch } from '../game/useRematch';
import { opponentAnswered, selfResult } from '../game/reducer';
import { colors, radii, spacing, typography } from '../theme/tokens';

interface GameScreenProps {
  roomId: string;
  selfId: string;
  onExit: () => void;
  /** Jump into a freshly-created rematch room (KUR-059). */
  onRematch?: (roomId: string) => void;
  /** Bridge to review the words you missed this game (KUR-059). */
  onPractice?: () => void;
}

/** Full 1v1 match flow UI (KUR-054, results/rewards KUR-059). */
export function GameScreen({ roomId, selfId, onExit, onRematch, onPractice }: GameScreenProps) {
  const { state, answer, forfeit } = useGameSocket(roomId, selfId);
  const rematch = useRematch(roomId);
  const [now, setNow] = useState(() => Date.now());

  // navigate as soon as the rematch room is minted
  useEffect(() => {
    if (rematch.phase === 'ready' && rematch.status?.roomId) onRematch?.(rematch.status.roomId);
  }, [rematch.phase, rematch.status?.roomId, onRematch]);

  // tick while a question is open, for the timer bar
  useEffect(() => {
    if (state.phase !== 'question') return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [state.phase]);

  const confirmForfeit = () =>
    Alert.alert('Forfeit match?', 'Your opponent will win.', [
      { text: 'Keep playing', style: 'cancel' },
      { text: 'Forfeit', style: 'destructive', onPress: () => { forfeit(); onExit(); } },
    ]);

  const header = (
    <View style={styles.header}>
      <Pressable onPress={confirmForfeit} accessibilityLabel="Forfeit" hitSlop={10}>
        <Text style={styles.forfeit}>Forfeit</Text>
      </Pressable>
      <ScoreStrip state={state} />
    </View>
  );

  if (state.phase === 'connecting') {
    return <Centered><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.dim}>Connecting…</Text></Centered>;
  }

  if (state.phase === 'countdown') {
    return (
      <View style={styles.screen}>{header}
        <Centered><Text style={styles.big}>Get ready…</Text></Centered>
      </View>
    );
  }

  if (state.phase === 'results') {
    const me = selfResult(state);
    const won = me?.rank === 1;
    const provisional = state.results?.provisional ?? false;
    const xp = me?.xp ?? 0;
    const ratingDelta = me?.ratingDelta ?? 0;
    const waiting = rematch.phase === 'waiting';
    const expired = rematch.phase === 'expired';
    return (
      <View style={styles.screen}>
        <Centered>
          <Text style={styles.emoji}>{won ? '🏆' : '🤝'}</Text>
          <Text style={styles.big}>{won ? 'You win!' : 'Good game'}</Text>

          {!provisional && xp > 0 ? (
            <View style={styles.rewardRow}>
              <Text style={styles.xp}>+{xp} XP</Text>
              {ratingDelta !== 0 ? (
                <Text style={styles.rating}>{ratingDelta > 0 ? '+' : ''}{ratingDelta} rating</Text>
              ) : null}
            </View>
          ) : null}

          {state.results?.scores.map((s) => (
            <Text key={s.userId} style={[styles.resultLine, s.userId === selfId && styles.resultSelf]}>
              #{s.rank} {s.username} — {s.points} pts ({s.correct} correct)
            </Text>
          ))}

          {onPractice ? (
            <Pressable onPress={onPractice} style={styles.secondary}>
              <Text style={styles.secondaryText}>Practice missed words</Text>
            </Pressable>
          ) : null}

          {onRematch && !provisional ? (
            waiting ? (
              <View style={styles.rematchWait}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.dim}>Waiting for opponent…</Text>
              </View>
            ) : expired ? (
              <Text style={styles.dim}>Rematch offer expired</Text>
            ) : (
              <Pressable onPress={rematch.accept} style={styles.primary}>
                <Text style={styles.primaryText}>Rematch</Text>
              </Pressable>
            )
          ) : null}

          <Pressable onPress={onExit} style={styles.done}><Text style={styles.doneText}>Done</Text></Pressable>
        </Centered>
      </View>
    );
  }

  // question or reveal
  const q = state.question;
  if (!q) return <Centered><ActivityIndicator color={colors.primary} /></Centered>;
  const remainingFrac = state.phase === 'question' ? Math.max(0, Math.min(1, (q.endsAt - now) / 10_000)) : 0;
  const revealed = state.phase === 'reveal' ? state.reveal : null;

  return (
    <View style={styles.screen}>
      {header}
      <View style={styles.timerTrack}>
        <View style={[styles.timerFill, { width: `${Math.round(remainingFrac * 100)}%` }]} />
      </View>
      <Text style={styles.progress}>Question {q.index + 1} / {q.total}</Text>
      <Text style={styles.prompt}>{q.prompt}</Text>

      <View style={styles.options}>
        {q.options.map((opt, i) => {
          const chosen = state.myChoice === i;
          const isCorrect = revealed?.correctIndex === i;
          const isWrongChoice = revealed && chosen && revealed.correctIndex !== i;
          return (
            <Pressable
              key={i}
              disabled={state.phase !== 'question' || state.myChoice !== null}
              onPress={() => answer(q.index, i)}
              style={[
                styles.option,
                chosen && styles.optionChosen,
                isCorrect && styles.optionCorrect,
                isWrongChoice && styles.optionWrong,
              ]}
            >
              <Text style={[styles.optionText, (chosen || isCorrect) && styles.optionTextActive]}>{opt}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.opponent}>
        {state.phase === 'reveal'
          ? 'Reveal'
          : opponentAnswered(state)
            ? 'Opponent answered ✓'
            : 'Opponent is thinking…'}
      </Text>
      {state.rejected ? <Text style={styles.rejected}>Too late — answer not counted</Text> : null}
    </View>
  );
}

function ScoreStrip({ state }: { state: ReturnType<typeof useGameSocket>['state'] }) {
  if (state.scoreboard.length === 0) return <Text style={styles.scoreStrip}>—</Text>;
  return (
    <Text style={styles.scoreStrip}>
      {state.scoreboard.map((s) => `${s.username} ${s.points}`).join('   ·   ')}
    </Text>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.md },
  forfeit: { color: colors.danger, fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  scoreStrip: { flex: 1, textAlign: 'right', color: colors.textSecondary, fontSize: typography.sizes.sm },
  timerTrack: { height: 8, backgroundColor: colors.border, borderRadius: radii.pill, overflow: 'hidden' },
  timerFill: { height: '100%', backgroundColor: colors.accent, borderRadius: radii.pill },
  progress: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  prompt: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary },
  options: { gap: spacing.sm },
  option: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radii.md, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  optionChosen: { borderColor: colors.primary },
  optionCorrect: { borderColor: colors.success, backgroundColor: colors.success },
  optionWrong: { borderColor: colors.danger, backgroundColor: colors.danger },
  optionText: { fontSize: typography.sizes.md, color: colors.textPrimary },
  optionTextActive: { color: colors.textOnPrimary, fontWeight: typography.weights.bold },
  opponent: { textAlign: 'center', color: colors.textSecondary, fontSize: typography.sizes.md, marginTop: spacing.sm },
  rejected: { textAlign: 'center', color: colors.danger, fontSize: typography.sizes.sm },
  big: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.textPrimary },
  emoji: { fontSize: 56 },
  dim: { color: colors.textSecondary },
  resultLine: { fontSize: typography.sizes.md, color: colors.textSecondary },
  resultSelf: { color: colors.textPrimary, fontWeight: typography.weights.bold },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  xp: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.accent },
  rating: { fontSize: typography.sizes.md, color: colors.textSecondary },
  rematchWait: { marginTop: spacing.lg, alignItems: 'center', gap: spacing.sm },
  primary: { marginTop: spacing.lg, alignSelf: 'stretch', alignItems: 'center', backgroundColor: colors.primary, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.md },
  primaryText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  secondary: { marginTop: spacing.md, alignSelf: 'stretch', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.md, borderWidth: 2, borderColor: colors.primary },
  secondaryText: { color: colors.primary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  done: { marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  doneText: { color: colors.textSecondary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
