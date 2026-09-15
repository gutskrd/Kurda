import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { spacing, radii, typography } from '../theme/tokens';
import { ClayButton, GlassCard, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useScreenTopInset } from '../navigation/tabBarLayout';
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
import { WordleBoard, cellSizeFor } from './WordleBoard';
import { WordleKeyboard } from './WordleKeyboard';
import type { SearchResult } from '../dictionary/types';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';

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
  xpAwarded: number | null;
}

interface WordleStats {
  played: number;
  wins: number;
  losses: number;
  currentStreak: number;
  longestStreak: number;
  fastestMs: number | null;
  totalXp: number;
  wordsLearned: number;
  winPercentage: number;
  averageGuesses: number;
}

interface EduEntry {
  entryId: string;
  headword: string;
  pos: string | null;
  definitionEn: string | null;
}

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

const DIFFICULTY_KEY: Record<Difficulty, TranslationKey> = {
  easy: 'games.difficulty.easy',
  medium: 'games.difficulty.medium',
  hard: 'games.difficulty.hard',
};

/**
 * Kurdish Wordle (KUR-305). Server-authoritative: the screen never holds the
 * answer — it posts guesses to #304 and renders the scored feedback. Board and
 * keyboard are derived from the returned state (pure `board.ts`); the keyboard
 * carries upgrade-only colour memory. Win/lose reveals the word with an
 * educational card (dictionary #45) and a save-to-vocabulary action (#47), plus
 * a spoiler-safe share grid.
 */
