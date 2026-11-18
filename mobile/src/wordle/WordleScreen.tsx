import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { describeError } from '../api/errors';
import { useIntents } from '../api/optimistic';
import { spacing, typography } from '../theme/tokens';
import { sectionLabel, display } from '../theme/fonts';
import { ClayButton, GlassCard, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useShake } from '../theme/animate';
import { ConfettiBurst, GlowRing, SoftGlow, useCelebration } from '../theme/CelebrationParts';
import { BURST } from '../theme/celebration';
import { useCelebrationHold } from '../badges/BadgeCelebrationHost';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { ScreenHeader } from '../navigation/ScreenHeader';
import {
  backspace,
  buildBoard,
  DEL,
  DIFFICULTIES,
  DIFFICULTY_KEY,
  ENTER,
  MAX_ATTEMPTS,
  typeLetter,
  type Difficulty,
  type Feedback,
} from './board';
import { shareOut } from '../share/ShareWin';
import { wordGameShare } from '../share/winText';
import { WordleBoard, cellSizeFor, turnMs } from './WordleBoard';
import { WordleKeyboard } from './WordleKeyboard';
import { WordAnswer, type WordCard } from './WordAnswer';
import { useI18n } from '../i18n/I18nContext';
import { leftResults, reportGameFinished } from '../feedback/gameFinished';
import { Loading } from '../theme/Loading';
import { GameArt } from '../games/GameArt';
import { Cloth, GoldButton } from '../impostor/parts';
import { TABLE } from '../impostor/table';
import { useDirection } from '../reports/direction';

type GameStatus = 'playing' | 'won' | 'lost';

interface GuessRow {
  letters: string[];
  feedback: Feedback[];
}

interface WordleGameView {
  id: string;
  mode: 'daily' | 'practice';
  difficulty: Difficulty;
  status: GameStatus;
  targetLength: number;
  guesses: GuessRow[];
  /** Best status seen per letter across all guesses (upgrade-only). */
  keyboard: Record<string, Feedback>;
  remainingAttempts: number;
  target: string | null;
  /**
   * Once finished: the answer card, with its meanings in every language a word card gives and the dictionary
   * entry to save it as. Null during play.
   */
  word?: WordCard | null;
}

interface WordleStats {
  played: number;
  wins: number;
  losses: number;
  currentStreak: number;
  longestStreak: number;
  fastestMs: number | null;
  wordsLearned: number;
  winPercentage: number;
  averageGuesses: number;
}

/**
 * Kurdish Peyvok. Server-authoritative: the screen never holds the answer; it posts guesses and renders the
 * scored feedback. Board and keyboard derive from the returned state (pure `board.ts`), and the keyboard keeps
 * upgrade-only colour memory. A win or loss reveals the word with its meaning and Save to vocabulary
 * (WordAnswer.tsx), plus a spoiler-safe share grid built by the shared builder, as the web game shares.
 *
 * The meaning comes with the finished game from the word card for exactly this word, and saving goes by the game,
 * so the server saves that word and counts it once. Each difficulty has its own daily word, so the difficulty can
 * be changed on the result as well as at the start.
 *
 * Played alone, Peyvok earns no XP, daily or practice; the result says so in one line and shows no XP figure.
 */
