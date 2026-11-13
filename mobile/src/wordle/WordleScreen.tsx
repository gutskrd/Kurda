import { useCallback, useEffect, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { describeError } from '../api/errors';
import { spacing, radii, typography } from '../theme/tokens';
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
  ENTER,
  MAX_ATTEMPTS,
  typeLetter,
  type Feedback,
} from './board';
import { buildShareText } from './share';
import { WordleBoard, cellSizeFor, turnMs } from './WordleBoard';
import { WordleKeyboard } from './WordleKeyboard';
import type { SearchResult } from '../dictionary/types';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { leftResults, reportGameFinished } from '../feedback/gameFinished';
import { Loading } from '../theme/Loading';
import { GameArt } from '../games/GameArt';
import { Cloth, GoldButton } from '../impostor/parts';
import { TABLE } from '../impostor/table';
import { heldDim } from '../theme/MotionParts';

type Difficulty = 'easy' | 'medium' | 'hard';
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
  /** best status seen per letter across all guesses (upgrade-only) */
  keyboard: Record<string, Feedback>;
  remainingAttempts: number;
  target: string | null;
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

interface EduEntry {
  entryId: string;
  headword: string;
  pos: string | null;
  /** whichever definition the word has; most of the lexicon has only the Kurdish one */
  definition: string | null;
}

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

const DIFFICULTY_KEY: Record<Difficulty, TranslationKey> = {
  easy: 'games.difficulty.easy',
  medium: 'games.difficulty.medium',
  hard: 'games.difficulty.hard',
};

/**
 * Kurdish Peyvok (KUR-305). Server-authoritative: the screen never holds the
 * answer — it posts guesses to #304 and renders the scored feedback. Board and
 * keyboard are derived from the returned state (pure `board.ts`); the keyboard
 * carries upgrade-only colour memory. Win/lose reveals the word with an
 * educational card (dictionary #45) and a save-to-vocabulary action (#47), plus
 * a spoiler-safe share grid.
 *
 * Peyvok is played alone, so it earns no XP, daily or practice: XP is for
 * lessons, stories and games played online with other people. The result says
 * so in one quiet line, and neither it nor the statistics show an XP figure.
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
  const [edu, setEdu] = useState<EduEntry | null>(null);
  const [savedWord, setSavedWord] = useState(false);
  // the word was found by the guess just made, on this screen: the one time the result celebrates
  const [wonNow, setWonNow] = useState(false);

  // a guess the game will not take: the board shakes as every wrong answer in the app does, and is still under Reduce Motion
  const shake = useShake();

  const loadStats = useCallback(() => {
    void client.get<WordleStats>('/wordle/stats').then((r) => r.ok && setStats(r.data));
  }, [client]);

  useEffect(() => loadStats(), [loadStats]);


  const start = async (mode: 'daily' | 'practice') => {
    // the rating box, if it came, belonged to the board this replaces
    leftResults();
    haptic('tap');
    setStarting(true);
    setNote(null);
    setDraft([]);
    setEdu(null);
    setSavedWord(false);
    setWonNow(false);
    const res = await client.post<WordleGameView>(`/wordle/${mode}`, { difficulty });
    setStarting(false);
    if (res.ok) {
      setGame(res.data);
      if (res.data.status !== 'playing') void fetchEducation(res.data.target);
    } else {
      setNote(describeError(res.error, t));
    }
  };

  const fetchEducation = useCallback(
    async (target: string | null) => {
      if (!target) return;
      const res = await client.get<SearchResult>(`/dictionary/search?q=${encodeURIComponent(target)}`);
      if (!res.ok) return;
      const hit =
        res.data.results.find((r) => r.headword.toLowerCase() === target.toLowerCase()) ?? res.data.results[0];
      if (hit)
        setEdu({
          entryId: hit.entryId,
          headword: hit.headword,
          pos: hit.pos,
          definition: hit.definitionEn ?? hit.definitionKu,
        });
    },
    [client],
  );

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
        // the word found has its moment, felt as that lands (ResultPanel); running out of tries is a gentle miss — a guess along the way is neither
        if (res.data.status === 'won') setWonNow(true);
        else haptic('wrong');
        loadStats();
        void fetchEducation(res.data.target);
        // this guess ended it — a daily reopened after it was played is not a finish
        reportGameFinished({ moment: res.data.status === 'won' ? 'won' : 'other' });
      }
    } else {
      // a rejected guess consumes no attempt — keep the draft, explain inline
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
  }, [client, game, draft, submitting, loadStats, fetchEducation, t]);

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

  const saveToVocab = () => {
    if (!edu || savedWord) return;
    setSavedWord(true); // optimistic
    void client.put(`/dictionary/entries/${edu.entryId}/save`).then((res) => {
      if (res.ok) return;
      // not saved after all — a full vocabulary says so (limits/limitCopy.ts)
      setSavedWord(false);
      setNote(describeError(res.error, t));
    });
  };

  const shareResult = () => {
    if (!game || game.status === 'playing') return;
    const text = buildShareText({
      rows: game.guesses.map((g) => g.feedback),
      solved: game.status === 'won',
      maxAttempts: MAX_ATTEMPTS,
      mode: game.mode,
      difficulty: game.difficulty,
    });
    void Share.share({ message: text }).catch(() => undefined);
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
            {/* a new game is a new board: only a row scored while it is on screen turns over */}
            <WordleBoard key={game.id} board={board} cellSize={cellSize} shake={shake.translateX} />

            {note ? <Text style={[styles.note, { color: colors.danger }]}>{note}</Text> : null}

            {finished ? (
              <ResultPanel
                game={game}
                // once the last row has turned over, so the two do not play over each other
                celebrateAfterMs={wonNow ? turnMs(game.targetLength, reduce) : null}
                edu={edu}
                savedWord={savedWord}
                onSave={saveToVocab}
                onShare={shareResult}
                onDaily={() => start('daily')}
                onPractice={() => start('practice')}
                stats={stats}
              />
            ) : null}
          </>
        )}
      </ScrollView>
      {/*
        The keyboard stays at the bottom of the screen, edge to edge, while the
        board scrolls above it: inside the scroller it moved with the board and
        lost a third of its width to the screen's margins.
      */}
      {game && !finished ? (
        <View style={[styles.keyboardDock, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <WordleKeyboard keyboard={game.keyboard} onKey={onKey} checking={submitting} />
        </View>
      ) : null}
    </GradientBackground>
  );
}