export function WordleScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();
  const reduceMotion = useReducedMotion();

  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [game, setGame] = useState<WordleGameView | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState<WordleStats | null>(null);
  const [edu, setEdu] = useState<EduEntry | null>(null);
  const [savedWord, setSavedWord] = useState(false);

  const shake = useRef(new Animated.Value(0)).current;

  const loadStats = useCallback(() => {
    void client.get<WordleStats>('/wordle/stats').then((r) => r.ok && setStats(r.data));
  }, [client]);

  useEffect(() => loadStats(), [loadStats]);


  const start = async (mode: 'daily' | 'practice') => {
    setStarting(true);
    setNote(null);
    setDraft([]);
    setEdu(null);
    setSavedWord(false);
    const res = await client.post<WordleGameView>(`/wordle/${mode}`, { difficulty });
    setStarting(false);
    if (res.ok) {
      setGame(res.data);
      if (res.data.status !== 'playing') void fetchEducation(res.data.target);
    } else {
      setNote(describeError(res.error, t));
    }
  };

  const runShake = () => {
    if (reduceMotion) return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const fetchEducation = useCallback(
    async (target: string | null) => {
      if (!target) return;
      const res = await client.get<SearchResult>(`/dictionary/search?q=${encodeURIComponent(target)}`);
      if (!res.ok) return;
      const hit =
        res.data.results.find((r) => r.headword.toLowerCase() === target.toLowerCase()) ?? res.data.results[0];
      if (hit) setEdu({ entryId: hit.entryId, headword: hit.headword, pos: hit.pos, definitionEn: hit.definitionEn });
    },
    [client],
  );

  const submit = useCallback(async () => {
    if (!game || game.status !== 'playing' || submitting) return;
    if (draft.length !== game.targetLength) {
      setNote(t('games.wordle.enterLetters', { count: game.targetLength }));
      runShake();
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
        loadStats();
        void fetchEducation(res.data.target);
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
      runShake();
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
    void client.put(`/dictionary/entries/${edu.entryId}/save`);
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
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topInset }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={onExit} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={10}>
            <Icon name="chevron-left" size={22} color={colors.textSecondary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.primary }]}>{t('games.wordle.name')}</Text>
          <View style={{ width: 22 }} />
        </View>

        {!game ? (
          <GlassCard style={styles.startCard}>
            <Icon name="sparkle" size={44} tone="primary" />
            <Text style={[styles.startTitle, { color: colors.textPrimary }]}>{t('games.wordle.name')}</Text>
            <Text style={[styles.startHint, { color: colors.textSecondary }]}>
              {t('games.wordle.rules')}
            </Text>
            <View style={{ alignSelf: 'stretch', marginTop: spacing.md }}>
              <Segmented<Difficulty> options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} labelOf={(d) => t(DIFFICULTY_KEY[d])} />
            </View>
            {starting ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
            ) : (
              <View style={styles.startActions}>
                <ClayButton label={t('games.wordle.daily')} icon="star" tone="primary" onPress={() => start('daily')} style={{ alignSelf: 'stretch' }} />
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
          </GlassCard>
        ) : (
          <>
            <WordleBoard board={board} cellSize={cellSize} shake={shake} />

            {note ? <Text style={[styles.note, { color: colors.danger }]}>{note}</Text> : null}

            {finished ? (
              <ResultPanel
                game={game}
                edu={edu}
                savedWord={savedWord}
                onSave={saveToVocab}
                onShare={shareResult}
                onDaily={() => start('daily')}
                onPractice={() => start('practice')}
                stats={stats}
              />
            ) : (
              <WordleKeyboard keyboard={game.keyboard} onKey={onKey} disabled={submitting} />
            )}
          </>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

/** Win/lose result: reveal, XP, educational card + save, share, play again. */
function ResultPanel({
  game,
  edu,
  savedWord,
  onSave,
  onShare,
  onDaily,
  onPractice,
  stats,
}: {
  game: WordleGameView;
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
        <Text style={[styles.resultTitle, { color: won ? colors.success : colors.danger }]}>
          {won ? t('games.wordle.solved') : t('games.wordle.outOfTries')}
        </Text>
        {won ? (
          <Text style={[styles.resultLine, { color: colors.textSecondary }]}>
            {t('games.wordle.solvedIn', { count: game.guesses.length, max: MAX_ATTEMPTS })}
            {game.xpAwarded ? ` · +${game.xpAwarded} XP` : ''}
          </Text>
        ) : (
          <Text style={[styles.resultLine, { color: colors.textSecondary }]}>
            {t('games.wordle.theWordWas')} <Text style={{ color: colors.textPrimary, fontWeight: typography.weights.bold }}>{(game.target ?? '').toUpperCase()}</Text>
          </Text>
        )}

        {edu ? (
          <View style={[styles.edu, { borderColor: colors.glassBorder }]}>
            <View style={styles.eduHead}>
              <Icon name="book" size={18} color={colors.primary} />
              <Text style={[styles.eduWord, { color: colors.textPrimary }]}>{edu.headword}</Text>
              {edu.pos ? <Text style={[styles.eduPos, { color: colors.textSecondary }]}>{edu.pos}</Text> : null}
            </View>
            {edu.definitionEn ? <Text style={[styles.eduDef, { color: colors.textSecondary }]}>{edu.definitionEn}</Text> : null}
            <Pressable onPress={onSave} accessibilityRole="button" style={styles.saveRow} disabled={savedWord}>
              <Icon name={savedWord ? 'check' : 'star'} size={16} color={colors.primary} />
              <Text style={[styles.saveText, { color: colors.primary }]}>
                {savedWord ? t('dictionary.savedWord') : t('dictionary.saveWord')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.resultActions}>
          <ClayButton label={t('share.title')} icon="chat" tone="neutral" onPress={onShare} style={{ flex: 1 }} />
          <ClayButton label={t('games.wordle.practice')} icon="bolt" tone="primary" onPress={onPractice} style={{ flex: 1 }} />
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
            {/* XP is the app's own unit and reads the same in every language */}
            <Stat label="XP" value={String(stats.totalXp)} />
          </View>
        </GlassCard>
      ) : null}
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
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  // flex + centre so a long translated name shares the row with the back
  // button instead of wrapping over it: "Wordle" is one word, "Wordle ya
  // kurdî" is three
  title: { flex: 1, textAlign: 'center', fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  startCard: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  startTitle: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, marginTop: spacing.sm },
  startHint: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 20 },
  startActions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
  startStats: { fontSize: typography.sizes.sm, marginTop: spacing.md },
  note: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center' },
  result: { gap: spacing.md, marginTop: spacing.md },
  resultCard: { gap: spacing.sm },
  resultTitle: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, textAlign: 'center' },
  resultLine: { fontSize: typography.sizes.md, textAlign: 'center' },
  edu: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs, marginTop: spacing.sm },
  eduHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eduWord: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  eduPos: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
  eduDef: { fontSize: typography.sizes.md, lineHeight: 20 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  saveText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  resultActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  statsCard: { gap: spacing.sm },
  statsTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textTransform: 'uppercase', letterSpacing: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  stat: { width: '30%', alignItems: 'center' },
  statValue: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  statLabel: { fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
});