export function WordleScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();

  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [game, setGame] = useState<WordleGameView | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState<WordleStats | null>(null);
  // Save to vocabulary on the finished game's word: on its way, and why it did not land.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Only the most recently requested game may land: a slow answer for an earlier request (another difficulty's
  // daily, or a practice word) would otherwise replace the board pressed after it.
  const asked = useRef(0);
  // The guess just made on this screen found the word: the one time the result celebrates.
  const [wonNow, setWonNow] = useState(false);

  // A guess the game refuses shakes the board like every wrong answer in the app; still under Reduce Motion.
  const shake = useShake();

  const loadStats = useCallback(() => {
    void client.get<WordleStats>('/wordle/stats').then((r) => r.ok && setStats(r.data));
  }, [client]);

  useEffect(() => loadStats(), [loadStats]);


  const start = async (mode: 'daily' | 'practice') => {
    const ask = ++asked.current;
    // The rating box, if it came, belonged to the board this replaces.
    leftResults();
    haptic('tap');
    setStarting(true);
    setNote(null);
    setDraft([]);
    setSaveError(null);
    setWonNow(false);
    const res = await client.post<WordleGameView>(`/wordle/${mode}`, { difficulty });
    if (ask !== asked.current) return;
    setStarting(false);
    if (res.ok) {
      setGame(res.data);
    } else {
      setNote(res.error.code === 'EMPTY_POOL' ? t('games.emptyPool') : describeError(res.error, t));
    }
  };

  const submit = useCallback(async () => {
    if (!game || game.status !== 'playing' || submitting) return;
    if (draft.length !== game.targetLength) {
      setNote(t('games.wordle.enterLetters', { count: game.targetLength }));
      shake.run();
      return;
    }
    setSubmitting(true);
    const res = await client.post<WordleGameView>(`/wordle/games/${game.id}/guesses`, { word: draft.join('') });
    setSubmitting(false);
    if (res.ok) {
      setGame(res.data);
      setDraft([]);
      setNote(null);
      if (res.data.status !== 'playing') {
        // A found word gets its moment as it lands (ResultPanel); running out of tries is a gentle miss, and
        // guesses along the way are neither.
        if (res.data.status === 'won') setWonNow(true);
        else haptic('wrong');
        loadStats();
        // This guess ended it; a daily reopened after it was played is not a finish.
        reportGameFinished({ moment: res.data.status === 'won' ? 'won' : 'other' });
      }
    } else {
      // A rejected guess consumes no attempt — keep the draft, explain inline.
      const code = res.error.code;
      setNote(
        code === 'NOT_A_WORD'
          ? t('games.wordle.notAWord')
          : code === 'WRONG_LENGTH'
            ? t('games.wordle.wrongLength')
            : describeError(res.error, t),
      );
      shake.run();
    }
  }, [client, game, draft, submitting, loadStats, t]);

  const onKey = useCallback(
    (key: string) => {
      if (!game || game.status !== 'playing') return;
      if (key === ENTER) {
        void submit();
      } else if (key === DEL) {
        setDraft((d) => backspace(d));
        setNote(null);
      } else {
        setDraft((d) => typeLetter(d, key, game.targetLength));
        setNote(null);
      }
    },
    [game, submit],
  );

  /**
   * Save the finished game's word to the player's vocabulary by the game rather than the entry, so the server
   * saves exactly that word and counts it once however often it is pressed.
   */
  const saving = useIntents<string, boolean>(
    async (id) => {
      const res = await client.post<{ saved: boolean }>(`/wordle/games/${id}/save`);
      if (res.ok) setGame((g) => (g && g.id === id && g.word ? { ...g, word: { ...g.word, saved: true } } : g));
      return res;
    },
    // A full vocabulary (limits/limitCopy.ts) or a network failure is shown under the button, which comes back to retry.
    { failed: (error) => setSaveError(describeError(error, t)) },
  );
  const wordSaved = !!game?.word && saving.shown(game.id, game.word.saved);
  const saveWord = () => {
    const id = game?.id;
    if (!id || !game.word?.entryId || wordSaved) return;
    haptic('tap');
    setSaveError(null);
    saving.want(id, true, false);
  };

  // The result as the grid of squares with the score above and the site's address below, as the web sends (share/winText.ts).
  const shareResult = () => {
    if (!game || game.status === 'playing') return;
    shareOut(wordGameShare(game, { practice: t('games.wordle.practice'), difficulty: t(DIFFICULTY_KEY[game.difficulty]) }));
  };

  // ---- render ----------------------------------------------------------------

  const finished = game != null && game.status !== 'playing';
  const board = game ? buildBoard(game.guesses, game.targetLength, draft, { finished }) : [];
  const cellSize = game ? cellSizeFor(game.targetLength) : 48;

  return (
    <GradientBackground>
      <ScreenHeader title={t('games.wordle.name')} onBack={onExit} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {!game ? (
          <>
            <Cloth style={styles.stage}>
              <GameArt game="peyvok" size={132} moving />
              <Text style={styles.stageName}>{t('games.wordle.name')}</Text>
              <Text style={styles.stageLine}>{t('games.wordle.rules')}</Text>
            </Cloth>
            <Segmented<Difficulty> options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} labelOf={(d) => t(DIFFICULTY_KEY[d])} />
            {starting ? (
              <Loading style={{ marginTop: spacing.lg }} />
            ) : (
              <View style={styles.startActions}>
                <GoldButton label={t('games.wordle.daily')} icon="star" onPress={() => start('daily')} />
                <ClayButton label={t('games.wordle.practice')} icon="bolt" tone="neutral" onPress={() => start('practice')} style={{ alignSelf: 'stretch' }} />
              </View>
            )}
            {note ? <Text style={[styles.note, { color: colors.danger }]}>{note}</Text> : null}
            {stats && stats.played > 0 ? (
              <Text style={[styles.startStats, { color: colors.textSecondary }]}>
                {t('games.wordle.statsLine', {
                  played: stats.played,
                  percent: stats.winPercentage,
                  streak: stats.currentStreak,
                })}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            {/* A new game is a new board: only a row scored while it is on screen turns over. */}
            <WordleBoard key={game.id} board={board} cellSize={cellSize} shake={shake.translateX} />

            {note ? <Text style={[styles.note, { color: colors.danger }]}>{note}</Text> : null}

            {finished ? (
              <ResultPanel
                game={game}
                // Once the last row has turned over, so the two do not play over each other.
                celebrateAfterMs={wonNow ? turnMs(game.targetLength, reduce) : null}
                save={
                  game.word?.entryId
                    ? { saved: wordSaved, onSave: saveWord, error: saveError }
                    : undefined
                }
                difficulty={difficulty}
                onDifficulty={setDifficulty}
                onShare={shareResult}
                onDaily={() => start('daily')}
                onPractice={() => start('practice')}
                stats={stats}
              />
            ) : null}
          </>
        )}
      </ScrollView>
      {/* The keyboard stays pinned edge to edge at the bottom while the board scrolls above it. */}
      {game && !finished ? (
        <View style={[styles.keyboardDock, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <WordleKeyboard keyboard={game.keyboard} onKey={onKey} checking={submitting} />
        </View>
      ) : null}
    </GradientBackground>
  );
}

/**
 * The win or loss result: the verdict, the no-XP note, the word with its meaning and Save, then the next word at
 * the chosen difficulty, the day's word and share.
 */
function ResultPanel({
  game,
  celebrateAfterMs,
  save,
  difficulty,
  onDifficulty,
  onShare,
  onDaily,
  onPractice,
  stats,
}: {
  game: WordleGameView;
  /** The word was just found: its moment plays this long after the panel appears; null for a result that is only shown. */
  celebrateAfterMs: number | null;
  /** Save to vocabulary, when the dictionary has the word to save it as. */
  save: React.ComponentProps<typeof WordAnswer>['save'];
  /** The difficulty the next word is played at: each one has a daily of its own. */
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  onShare: () => void;
  onDaily: () => void;
  onPractice: () => void;
  stats: WordleStats | null;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const won = game.status === 'won';
  return (
    <View style={styles.result}>
      <GlassCard>
        <View style={styles.resultCard}>
          {/* The app's own spark, in the right-answer colour. */}
          {won ? (
            celebrateAfterMs !== null ? (
              <WinMoment delayMs={celebrateAfterMs} seed={game.guesses.length} />
            ) : (
              <Icon name="sparkle" size={28} color={colors.success} style={styles.resultMark} />
            )
          ) : null}
          <Text style={[styles.resultTitle, { color: won ? colors.success : colors.danger }]}>
            {won ? t('games.wordle.solved') : t('games.wordle.outOfTries')}
          </Text>
          {won ? (
            <Text style={[styles.resultLine, { color: colors.textSecondary }]}>
              {t('games.wordle.solvedIn', { count: game.guesses.length, max: MAX_ATTEMPTS })}
            </Text>
          ) : (
            <Text style={[styles.resultLine, { color: colors.textSecondary }]}>
              {t('games.wordle.theWordWas')} <Text style={{ color: colors.textPrimary, fontWeight: typography.weights.bold }}>{(game.target ?? '').toUpperCase()}</Text>
            </Text>
          )}
          <Text style={[styles.resultNote, { color: colors.textSecondary }]}>{t('games.noXpAlone')}</Text>

          {/* Found or not, the word is the lesson: what it means, and a way to keep it. */}
          {game.target ? <WordAnswer word={game.target} meanings={game.word?.meanings} save={save} /> : null}

          {/* The next word's difficulty, as at the start: each difficulty's daily is its own word. */}
          <View style={styles.nextDifficulty}>
            <Segmented<Difficulty>
              options={DIFFICULTIES}
              value={difficulty}
              onChange={onDifficulty}
              labelOf={(d) => t(DIFFICULTY_KEY[d])}
              groupLabel={t('games.difficulty')}
            />
          </View>

          {/* Another word is the main action, in the table's gold; the day's word and Share are the two quieter options, side by side at one height. */}
          <GoldButton label={t('games.wordle.practice')} icon="bolt" onPress={onPractice} style={styles.again} />
          <View style={[styles.resultActions, { flexDirection: dir.row }]}>
            <ClayButton label={t('games.wordle.daily')} icon="star" tone="neutral" onPress={onDaily} style={styles.half} />
            <ClayButton label={t('share.title')} icon="share" tone="neutral" onPress={onShare} style={styles.half} />
          </View>
        </View>
      </GlassCard>

      {stats ? (
        <GlassCard>
          <View style={styles.statsCard}>
            <Text style={[styles.statsTitle, { color: colors.textSecondary }]}>{t('games.wordle.statistics')}</Text>
            <View style={[styles.statsGrid, { flexDirection: dir.row }]}>
              <Stat label={t('games.wordle.stat.played')} value={String(stats.played)} />
              <Stat label={t('games.wordle.stat.winPct')} value={String(stats.winPercentage)} />
              <Stat label={t('games.wordle.stat.streak')} value={String(stats.currentStreak)} />
              <Stat label={t('games.wordle.stat.best')} value={String(stats.longestStreak)} />
              <Stat label={t('games.wordle.stat.average')} value={stats.averageGuesses ? stats.averageGuesses.toFixed(1) : '—'} />
            </View>
          </View>
        </GlassCard>
      ) : null}
    </View>
  );
}

/** How big the spark's stage is: room for its ring to widen and its flecks to be thrown. */
const WIN_STAGE = 96;

/**
 * The found word's moment: the app's celebration (theme/celebration.ts), small, on the result's mark: the spark
 * springs in, a ring widens, flecks are thrown, with one haptic and sound on landing. Only for a guess made here
 * and now; a reopened solved daily shows the spark still. Under Reduce Motion the spark fades in.
 */
function WinMoment({ delayMs, seed }: { delayMs: number; seed: number }): React.JSX.Element {
  const { colors } = useTheme();
  const moment = useCelebration({ delayMs });
  useCelebrationHold(moment.playing);
  const { plan } = moment;
  const scale = plan.travel ? moment.art.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) : 1;
  const opacity = moment.art.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  return (
    <View style={styles.winStage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="peyvok-win-moment">
      <SoftGlow colour={colors.success} size={WIN_STAGE} id="peyvok-win-glow" />
      {plan.travel ? <GlowRing progress={moment.ring} colour={colors.success} size={WIN_STAGE * 0.5} /> : null}
      {plan.travel ? <ConfettiBurst progress={moment.burst} count={BURST.lesson} seed={seed} colours={[colors.success, colors.gold]} reach={WIN_STAGE} /> : null}
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <Icon name="sparkle" size={28} color={colors.success} />
      </Animated.View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      {/* A figure, not a control, so it is in the page's ink rather than violet. */}
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  keyboardDock: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, alignItems: 'center' },
  // The night the game opens on: its emblem acting the game out, its name and how it is played.
  stage: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  stageName: { ...display(typography.sizes.xxl), color: TABLE.ink, textAlign: 'center', marginTop: spacing.sm },
  stageLine: { color: TABLE.inkSoft, fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center' },
  startActions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  startStats: { fontSize: typography.sizes.sm, textAlign: 'center' },
  note: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center' },
  result: { gap: spacing.md, marginTop: spacing.md },
  // Lay out a card's contents on an inner View: a GlassCard's own style only dresses its outside.
  resultCard: { gap: spacing.sm },
  resultMark: { alignSelf: 'center' },
  // The spark's own stage while it celebrates; the flecks may fly past its edges.
  winStage: { alignSelf: 'center', width: WIN_STAGE, height: WIN_STAGE / 2, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  resultTitle: { ...display(typography.sizes.xl), textAlign: 'center' },
  resultLine: { fontSize: typography.sizes.md, textAlign: 'center' },
  resultNote: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center' },
  nextDifficulty: { marginTop: spacing.sm },
  again: { marginTop: spacing.sm },
  resultActions: { gap: spacing.sm },
  half: { flex: 1 },
  statsCard: { gap: spacing.sm },
  statsTitle: { ...sectionLabel },
  // Five figures, three and two, spaced evenly so the two under the three sit centred.
  statsGrid: { flexWrap: 'wrap', justifyContent: 'space-evenly', rowGap: spacing.md },
  stat: { width: '30%', alignItems: 'center' },
  statValue: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  statLabel: { fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
});
