import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  DIFFICULTY_LEVELS,
  GAME_DIFFICULTIES,
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
import type { TranslationKey } from '../i18n/translations';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useDirection } from '../reports/direction';
import { GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { TileButton } from '../theme/Tile';
import { useTheme } from '../theme/ThemeProvider';
import { displayFont } from '../theme/fonts';
import { layout, radii, spacing, typography } from '../theme/tokens';

/**
 * What every learning game played alone has around its own staging, on the
 * phone: the intro (the game's own picture of it, the difficulty), the round
 * (where you are in it, the verdict and its explanation after each answer),
 * and results that say exactly what happened — right, right first time, what
 * it paid, and when it paid nothing, why.
 *
 * The round is the server's (api/src/games/solo.ts): made there, checked
 * there, paid there once. A round left open is offered again until it
 * expires. The game draws its own board (`renderRound`), with its Check
 * button, its nudge after a wrong try and its correction once an item is
 * done; this draws the rest. The website's games/SoloGameShell.tsx is the
 * same shell, so the two say the same things in the same order.
 */

export interface SoloRound<Item, H, C, B = unknown> {
  /** the round's id: what a game's clips are played from (`hearItClipPath`), and what it asks more of than answers (Kurdish Detective's hints) */
  sessionId: string;
  /** what the whole round shares, as the round was sent (Kurdish Detective's case board); null for a game without */
  board: B | null;
  item: Item;
  index: number;
  total: number;
  state: SoloItemState;
  result: SoloAnswerResult<H, C> | null;
  busy: boolean;
  submit: (answer: unknown) => Promise<void>;
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
  onExit: () => void;
  /** items in one of its rounds, when it is not SOLO_ROUND_ITEMS: what "up to N XP" counts */
  roundItems?: number;
}

const DIFFICULTY_KEY: Record<GameDifficulty, TranslationKey> = {
  beginner: 'games.solo.difficulty.beginner',
  intermediate: 'games.solo.difficulty.intermediate',
  advanced: 'games.solo.difficulty.advanced',
};

type Phase = 'intro' | 'round' | 'results';

function nextOpen(states: readonly SoloItemState[]): number {
  const at = states.findIndex((s) => !s.done);
  return at < 0 ? states.length : at;
}

/** A stone per item: the one you are on raised, the ones done filled by how they went. */
function Stones({ states, here, tone }: { states: readonly SoloItemState[]; here: number | null; tone: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.stones, { flexDirection: dir.row }]} aria-hidden>
      {states.map((s) => {
        const fill = s.done ? (s.correct ? tone : 'transparent') : colors.controlTrack;
        return (
          <View
            key={s.index}
            style={[
              styles.stone,
              { backgroundColor: fill, opacity: s.done && s.correct && !s.firstTry ? 0.55 : 1 },
              s.done && !s.correct && { borderWidth: 2, borderColor: colors.controlTrack },
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
  onExit,
  tone,
  roundItems,
}: Props<Item, H, C, B> & { tone: string }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
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
        <Text style={[styles.title, ...text]} accessibilityRole="header">
          {t('games.solo.results.title')}
        </Text>
        <Text style={[styles.score, ...text]}>{t('games.solo.results.score', { correct: results.correct, total: results.total })}</Text>
        <Stones states={session.states} here={null} tone={tone} />
        <Text style={muted}>{t('games.solo.results.firstTry', { n: results.firstTry })}</Text>
        {results.learningCounted ? (
          <>
            <Text style={[dir.text, styles.xp, { color: colors.gold }]}>{t('games.solo.results.xp', { xp: results.xp })}</Text>
            <Text style={muted}>{t('games.solo.results.streak')}</Text>
            {results.items.some((i) => i.correct && i.repeat) ? <Text style={muted}>{t('games.solo.results.repeat')}</Text> : null}
          </>
        ) : (
          <Text style={[...text, styles.honest]}>{t('games.solo.results.noXp', { needed: results.needed, correct: results.correct })}</Text>
        )}
        {resultsExtra}
        <View style={styles.actions}>
          <TileButton label={t('games.solo.playAgain')} onPress={() => void start()} busy={busy} disabled={!chosen} />
          <TileButton label={t('games.solo.backToGames')} onPress={onExit} tone="success" />
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
    body = (
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.bar, { flexDirection: dir.row }]}>
          <Stones states={session.states} here={index} tone={tone} />
          <Text style={[styles.count, { color: colors.textSecondary }]} accessibilityLabel={t('games.solo.progress', { n: index + 1, total: session.items.length })}>
            {t('games.solo.progress', { n: index + 1, total: session.items.length })}
          </Text>
        </View>
        {renderRound({ sessionId: session.id, board: session.board ?? null, item, index, total: session.items.length, state, result, busy, submit })}
        {verdict ? (
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.feedback,
              { backgroundColor: result?.correct ? colors.successFill : result?.done ? colors.dangerFill : colors.controlTrack },
            ]}
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
        ) : null}
        {error ? <Text style={[dir.text, { color: colors.danger }]}>{error}</Text> : null}
      </ScrollView>
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, ...text]} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[...text, styles.blurb]}>{blurb}</Text>
        <Text style={muted}>{t('games.solo.variety', { variety: dialect === 'ckb' ? 'Soranî' : 'Kurmancî' })}</Text>
        {intro}
        {open ? <TileButton label={t('games.solo.continue')} onPress={() => void resume()} busy={busy} tone="success" /> : null}
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
                style={[
                  styles.chip,
                  { borderColor: on ? tone : colors.controlTrack, backgroundColor: on ? colors.controlTrack : 'transparent', opacity: can ? 1 : 0.5 },
                ]}
              >
                <Text style={[styles.chipText, { color: colors.textPrimary, fontWeight: on ? typography.weights.semibold : typography.weights.regular }]}>
                  {t(DIFFICULTY_KEY[d])}
                </Text>
              </PressableScale>
            );
          })}
        </View>
        {chosen ? <Text style={muted}>{t('games.solo.upToXp', { xp: roundXpCeiling(DIFFICULTY_LEVELS[chosen], roundItems) })}</Text> : null}
        <TileButton label={t('games.solo.start')} onPress={() => void start()} busy={busy} disabled={!chosen} />
        {difficulties !== null && offered.length === 0 ? <Text style={muted}>{t('games.solo.notEnough')}</Text> : null}
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
  chip: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1.5, justifyContent: 'center' },
  chipText: { fontSize: typography.sizes.sm },
  bar: { alignItems: 'center', gap: spacing.sm },
  stones: { flex: 1, gap: 6 },
  stone: { flex: 1, maxWidth: 44, height: 8, borderRadius: radii.pill },
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
