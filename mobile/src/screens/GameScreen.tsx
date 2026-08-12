import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGameSocket } from '../game/useGameSocket';
import { useRematch } from '../game/useRematch';
import { opponentAnswered, selfResult } from '../game/reducer';
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';

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
  const { colors } = useTheme();
  const topInset = useScreenTopInset();
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
    <View style={[styles.header, { paddingTop: topInset }]}>
      <Pressable onPress={confirmForfeit} accessibilityLabel="Forfeit" hitSlop={10}>
        <Text style={[styles.forfeit, { color: colors.danger }]}>Forfeit</Text>
      </Pressable>
      <ScoreStrip state={state} />
    </View>
  );

  if (state.phase === 'connecting') {
    return <Centered><ActivityIndicator size="large" color={colors.primary} /><Text style={[styles.dim, { color: colors.textSecondary }]}>Connecting…</Text></Centered>;
  }

  if (state.phase === 'countdown') {
    return (
      <GradientBackground>
        <View style={styles.screen}>{header}
          <View style={styles.centered}><Text style={[styles.big, { color: colors.textPrimary }]}>Get ready…</Text></View>
        </View>
      </GradientBackground>
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
      <GradientBackground>
        <View style={styles.screen}>
          <View style={styles.centered}>
            {won ? <Icon name="trophy" size={56} color={colors.gold} /> : null}
            <Text style={[styles.big, { color: colors.textPrimary }]}>{won ? 'You win!' : 'Good game'}</Text>

            {!provisional && xp > 0 ? (
              <View style={styles.rewardRow}>
                <Text style={[styles.xp, { color: colors.accent }]}>+{xp} XP</Text>
                {ratingDelta !== 0 ? (
                  <Text style={[styles.rating, { color: colors.textSecondary }]}>{ratingDelta > 0 ? '+' : ''}{ratingDelta} rating</Text>
                ) : null}
              </View>
            ) : null}

            {state.results?.scores.map((s) => (
              <Text key={s.userId} style={[styles.resultLine, { color: s.userId === selfId ? colors.textPrimary : colors.textSecondary }, s.userId === selfId && styles.resultSelf]}>
                #{s.rank} {s.username} — {s.points} pts ({s.correct} correct)
              </Text>
            ))}

            {onPractice ? (
              <Pressable onPress={onPractice} style={[styles.secondary, { borderColor: colors.primary }]}>
                <Text style={[styles.secondaryText, { color: colors.primary }]}>Practice missed words</Text>
              </Pressable>
            ) : null}

            {onRematch && !provisional ? (
              waiting ? (
                <View style={styles.rematchWait}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.dim, { color: colors.textSecondary }]}>Waiting for opponent…</Text>
                </View>
              ) : expired ? (
                <Text style={[styles.dim, { color: colors.textSecondary }]}>Rematch offer expired</Text>
              ) : (
                <Pressable onPress={rematch.accept} style={[styles.primary, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.primaryText, { color: colors.textOnPrimary }]}>Rematch</Text>
                </Pressable>
              )
            ) : null}

            <Pressable onPress={onExit} style={styles.done}><Text style={[styles.doneText, { color: colors.textSecondary }]}>Done</Text></Pressable>
          </View>
        </View>
      </GradientBackground>
    );
  }

  // question or reveal
  const q = state.question;
  if (!q) return <Centered><ActivityIndicator color={colors.primary} /></Centered>;
  const remainingFrac = state.phase === 'question' ? Math.max(0, Math.min(1, (q.endsAt - now) / 10_000)) : 0;
  const revealed = state.phase === 'reveal' ? state.reveal : null;

  return (
    <GradientBackground>
      <View style={styles.screen}>
        {header}
        <View style={[styles.timerTrack, { backgroundColor: colors.glassBorder }]}>
          <View style={[styles.timerFill, { width: `${Math.round(remainingFrac * 100)}%`, backgroundColor: colors.accent }]} />
        </View>
        <Text style={[styles.progress, { color: colors.textSecondary }]}>Question {q.index + 1} / {q.total}</Text>
        <Text style={[styles.prompt, { color: colors.textPrimary }]}>{q.prompt}</Text>

        <View style={styles.options}>
          {q.options.map((opt, i) => {
            const chosen = state.myChoice === i;
            const isCorrect = revealed?.correctIndex === i;
            const isWrongChoice = revealed && chosen && revealed.correctIndex !== i;
            const bg = isCorrect ? colors.success : isWrongChoice ? colors.danger : colors.controlTrack;
            const border = isCorrect ? colors.success : isWrongChoice ? colors.danger : chosen ? colors.primary : colors.glassBorder;
            const active = chosen || isCorrect || isWrongChoice;
            return (
              <Pressable
                key={i}
                disabled={state.phase !== 'question' || state.myChoice !== null}
                onPress={() => answer(q.index, i)}
                style={[styles.option, { backgroundColor: bg, borderColor: border }]}
              >
                <Text style={[styles.optionText, { color: active ? colors.textOnPrimary : colors.textPrimary }, active && styles.optionTextActive]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.opponent, { color: colors.textSecondary }]}>
          {state.phase === 'reveal'
            ? 'Reveal'
            : opponentAnswered(state)
              ? 'Opponent answered ✓'
              : 'Opponent is thinking…'}
        </Text>
        {state.rejected ? <Text style={[styles.rejected, { color: colors.danger }]}>Too late — answer not counted</Text> : null}
      </View>
    </GradientBackground>
  );
}

function ScoreStrip({ state }: { state: ReturnType<typeof useGameSocket>['state'] }) {
  const { colors } = useTheme();
  if (state.scoreboard.length === 0) return <Text style={[styles.scoreStrip, { color: colors.textSecondary }]}>—</Text>;
  return (
    <Text style={[styles.scoreStrip, { color: colors.textSecondary }]}>
      {state.scoreboard.map((s) => `${s.username} ${s.points}`).join('   ·   ')}
    </Text>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <GradientBackground>
      <View style={styles.centered}>{children}</View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.lg, gap: spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.md },
  forfeit: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  scoreStrip: { flex: 1, textAlign: 'right', fontSize: typography.sizes.sm },
  timerTrack: { height: 8, borderRadius: radii.pill, overflow: 'hidden' },
  timerFill: { height: '100%', borderRadius: radii.pill },
  progress: { fontSize: typography.sizes.sm },
  prompt: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  options: { gap: spacing.sm },
  option: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radii.md, borderWidth: 2 },
  optionText: { fontSize: typography.sizes.md },
  optionTextActive: { fontWeight: typography.weights.bold },
  opponent: { textAlign: 'center', fontSize: typography.sizes.md, marginTop: spacing.sm },
  rejected: { textAlign: 'center', fontSize: typography.sizes.sm },
  big: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold },
  dim: {},
  resultLine: { fontSize: typography.sizes.md },
  resultSelf: { fontWeight: typography.weights.bold },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  xp: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  rating: { fontSize: typography.sizes.md },
  rematchWait: { marginTop: spacing.lg, alignItems: 'center', gap: spacing.sm },
  primary: { marginTop: spacing.lg, alignSelf: 'stretch', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.md },
  primaryText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  secondary: { marginTop: spacing.md, alignSelf: 'stretch', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.md, borderWidth: 2 },
  secondaryText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  done: { marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  doneText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
