import { useCallback, useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { describeError } from '../api/errors';
import { spacing, radii, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { display } from '../theme/fonts';
import { ClayButton, GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { useShake } from '../theme/animate';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { leftResults, reportGameFinished } from '../feedback/gameFinished';
import { Loading } from '../theme/Loading';
import { GameArt } from '../games/GameArt';
import { Cloth, GoldButton } from '../impostor/parts';
import { TABLE } from '../impostor/table';

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
 * out the round ends and awards XP. Mirrors the Peyvok screen's flow.
 */
export function RhymeTrainingScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [game, setGame] = useState<RhymeGameView | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  const [input, setInput] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState(0);
  // a rhyme that was not accepted shakes the field (theme/animate.ts; still under Reduce Motion)
  const shake = useShake();

  const finished = game != null && (game.status === 'ended' || remaining <= 0);

  const runShake = shake.run;

  /** `early`: "End round" with time still on the clock — the player stopped, which is giving up. */
  const end = useCallback(
    async (early: boolean) => {
      if (!game) return;
      const res = await client.post<{ game: RhymeGameView }>(`/rhyme/training/${game.id}/end`);
      if (res.ok) {
        setGame(res.data.game);
        // the round ended on the server, with this call: a game finished — and
        // one cut short is never a moment for the rating box
        if (res.data.game.status === 'ended') reportGameFinished({ moment: 'other', gaveUp: early });
      }
    },
    [client, game],
  );

  // countdown; when it hits zero, end the round (awards XP)
  useEffect(() => {
    if (!game || game.status === 'ended') return;
    if (remaining <= 0) {
      void end(false);
      return;
    }
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1000)), 1000);
    return () => clearInterval(id);
  }, [game, remaining, end]);

  const start = async () => {
    // the rating box, if it came, belonged to the round this replaces
    leftResults();
    haptic('tap');
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
      haptic('error');
      runShake();
      return;
    }
    setGame(res.data.game);
    const r = res.data.result;
    haptic(r.accepted ? 'correct' : 'wrong');
    if (r.accepted) {
      setFound((f) => [{ word, quality: r.quality, points: r.points }, ...f]);
      setInput('');
      setNote(`+${r.points}`);
    } else {
      setNote(t(r.reason ? REJECT_KEY[r.reason] : 'games.rhyme.reject.other'));
      runShake();
    }
  };

  const qualityColor = (q: Quality): string => (q === 'perfect' ? colors.success : colors.goldText);

  return (
    <GradientBackground>
      <ScreenHeader title={t('games.rhyme.name')} onBack={onExit} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {!game ? (
          <>
            <Cloth style={styles.stage}>
              <GameArt game="rhyme" size={132} moving />
              <Text style={styles.stageName}>{t('games.rhyme.name')}</Text>
              <Text style={styles.stageLine}>{t('games.rhyme.rules')}</Text>
            </Cloth>
            {starting ? <Loading style={{ marginTop: spacing.md }} /> : <GoldButton label={t('games.rhyme.start')} icon="bolt" onPress={start} />}
            {note ? <Text style={[styles.note, { color: colors.danger }]}>{note}</Text> : null}
          </>
        ) : finished ? (
          <>
            <Cloth style={styles.stage}>
              <GameArt game="rhyme" size={96} />
              <Text style={styles.stageKicker} accessibilityRole="header">
                {t('games.rhyme.timeUpRound')}
              </Text>
              <Text style={styles.stageScore}>{t('games.rhyme.scoreLine', { score: game.score, count: game.accepted })}</Text>
              {game.xpAwarded ? <Text style={styles.stageEarned}>{`+${game.xpAwarded} XP`}</Text> : null}
            </Cloth>
            <GoldButton label={t('games.playAgain')} icon="bolt" onPress={start} />
            <ClayButton label={t('common.done')} tone="neutral" onPress={onExit} style={{ alignSelf: 'stretch' }} />
          </>
        ) : (
          <>
            <Cloth style={styles.promptRow}>
              <View style={styles.promptCol}>
                <Text style={styles.promptLabel}>{t('games.rhyme.rhymeWith')}</Text>
                <Text style={styles.prompt}>{game.prompt}</Text>
              </View>
              <View style={styles.metaCol}>
                <View style={[styles.timerChip, remaining <= 10000 && styles.timerLow]}>
                  <Text style={[styles.timer, remaining <= 10000 && styles.timerLowText]}>{clock(remaining)}</Text>
                </View>
                <Text style={styles.score}>{game.score} pts</Text>
              </View>
            </Cloth>

            <Animated.View style={{ transform: [{ translateX: shake.translateX }] }}>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
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
                <View key={`${f.word}-${i}`} style={[styles.foundRow, { backgroundColor: colors.controlTrack }]}>
                  <Text style={[styles.foundWord, { color: colors.textPrimary }]}>{f.word}</Text>
                  <View style={styles.foundMeta}>
                    <Text style={[styles.foundQuality, { color: qualityColor(f.quality) }]}>{t(f.quality === 'perfect' ? 'games.rhyme.quality.perfect' : 'games.rhyme.quality.near')}</Text>
                    <Text style={[styles.foundPoints, { color: colors.textSecondary }]}>+{f.points}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable onPress={() => void end(remaining > 0)} accessibilityRole="button" style={styles.finish}>
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
  // button instead of wrapping over it: "Peyvok" is one word, "Peyvok
  // Battle" in some languages is three
  // the night the game is played on: its start, the word to rhyme with, and how the round ended
  stage: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  stageName: { ...display(typography.sizes.xxl), color: TABLE.ink, textAlign: 'center', marginTop: spacing.sm },
  stageLine: { color: TABLE.inkSoft, fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center' },
  stageKicker: { marginTop: spacing.sm, color: TABLE.goldSoft, fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 1, textTransform: 'uppercase' },
  stageScore: { ...display(typography.sizes.xl), color: TABLE.ink, textAlign: 'center' },
  stageEarned: { marginTop: spacing.xs, color: TABLE.goldSoft, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  note: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center', marginTop: spacing.xs },
  promptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg },
  promptCol: { flex: 1 },
  promptLabel: { color: TABLE.goldSoft, fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textTransform: 'uppercase', letterSpacing: 1 },
  prompt: { ...display(typography.sizes.xxl), color: TABLE.ink },
  metaCol: { alignItems: 'flex-end', gap: spacing.xs },
  timerChip: { borderRadius: radii.md, backgroundColor: TABLE.veil, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  // the last ten seconds: the clock turns to a warm card, told by its ground as well as its colour
  timerLow: { backgroundColor: TABLE.goldSoft },
  timer: { color: TABLE.ink, fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  timerLowText: { color: TABLE.goldInk },
  score: { color: TABLE.inkSoft, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  // minWidth: a text field will not shrink below its own idea of a width, and pushed Add off the screen's edge
  input: { minHeight: MIN_TOUCH_TARGET, flex: 1, minWidth: 0, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: typography.sizes.md },
  addBtn: { paddingHorizontal: spacing.lg },
  found: { gap: spacing.xs, marginTop: spacing.sm },
  foundRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  foundWord: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  foundMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  foundQuality: { fontSize: typography.sizes.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  foundPoints: { fontSize: typography.sizes.sm },
  finish: { alignItems: 'center', marginTop: spacing.lg },
  finishText: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium, textDecorationLine: 'underline' },
});
