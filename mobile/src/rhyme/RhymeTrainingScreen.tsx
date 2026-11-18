import { useCallback, useEffect, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { describeError } from '../api/errors';
import { spacing, radii, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { display } from '../theme/fonts';
import { ClayButton, GradientBackground, Segmented } from '../theme/glass';
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
import { useDirection } from '../reports/direction';
import { useCourseDialect } from '../learn/courseDialect';
import { MissedRhymes, wordDirection, type RhymeHint } from '../wordle/WordAnswer';
import { DIALECT_NAME, RHYME_DIALECTS, isRhymeOffered, openingRhymeDialect, useRhymeOffered } from './availability';
import type { Dialect } from './matchApi';

type Quality = 'perfect' | 'near' | 'none';
type Reject = 'not-a-word' | 'is-prompt' | 'already-used' | 'no-rhyme' | 'profane' | 'inflected';

interface RhymeResult {
  accepted: boolean;
  quality: Quality;
  points: number;
  normalized: string;
  reason?: Reject;
}

interface RhymeGameView {
  id: string;
  /** The round's variety; older servers omit it, meaning Kurmancî. */
  dialect?: Dialect;
  prompt: string;
  windowMs: number;
  remainingMs: number;
  score: number;
  accepted: number;
  status: 'active' | 'ended';
  /** Once the round has ended: the rhymes left unfound, with their meanings; older servers omit it. */
  missed?: RhymeHint[] | null;
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
  // An ending doing all the rhyming (malan for baran) has no sentence of its own yet; the general one is fair.
  inflected: 'games.rhyme.reject.other',
};

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Rhyming Words training: a prompt word and a countdown; the player types real Kurdish words that rhyme, scored
 * by the server, until time runs out. Played alone, so it earns no XP (the result says so in one line), and the
 * results list the rhymes left unfound with their meanings.
 *
 * A round is in Kurmancî or Soranî, chosen at the start; the screen opens on the learner's own variety when
 * rounds are offered there (availability.ts), and a variety without rounds is marked coming soon in place of
 * Start. The prompt and rhymes are written in the round's direction, so Soranî reads right to left.
 */
export function RhymeTrainingScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const offered = useRhymeOffered();
  const course = useCourseDialect();
  // The variety the start screen opens on until one is pressed: the learner's own, where rounds are offered.
  const [picked, setPicked] = useState<Dialect | null>(null);
  const dialect = picked ?? openingRhymeDialect(offered, course, locale);
  const canStart = isRhymeOffered(offered, dialect);

  const [game, setGame] = useState<RhymeGameView | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  const [input, setInput] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState(0);
  // A refused rhyme shakes the field (theme/animate.ts; still under Reduce Motion).
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
        // The round ended on the server with this call: a finished game, though one cut short is never a moment
        // for the rating box.
        if (res.data.game.status === 'ended') reportGameFinished({ moment: 'other', gaveUp: early });
      }
    },
    [client, game],
  );

  // Countdown; when it hits zero, end the round.
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
    // The round is in this variety now, whatever availability updates arrive while it runs.
    setPicked(dialect);
    // The rating box, if it came, belonged to the round this replaces.
    leftResults();
    haptic('tap');
    setStarting(true);
    setNote(null);
    setFound([]);
    const res = await client.post<RhymeGameView>('/rhyme/training', { dialect });
    setStarting(false);
    if (res.ok) {
      setGame(res.data);
      setRemaining(res.data.remainingMs);
    } else {
      // A variety the server had no prompt for after all says so in the game's words, as a match's start does.
      setNote(res.error.code === 'EMPTY_LEXICON' ? t('games.emptyPool') : describeError(res.error, t));
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
            <Segmented<Dialect>
              options={RHYME_DIALECTS}
              value={dialect}
              onChange={(d) => {
                setPicked(d);
                setNote(null);
              }}
              labelOf={(d) => (isRhymeOffered(offered, d) ? DIALECT_NAME[d] : `${DIALECT_NAME[d]} · ${t('games.comingSoon')}`)}
              groupLabel={t('games.dialect')}
              wrap
            />
            {/* A variety with no rounds yet says so where its Start would be. */}
            {!canStart ? (
              <Text style={[styles.unoffered, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
                {t('games.rhyme.notOffered')}
              </Text>
            ) : starting ? (
              <Loading style={{ marginTop: spacing.md }} />
            ) : (
              <GoldButton label={t('games.rhyme.start')} icon="bolt" onPress={start} />
            )}
            {note ? <Text style={[styles.note, { color: colors.danger }]}>{note}</Text> : null}
          </>
        ) : finished ? (
          <>
            <Cloth style={styles.stage}>
              <GameArt game="rhyme" size={96} />
              {/* The round is over whether the clock ran out or it was ended early. */}
              <Text style={styles.stageKicker} accessibilityRole="header">
                {t('games.solo.results.title')}
              </Text>
              <Text style={styles.stageScore}>{t('games.rhyme.scoreLine', { score: game.score, count: game.accepted })}</Text>
              <Text style={styles.stageNote}>{t('games.noXpAlone')}</Text>
            </Cloth>
            <GoldButton label={t('games.playAgain')} icon="bolt" onPress={start} />
            <ClayButton label={t('common.done')} tone="neutral" onPress={onExit} style={{ alignSelf: 'stretch' }} />
            {/* What was found stays readable once the clock has stopped. */}
            {found.length > 0 ? <FoundList found={found} title={t('games.rhyme.foundList')} dialect={game.dialect} /> : null}
            {/* And what the round could also have found, each word with what it means. */}
            <MissedRhymes hints={game.missed} dialect={game.dialect ?? 'kurmanci'} />
          </>
        ) : (
          <>
            <Cloth style={[styles.promptRow, { flexDirection: dir.row }]}>
              {/* The word keeps its own direction, on the reading side under its prompt. */}
              <View style={[styles.promptCol, { alignItems: dir.rtl ? 'flex-end' : 'flex-start' }]}>
                <Text style={[styles.promptLabel, dir.text]}>{t('games.rhyme.rhymeWith')}</Text>
                <Text style={[styles.prompt, wordDirection(game.dialect)]}>{game.prompt}</Text>
              </View>
              <View style={[styles.metaCol, { alignItems: dir.rtl ? 'flex-start' : 'flex-end' }]}>
                <View style={[styles.timerChip, remaining <= 10000 && styles.timerLow]}>
                  <Text style={[styles.timer, remaining <= 10000 && styles.timerLowText]}>{clock(remaining)}</Text>
                </View>
                <Text style={styles.score}>{t('games.party.points', { count: game.score })}</Text>
              </View>
            </Cloth>

            <Animated.View style={{ transform: [{ translateX: shake.translateX }] }}>
              <View style={[styles.inputRow, { flexDirection: dir.row }]}>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
                  // The field's purpose for screen readers too, since not all read placeholders. The prompt word
                  // is on the cloth just above; repeated in the placeholder it was cut off.
                  accessibilityLabel={t('games.rhyme.yourRhyme')}
                  placeholder={t('games.rhyme.yourRhyme')}
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
                <ClayButton label={t('games.rhyme.add')} tone="primary" busy={submitting} onPress={submit} />
              </View>
            </Animated.View>
            {note ? <Text style={[styles.note, { color: note.startsWith('+') ? colors.success : colors.danger }]}>{note}</Text> : null}

            {found.length > 0 ? <FoundList found={found} title={t('games.rhyme.foundList')} dialect={game.dialect} /> : null}

            {/* Ending early is a full-height button, like the race's Give up. */}
            <ClayButton label={t('games.rhyme.endRound')} tone="neutral" onPress={() => void end(remaining > 0)} style={styles.finish} />
          </>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

/** This round's rhymes, newest first, each with its rhyme quality and score. */
function FoundList({ found, title, dialect }: { found: readonly Found[]; title: string; dialect?: Dialect }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  return (
    <View style={styles.found} accessibilityLabel={title}>
      {found.map((f, i) => (
        <View key={`${f.word}-${i}`} style={[styles.foundRow, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}>
          <Text style={[styles.foundWord, wordDirection(dialect), { color: colors.textPrimary }]}>{f.word}</Text>
          <View style={[styles.foundMeta, { flexDirection: dir.row }]}>
            {/* Perfect and near rhymes are both right, both in the ink; the word says which. */}
            <Text style={[styles.foundQuality, { color: f.quality === 'perfect' ? colors.success : colors.textSecondary }]}>
              {t(f.quality === 'perfect' ? 'games.rhyme.quality.perfect' : 'games.rhyme.quality.near')}
            </Text>
            <Text style={[styles.foundPoints, { color: colors.textSecondary }]}>+{f.points}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  // The table the game is played on: its start, the prompt word, and how the round ended.
  stage: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  stageName: { ...display(typography.sizes.xxl), color: TABLE.ink, textAlign: 'center', marginTop: spacing.sm },
  stageLine: { color: TABLE.inkSoft, fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center' },
  stageKicker: { marginTop: spacing.sm, color: TABLE.goldSoft, fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 1, textTransform: 'uppercase' },
  stageScore: { ...display(typography.sizes.xl), color: TABLE.ink, textAlign: 'center' },
  // A quiet note in the cloth's smaller writing colour.
  stageNote: { marginTop: spacing.xs, color: TABLE.inkSoft, fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center' },
  note: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center', marginTop: spacing.xs },
  unoffered: { fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center', marginTop: spacing.sm },
  promptRow: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg },
  promptCol: { flex: 1 },
  promptLabel: { color: TABLE.goldSoft, fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textTransform: 'uppercase', letterSpacing: 1 },
  prompt: { ...display(typography.sizes.xxl), color: TABLE.ink },
  metaCol: { gap: spacing.xs },
  timerChip: { borderRadius: radii.md, backgroundColor: TABLE.veil, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  // The last ten seconds: the clock turns to a warm card, told by its ground as well as its colour.
  timerLow: { backgroundColor: TABLE.goldSoft },
  timer: { color: TABLE.ink, fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  timerLowText: { color: TABLE.goldInk },
  score: { color: TABLE.inkSoft, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  inputRow: { gap: spacing.sm, alignItems: 'center' },
  // minWidth: a text field will not shrink below its own idea of a width, and pushed Add off the screen.
  input: { minHeight: MIN_TOUCH_TARGET, flex: 1, minWidth: 0, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: typography.sizes.md },
  found: { gap: spacing.xs, marginTop: spacing.sm },
  foundRow: { alignItems: 'center', justifyContent: 'space-between', borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  foundWord: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  foundMeta: { alignItems: 'center', gap: spacing.md },
  foundQuality: { fontSize: typography.sizes.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  foundPoints: { fontSize: typography.sizes.sm },
  finish: { alignSelf: 'stretch', marginTop: spacing.md },
});
