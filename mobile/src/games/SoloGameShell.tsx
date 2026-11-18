import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  DIFFICULTY_LEVELS,
  GAME_DIFFICULTIES,
  isGameEmblem,
  learnGame,
  paysAlone,
  roundXpCeiling,
  type GameDialect,
  type GameDifficulty,
  type LearnGameId,
  type SoloAnswerResult,
  type SoloItemState,
  type SoloResults,
  type SoloSessionView,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { haptic } from '../feedback/haptics';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { Cloth, GoldButton } from '../impostor/parts';
import { TABLE } from '../impostor/table';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useDirection } from '../reports/direction';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { TileButton } from '../theme/Tile';
import { useTheme } from '../theme/ThemeProvider';
import { displayFont } from '../theme/fonts';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { GameArt } from './GameArt';
import { DIFFICULTY_KEY } from './partyChoices';
import { dialectNameKey } from '../i18n/dialectName';

/**
 * What every learning game played alone has around its own board (`renderRound`): the intro, the round's progress with
 * a verdict and explanation after each answer, and results that say exactly what happened, as the website's
 * games/SoloGameShell.tsx does. The round is the server's (api/src/games/solo.ts), offered again while left open.
 *
 * A game played alone earns no XP (`paysAlone`) and says so in one quiet line; a round played well still counts as a
 * day learned. The lessons' two practice exercises (`place: 'lessons'`) pay as lessons do, keep the lessons' plain
 * page, and end with another round or Done. A game's start and result are on the Games night scene with its emblem.
 */

export interface SoloRound<Item, H, C, B = unknown> {
  /**
   * The round's id: what a game's clips are played from (`hearItClipPath`), and what extra asks go to (Detective's
   * hints).
   */
  sessionId: string;
  /** What the whole round shares, as sent (Detective's case board); null for a game without one. */
  board: B | null;
  /**
   * The verdict, explanation and way on, for a game that places them beside its question (`feedbackInRound`). Null for
   * the others, which have them underneath.
   */
  feedback: ReactNode;
  item: Item;
  index: number;
  total: number;
  state: SoloItemState;
  result: SoloAnswerResult<H, C> | null;
  busy: boolean;
  submit: (answer: unknown) => Promise<void>;
  /**
   * For an item studied before it is answered (The Memory Thief): ask for what it is answered with. The changed item
   * comes back through `item`; false when the server could not be reached (the error is shown).
   */
  begin: () => Promise<boolean>;
}

interface Props<Item, H, C, B> {
  game: LearnGameId;
  dialect: GameDialect;
  title: string;
  blurb: string;
  intro?: ReactNode;
  difficulties: GameDifficulty[] | null;
  suggested?: GameDifficulty;
  open: string | null;
  renderRound: (round: SoloRound<Item, H, C, B>) => ReactNode;
  explain: (why: string) => string | null;
  onFinished?: (results: SoloResults) => void;
  resultsExtra?: ReactNode;
  /** The game puts the verdict and the way on in its own round (`SoloRound.feedback`), next to what was answered. */
  feedbackInRound?: boolean;
  onExit: () => void;
  /** Items in one round when it is not SOLO_ROUND_ITEMS: what "up to N XP" counts, for a round that pays. */
  roundItems?: number;
}

type Phase = 'intro' | 'round' | 'results';

/** The first item not yet done, or the item count when all are. */
export function nextOpen(states: readonly SoloItemState[]): number {
  const at = states.findIndex((s) => !s.done);
  return at < 0 ? states.length : at;
}