/** Win/lose result: reveal, the note that a game alone earns no XP, educational card + save, share, play again. */
function ResultPanel({
  game,
  celebrateAfterMs,
  edu,
  savedWord,
  onSave,
  onShare,
  onDaily,
  onPractice,
  stats,
}: {
  game: WordleGameView;
  /** the word was found just now: its moment plays, this long after the panel appears; null for a result that is only shown */
  celebrateAfterMs: number | null;
  edu: EduEntry | null;
  savedWord: boolean;
  onSave: () => void;
  onShare: () => void;
  onDaily: () => void;
  onPractice: () => void;
  stats: WordleStats | null;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const won = game.status === 'won';
  return (
    <View style={styles.result}>
      <GlassCard style={styles.resultCard}>
        {/* the line used to open with a party popper; the spark is the app's own, in the colour of a right answer */}
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

        {edu ? (
          <View style={[styles.edu, { backgroundColor: colors.controlTrack }]}>
            <View style={styles.eduHead}>
              <Icon name="text" size={18} color={colors.primary} />
              <Text style={[styles.eduWord, { color: colors.textPrimary }]}>{edu.headword}</Text>
              {edu.pos ? <Text style={[styles.eduPos, { color: colors.textSecondary }]}>{edu.pos}</Text> : null}
            </View>
            {edu.definition ? <Text style={[styles.eduDef, { color: colors.textSecondary }]}>{edu.definition}</Text> : null}
            <Pressable
              onPress={onSave}
              accessibilityRole="button"
              // one 20-point line, caught at a fingertip's 44
              hitSlop={SAVE_SLOP}
              style={({ pressed }) => [styles.saveRow, pressed && heldDim]}
              disabled={savedWord}
            >
              <Icon name={savedWord ? 'check' : 'star'} size={16} color={colors.primary} />
              <Text style={[styles.saveText, { color: colors.primary }]}>
                {savedWord ? t('dictionary.savedWord') : t('dictionary.saveWord')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.resultActions}>
          <ClayButton label={t('share.title')} icon="share" tone="neutral" onPress={onShare} style={{ flex: 1 }} />
          <GoldButton label={t('games.wordle.practice')} icon="bolt" onPress={onPractice} style={{ flex: 1 }} />
        </View>
        <ClayButton label={t('games.wordle.daily')} icon="star" tone="neutral" onPress={onDaily} style={{ alignSelf: 'stretch', marginTop: spacing.sm }} />
      </GlassCard>

      {stats ? (
        <GlassCard style={styles.statsCard}>
          <Text style={[styles.statsTitle, { color: colors.textSecondary }]}>{t('games.wordle.statistics')}</Text>
          <View style={styles.statsGrid}>
            <Stat label={t('games.wordle.stat.played')} value={String(stats.played)} />
            <Stat label={t('games.wordle.stat.winPct')} value={String(stats.winPercentage)} />
            <Stat label={t('games.wordle.stat.streak')} value={String(stats.currentStreak)} />
            <Stat label={t('games.wordle.stat.best')} value={String(stats.longestStreak)} />
            <Stat label={t('games.wordle.stat.average')} value={stats.averageGuesses ? stats.averageGuesses.toFixed(1) : '—'} />
          </View>
        </GlassCard>
      ) : null}
    </View>
  );
}

/** "Save word" is one 20-point line: this much above and below it makes a fingertip's 44. */
const SAVE_SLOP = { top: 12, bottom: 12 };

/** How big the spark's stage is: room for its ring to widen and its flecks to be thrown. */
const WIN_STAGE = 96;

/**
 * The word found, as it is found: the app's one celebration (theme/celebration.ts),
 * small, on the result's own mark — the spark springs in, a ring widens once
 * behind it, a handful of flecks is thrown, and it is felt and heard once as
 * it lands. Only for a guess made here and now: a daily opened again after it
 * was solved shows the same spark and stays still. Under Reduce Motion the
 * spark fades in and nothing travels.
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
      <Text style={[styles.statValue, { color: colors.primary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  keyboardDock: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, alignItems: 'center' },
  // flex + centre so a long translated name shares the row with the back
  // button instead of wrapping over it: "Peyvok" is one word, "Peyvok
  // Battle" in some languages is three
  // the night the game opens on: its emblem acting the game out, its name, and how it is played
  stage: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  stageName: { ...display(typography.sizes.xxl), color: TABLE.ink, textAlign: 'center', marginTop: spacing.sm },
  stageLine: { color: TABLE.inkSoft, fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center' },
  startActions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  startStats: { fontSize: typography.sizes.sm, textAlign: 'center' },
  note: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center' },
  result: { gap: spacing.md, marginTop: spacing.md },
  resultCard: { gap: spacing.sm },
  resultMark: { alignSelf: 'center' },
  // the spark's own stage while it celebrates; the flecks may fly past its edges
  winStage: { alignSelf: 'center', width: WIN_STAGE, height: WIN_STAGE / 2, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  resultTitle: { ...display(typography.sizes.xl), textAlign: 'center' },
  resultLine: { fontSize: typography.sizes.md, textAlign: 'center' },
  resultNote: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center' },
  edu: { borderRadius: radii.md, padding: spacing.md, gap: spacing.xs, marginTop: spacing.sm },
  eduHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eduWord: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  eduPos: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
  eduDef: { fontSize: typography.sizes.md, lineHeight: 20 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  saveText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  resultActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  statsCard: { gap: spacing.sm },
  statsTitle: { ...sectionLabel },
  // five figures, three and two: spaced evenly, so the two under the three sit in the middle and not at the edges
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-evenly', rowGap: spacing.md },
  stat: { width: '30%', alignItems: 'center' },
  statValue: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  statLabel: { fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
});
