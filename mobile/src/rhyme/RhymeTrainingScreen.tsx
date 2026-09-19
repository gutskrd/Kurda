import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { spacing, radii, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';

type Quality = 'perfect' | 'near' | 'none';
type Reject = 'not-a-word' | 'is-prompt' | 'already-used' | 'no-rhyme' | 'profane';

interface RhymeResult {
  accepted: boolean;
  quality: Quality;
  points: number;
  normalized: string;
  reason?: Reject;
}

interface RhymeGameView {
  id: string;
  prompt: string;
  windowMs: number;
  remainingMs: number;
  score: number;
  accepted: number;
  status: 'active' | 'ended';
  xpAwarded: number | null;
}

interface Found {
  word: string;
  quality: Quality;
  points: number;
}

const REJECT_KEY: Record<Reject, TranslationKey> = {
  'not-a-word': 'games.rhyme.reject.notAWord',
  'is-prompt': 'games.rhyme.reject.isPromptShort',
  'already-used': 'games.rhyme.reject.alreadyUsed',
  'no-rhyme': 'games.rhyme.reject.noRhyme',
  profane: 'games.rhyme.reject.profane',
};

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Rhyming Words — training (solo) screen (KUR-299). Shows a prompt word and a
 * countdown; the player types real Kurdish words that rhyme, scored server-side
 * (#298 engine). Every accepted rhyme adds to the score; when the timer runs
 * out the round ends and awards XP. Mirrors the Wordle screen's flow.
 */
export function RhymeTrainingScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

  const [game, setGame] = useState<RhymeGameView | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  const [input, setInput] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const shake = useRef(new Animated.Value(0)).current;

  const finished = game != null && (game.status === 'ended' || remaining <= 0);

  const runShake = () => {
    if (reduceMotion) return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const end = useCallback(async () => {
    if (!game) return;
    const res = await client.post<{ game: RhymeGameView }>(`/rhyme/training/${game.id}/end`);
    if (res.ok) setGame(res.data.game);
  }, [client, game]);

  // countdown; when it hits zero, end the round (awards XP)
  useEffect(() => {
    if (!game || game.status === 'ended') return;
    if (remaining <= 0) {
      void end();
      return;
    }
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1000)), 1000);
    return () => clearInterval(id);
  }, [game, remaining, end]);

  const start = async () => {
    setStarting(true);
    setNote(null);
    setFound([]);
    const res = await client.post<RhymeGameView>('/rhyme/training', { dialect: 'kurmanci' });
    setStarting(false);
    if (res.ok) {
      setGame(res.data);
      setRemaining(res.data.remainingMs);
    } else {
      setNote(describeError(res.error, t));
    }
  };

  const submit = async () => {
    const word = input.trim();
    if (!game || finished || submitting || !word) return;
    setSubmitting(true);
    const res = await client.post<{ game: RhymeGameView; result: RhymeResult }>(
      `/rhyme/training/${game.id}/guesses`,
      { word },
    );
    setSubmitting(false);
    if (!res.ok) {
      setNote(describeError(res.error, t));
      runShake();
      return;
    }
    setGame(res.data.game);
    const r = res.data.result;
    if (r.accepted) {
      setFound((f) => [{ word, quality: r.quality, points: r.points }, ...f]);
      setInput('');
      setNote(`+${r.points}`);
    } else {
      setNote(t(r.reason ? REJECT_KEY[r.reason] : 'games.rhyme.reject.other'));
      runShake();
    }
  };

  const qualityColor = (q: Quality): string => (q === 'perfect' ? colors.success : colors.gold);

  return (
    <GradientBackground>
      <ScreenHeader title={t('games.rhyme.name')} onBack={onExit} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {!game ? (
          <GlassCard style={styles.startCard}>
            <Icon name="speaker" size={44} tone="primary" />
            <Text style={[styles.startTitle, { color: colors.textPrimary }]}>{t('games.rhyme.name')}</Text>
            <Text style={[styles.startHint, { color: colors.textSecondary }]}>
              {t('games.rhyme.rules')}
            </Text>
            {starting ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
            ) : (
              <ClayButton label={t('games.rhyme.start')} icon="bolt" tone="primary" onPress={start} style={{ alignSelf: 'stretch', marginTop: spacing.lg }} />
            )}
            {note ? <Text style={[styles.note, { color: colors.danger }]}>{note}</Text> : null}
          </GlassCard>
        ) : finished ? (
          <GlassCard style={styles.resultCard}>
            <Text style={[styles.resultTitle, { color: colors.primary }]}>{t('games.rhyme.timeUpRound')}</Text>
            <Text style={[styles.resultLine, { color: colors.textSecondary }]}>
              {t('games.rhyme.scoreLine', { score: game.score, count: game.accepted })}
              {game.xpAwarded ? ` · +${game.xpAwarded} XP` : ''}
            </Text>
            <ClayButton label={t('games.playAgain')} icon="bolt" tone="primary" onPress={start} style={{ alignSelf: 'stretch', marginTop: spacing.md }} />
            <ClayButton label={t('common.done')} tone="neutral" onPress={onExit} style={{ alignSelf: 'stretch', marginTop: spacing.sm }} />
          </GlassCard>
        ) : (
          <>
            <View style={styles.promptRow}>
              <View>
                <Text style={[styles.promptLabel, { color: colors.textSecondary }]}>{t('games.rhyme.rhymeWith')}</Text>
                <Text style={[styles.prompt, { color: colors.textPrimary }]}>{game.prompt}</Text>
              </View>
              <View style={styles.metaCol}>
                <Text style={[styles.timer, { color: remaining <= 10000 ? colors.danger : colors.textPrimary }]}>{clock(remaining)}</Text>
                <Text style={[styles.score, { color: colors.primary }]}>{game.score} pts</Text>
              </View>
            </View>

            <Animated.View style={{ transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }] }}>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder, color: colors.textPrimary }]}
                  placeholder={t('games.rhyme.placeholder', { word: game.prompt })}
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={input}
                  onChangeText={(t) => {
                    setInput(t);
                    setNote(null);
                  }}
                  onSubmitEditing={submit}
                  returnKeyType="send"
                  editable={!submitting}
                />
                <ClayButton label={t('games.rhyme.add')} tone="primary" onPress={submit} style={styles.addBtn} />
              </View>
            </Animated.View>
            {note ? <Text style={[styles.note, { color: note.startsWith('+') ? colors.success : colors.danger }]}>{note}</Text> : null}

            <View style={styles.found}>
              {found.map((f, i) => (
                <View key={`${f.word}-${i}`} style={[styles.foundRow, { borderColor: colors.glassBorder }]}>
                  <Text style={[styles.foundWord, { color: colors.textPrimary }]}>{f.word}</Text>
                  <View style={styles.foundMeta}>
                    <Text style={[styles.foundQuality, { color: qualityColor(f.quality) }]}>{t(f.quality === 'perfect' ? 'games.rhyme.quality.perfect' : 'games.rhyme.quality.near')}</Text>
                    <Text style={[styles.foundPoints, { color: colors.textSecondary }]}>+{f.points}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable onPress={() => void end()} accessibilityRole="button" style={styles.finish}>
              <Text style={[styles.finishText, { color: colors.textSecondary }]}>{t('games.rhyme.endRound')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  // flex + centre so a long translated name shares the row with the back
  // button instead of wrapping over it: "Wordle" is one word, "Wordle ya
  // kurdî" is three
  startCard: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  startTitle: { ...display(typography.sizes.xl), marginTop: spacing.sm },
  startHint: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 20 },
  note: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center', marginTop: spacing.xs },
  promptRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  promptLabel: { fontSize: typography.sizes.sm, textTransform: 'uppercase', letterSpacing: 1 },
  prompt: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold },
  metaCol: { alignItems: 'flex-end' },
  timer: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  score: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: { flex: 1, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: typography.sizes.md },
  addBtn: { paddingHorizontal: spacing.lg },
  found: { gap: spacing.xs, marginTop: spacing.sm },
  foundRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  foundWord: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  foundMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  foundQuality: { fontSize: typography.sizes.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  foundPoints: { fontSize: typography.sizes.sm },
  finish: { alignItems: 'center', marginTop: spacing.lg },
  finishText: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium, textDecorationLine: 'underline' },
  resultCard: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  resultTitle: { ...display(typography.sizes.xxl) },
  resultLine: { fontSize: typography.sizes.md, textAlign: 'center' },
});