/** A stone per item: the one you are on raised, the ones done filled by how they went (the proverbs' round draws them too). */
export function Stones({ states, here, tone, night = false }: { states: readonly SoloItemState[]; here: number | null; tone: string; night?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  // On the night the stones are told apart by gold and the cloth's veil, whatever the theme.
  const track = night ? TABLE.veil : colors.controlTrack;
  return (
    <View style={[styles.stones, night && styles.stonesNight, { flexDirection: dir.row }]} aria-hidden>
      {states.map((s) => {
        const fill = s.done ? (s.correct ? tone : 'transparent') : track;
        return (
          <View
            key={s.index}
            style={[
              styles.stone,
              night && styles.stoneNight,
              { backgroundColor: fill, opacity: s.done && s.correct && !s.firstTry ? 0.55 : 1 },
              s.done && !s.correct && { borderWidth: 2, borderColor: track },
              s.index === here && styles.stoneHere,
              s.index === here && !s.done && { backgroundColor: colors.textSecondary },
            ]}
          />
        );
      })}
    </View>
  );
}

export function SoloGameShell<Item, H, C, B = unknown>({
  game,
  dialect,
  title,
  blurb,
  intro,
  difficulties,
  suggested,
  open,
  renderRound,
  explain,
  onFinished,
  resultsExtra,
  feedbackInRound = false,
  onExit,
  tone,
  roundItems,
}: Props<Item, H, C, B> & { tone: string }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  // An exercise of the lessons' practice rather than a game: its results speak of practice.
  const exercise = learnGame(game).place === 'lessons';
  // Whether a round earns XP at all: a game played alone does not, and nothing here may say it does.
  const pays = paysAlone(game);
  // A game's own picture, for its start and its result; an exercise has none.
  const emblem = !exercise && isGameEmblem(game) ? game : null;
  const dir = useDirection();
  const [phase, setPhase] = useState<Phase>('intro');
  const [difficulty, setDifficulty] = useState<GameDifficulty | null>(null);
  const [session, setSession] = useState<SoloSessionView<Item, B> | null>(null);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<SoloAnswerResult<H, C> | null>(null);
  const [results, setResults] = useState<SoloResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offered = difficulties ?? [];
  const chosen = difficulty && offered.includes(difficulty) ? difficulty : suggested && offered.includes(suggested) ? suggested : (offered[0] ?? null);

  const fail = useCallback(
    (code: string | undefined, fallback: string) => {
      if (code === 'GAME_SESSION_EXPIRED') {
        setError(t('games.solo.expired'));
        setPhase('intro');
        setSession(null);
      } else if (code === 'NOT_ENOUGH_CONTENT') setError(t('games.solo.notEnough'));
      else setError(fallback);
    },
    [t],
  );

  const begin = (view: SoloSessionView<Item, B>): void => {
    setSession(view);
    setIndex(nextOpen(view.states));
    setResult(null);
    setResults(null);
    setError(null);
    setPhase('round');
  };

  const finish = async (id: string): Promise<void> => {
    setBusy(true);
    const res = await client.post<SoloResults>(`/games/solo/sessions/${id}/finish`);
    setBusy(false);
    if (!res.ok) return fail(res.error.code, describeError(res.error, t));
    setResults(res.data);
    setPhase('results');
    if (res.data.learningCounted) haptic('celebrate');
    onFinished?.(res.data);
  };

  const start = async (): Promise<void> => {
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    const res = await client.post<SoloSessionView<Item, B>>('/games/solo/sessions', { game, dialect, difficulty: chosen });
    setBusy(false);
    if (!res.ok) return fail(res.error.code, describeError(res.error, t));
    begin(res.data);
  };

  const resume = async (): Promise<void> => {
    if (!open || busy) return;
    setBusy(true);
    const res = await client.get<SoloSessionView<Item, B> & { expired: boolean }>(`/games/solo/sessions/${open}`);
    setBusy(false);
    if (!res.ok) return fail(res.error.code, describeError(res.error, t));
    if (res.data.expired) return fail('GAME_SESSION_EXPIRED', '');
    begin(res.data);
    if (nextOpen(res.data.states) >= res.data.items.length) await finish(res.data.id);
  };

  const submit = useCallback(
    async (answer: unknown) => {
      if (!session || busy) return;
      const state = session.states[index]!;
      setBusy(true);
      const res = await client.post<SoloAnswerResult<H, C>>(`/games/solo/sessions/${session.id}/answers`, { index, answer, attempt: state.attempts + 1 });
      setBusy(false);
      if (!res.ok) return fail(res.error.code, describeError(res.error, t));
      const r = res.data;
      setResult(r);
      haptic(r.correct ? 'correct' : 'wrong');
      setSession((s) =>
        s ? { ...s, states: s.states.map((st) => (st.index === index ? { index, attempts: r.attempt, correct: r.correct, firstTry: r.firstTry, done: r.done } : st)) } : s,
      );
    },
    [busy, client, fail, index, session, t],
  );

  const beginItem = useCallback(async (): Promise<boolean> => {
    if (!session) return false;
    const res = await client.post<{ item: Item }>(`/games/solo/sessions/${session.id}/begin`, { index });
    if (!res.ok) {
      fail(res.error.code, describeError(res.error, t));
      return false;
    }
    setSession((s) => (s ? { ...s, items: s.items.map((it, i) => (i === index ? res.data.item : it)) } : s));
    return true;
  }, [client, fail, index, session, t]);

  const next = (): void => {
    if (!session) return;
    const at = nextOpen(session.states);
    if (at >= session.items.length) {
      void finish(session.id);
      return;
    }
    setIndex(at);
    setResult(null);
  };

  const text = [dir.text, { color: colors.textPrimary }];
  const muted = [dir.text, styles.muted, { color: colors.textSecondary }];

  let body: ReactNode;
  if (phase === 'results' && results && session) {
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        {exercise ? (
          <>
            <Text style={[styles.title, ...text]} accessibilityRole="header">
              {t('games.solo.results.title')}
            </Text>
            <Text style={[styles.score, ...text]}>{t('games.solo.results.score', { correct: results.correct, total: results.total })}</Text>
            <Stones states={session.states} here={null} tone={tone} />
          </>
        ) : (
          <Cloth style={styles.hero}>
            {emblem ? <GameArt game={emblem} size={96} /> : null}
            <Text style={styles.heroKicker} accessibilityRole="header">
              {t('games.solo.results.title')}
            </Text>
            <Text style={styles.heroScore}>{t('games.solo.results.score', { correct: results.correct, total: results.total })}</Text>
            <Stones states={session.states} here={null} tone={TABLE.gold} night />
          </Cloth>
        )}
        <Text style={muted}>{t('games.solo.results.firstTry', { n: results.firstTry })}</Text>
        {results.learningCounted ? (
          <>
            {pays ? <Text style={[dir.text, styles.xp, { color: colors.goldText }]}>{t('games.solo.results.xp', { xp: results.xp })}</Text> : null}
            <Text style={muted}>{t('games.solo.results.streak')}</Text>
            {pays && results.items.some((i) => i.correct && i.repeat) ? <Text style={muted}>{t('games.solo.results.repeat')}</Text> : null}
          </>
        ) : (
          <Text style={[...text, styles.honest]}>
            {t(pays ? 'games.solo.results.noXp' : 'games.solo.results.notCounted', { needed: results.needed, correct: results.firstTry })}
          </Text>
        )}
        {/* Said once, quietly, so nobody waits for XP that is not coming. */}
        {pays ? null : <Text style={muted}>{t('games.noXpAlone')}</Text>}
        {resultsExtra}
        {error ? <Text style={[dir.text, { color: colors.danger }]}>{error}</Text> : null}
        <View style={styles.actions}>
          {exercise ? (
            <TileButton label={t('practice.exercise.again')} onPress={() => void start()} busy={busy} disabled={!chosen} />
          ) : (
            <GoldButton label={t('games.solo.playAgain')} onPress={() => void start()} busy={busy} disabled={!chosen} />
          )}
          {/* The quieter way out: green is for a right answer, and this is no answer. */}
          <ClayButton label={t(exercise ? 'common.done' : 'games.solo.backToGames')} onPress={onExit} tone="neutral" size="large" />
        </View>
      </ScrollView>
    );
  } else if (phase === 'round' && session) {
    const item = session.items[Math.min(index, session.items.length - 1)]!;
    const state = session.states[Math.min(index, session.states.length - 1)]!;
    const last = session.states.every((s) => s.done || s.index === index);
    const why = result?.done && result.why ? explain(result.why) : null;
    const verdict = result
      ? result.correct
        ? t(result.firstTry ? 'games.solo.rightFirstTry' : 'games.solo.right')
        : result.done
          ? t('games.solo.answerWas')
          : t('games.solo.notYet')
      : null;
    const feedback = verdict ? (
      <View
        accessibilityLiveRegion="polite"
        style={[styles.feedback, { backgroundColor: result?.correct ? colors.successFill : result?.done ? colors.dangerFill : colors.controlTrack }]}
      >
        <View style={[styles.verdictRow, { flexDirection: dir.row }]}>
          {result?.correct ? <Icon name="check" size={18} color={colors.success} /> : null}
          <Text style={[styles.verdict, ...text]}>{verdict}</Text>
        </View>
        {why ? (
          <Text style={[...text, styles.why]}>
            <Text style={styles.whyLabel}>{t('games.solo.why')} </Text>
            {why}
          </Text>
        ) : null}
        {result?.done ? <TileButton label={last ? t('games.solo.seeResults') : t('games.solo.next')} onPress={next} busy={busy} /> : null}
      </View>
    ) : null;
    const round = { sessionId: session.id, board: session.board ?? null, item, index, total: session.items.length, state, result, busy, submit, begin: beginItem };
    body = (
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.bar, { flexDirection: dir.row }]}>
          <Stones states={session.states} here={index} tone={tone} />
          <Text style={[styles.count, { color: colors.textSecondary }]} accessibilityLabel={t('games.solo.progress', { n: index + 1, total: session.items.length })}>
            {t('games.solo.progress', { n: index + 1, total: session.items.length })}
          </Text>
        </View>
        {renderRound({ ...round, feedback: feedbackInRound ? feedback : null })}
        {feedbackInRound ? null : feedback}
        {error ? <Text style={[dir.text, { color: colors.danger }]}>{error}</Text> : null}
      </ScrollView>
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        {exercise ? (
          <>
            <Text style={[styles.title, ...text]} accessibilityRole="header">
              {title}
            </Text>
            <Text style={[...text, styles.blurb]}>{blurb}</Text>
            <Text style={muted}>{t('games.solo.variety', { variety: t(dialectNameKey(dialect)) })}</Text>
          </>
        ) : (
          <Cloth style={styles.hero}>
            {emblem ? <GameArt game={emblem} size={132} moving /> : null}
            <Text style={styles.heroKicker}>{t('games.solo.variety', { variety: t(dialectNameKey(dialect)) })}</Text>
            {/* The header already has the game's name as the heading; here it is the picture's caption. */}
            <Text style={styles.heroName}>{title}</Text>
            <Text style={styles.heroLine}>{blurb}</Text>
          </Cloth>
        )}
        {intro}
        {/* A round left part-way is most likely what brought the learner back, so it is offered first. */}
        {open ? <TileButton label={t('games.solo.continue')} onPress={() => void resume()} busy={busy} /> : null}
        <Text style={[styles.legend, ...text]}>{t('games.solo.difficulty')}</Text>
        <View style={[styles.chips, { flexDirection: dir.row }]} accessibilityRole="radiogroup">
          {GAME_DIFFICULTIES.map((d) => {
            const can = offered.includes(d);
            const on = chosen === d;
            return (
              <PressableScale
                key={d}
                onPress={() => (can ? setDifficulty(d) : undefined)}
                disabled={!can}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: !can }}
                accessibilityLabel={t(DIFFICULTY_KEY[d])}
                // The chosen one is marked as every chosen chip and segment is: solid violet.
                style={[styles.chip, { backgroundColor: on ? colors.primary : colors.controlTrack, opacity: can ? 1 : 0.5 }]}
              >
                <Text style={[styles.chipText, { color: on ? colors.textOnPrimary : colors.textPrimary, fontWeight: on ? typography.weights.semibold : typography.weights.regular }]}>
                  {t(DIFFICULTY_KEY[d])}
                </Text>
              </PressableScale>
            );
          })}
        </View>
        {chosen && pays ? <Text style={muted}>{t('games.solo.upToXp', { xp: roundXpCeiling(DIFFICULTY_LEVELS[chosen], roundItems) })}</Text> : null}
        {exercise ? (
          <TileButton label={t('games.solo.start')} onPress={() => void start()} busy={busy} disabled={!chosen} />
        ) : (
          <GoldButton label={t('games.solo.start')} onPress={() => void start()} busy={busy} disabled={!chosen} />
        )}
        {/* None of the three can be chosen: "try another one" would point to a choice that is not there. */}
        {difficulties !== null && offered.length === 0 ? <Text style={muted}>{t('games.solo.noneYet')}</Text> : null}
        {error ? <Text style={[dir.text, { color: colors.danger }]}>{error}</Text> : null}
      </ScrollView>
    );
  }

  return (
    <GradientBackground>
      <ScreenHeader title={title} onBack={onExit} leading={phase === 'round' ? 'close' : 'back'} backLabel={phase === 'round' ? t('games.solo.exit') : undefined} />
      {body}
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing.md, paddingBottom: spacing.xl * 2, gap: spacing.md },
  title: { fontFamily: displayFont, fontSize: typography.sizes.xl, fontWeight: typography.displayWeight },
  blurb: { fontSize: typography.sizes.md, lineHeight: 24 },
  muted: { fontSize: typography.sizes.sm },
  legend: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, marginTop: spacing.sm },
  chips: { flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, borderRadius: radii.pill, justifyContent: 'center' },
  chipText: { fontSize: typography.sizes.sm },
  bar: { alignItems: 'center', gap: spacing.sm },
  stones: { flex: 1, gap: 6 },
  stonesNight: { flex: 0, alignSelf: 'stretch', justifyContent: 'center', marginTop: spacing.sm },
  stone: { flex: 1, maxWidth: 44, height: 8, borderRadius: radii.pill },
  stoneNight: { height: 10 },
  hero: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  heroKicker: { marginTop: spacing.sm, color: TABLE.goldSoft, fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 1, textTransform: 'uppercase' },
  heroName: { color: TABLE.ink, fontFamily: displayFont, fontSize: typography.sizes.xxl, fontWeight: typography.displayWeight, textAlign: 'center' },
  heroLine: { color: TABLE.inkSoft, fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center' },
  heroScore: { color: TABLE.ink, fontFamily: displayFont, fontSize: typography.sizes.xxl + 8, fontWeight: typography.displayWeight, textAlign: 'center' },
  stoneHere: { transform: [{ scaleY: 1.5 }] },
  count: { fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
  feedback: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  verdictRow: { alignItems: 'center', gap: spacing.xs },
  verdict: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  why: { fontSize: typography.sizes.sm, lineHeight: 21 },
  whyLabel: { fontWeight: typography.weights.semibold },
  score: { fontFamily: displayFont, fontSize: typography.sizes.xxl, fontWeight: typography.displayWeight },
  xp: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold },
  honest: { fontSize: typography.sizes.md, lineHeight: 24 },
  actions: { gap: spacing.sm, marginTop: spacing.md },
});
