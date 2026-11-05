import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  WHO_AM_I_GUESSES,
  WHO_AM_I_ROUND_ITEMS,
  dialectDirection,
  whoAmIPoints,
  type GameDialect,
  type GameDifficulty,
  type MultiMoveAnswer,
  type MultiView,
  type SoloResults,
  type WhoAmIAskResult,
  type WhoAmIAsked,
  type WhoAmICorrection,
  type WhoAmIHint,
  type WhoAmIItemView,
  type WhoAmIRaceBoard,
  type WhoAmIRaceOutcome,
} from '@kurda/shared';
import type { ApiResult } from '../api/types';
import { describeError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { GuestWall } from '../auth/AccountGate';
import { TONES } from '../coursemap/path';
import { haptic } from '../feedback/haptics';
import { leftResults } from '../feedback/gameFinished';
import { useI18n } from '../i18n/I18nContext';
import { useCourseDialect } from '../learn/courseDialect';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { GameRoom, multiSeatName } from '../play/GameRoom';
import { InviteSheet } from '../play/InviteSheet';
import { useGameView } from '../play/useGameView';
import { ClayButton, GlassCard, GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { SoloGameShell, type SoloRound } from '../games/SoloGameShell';
import { useAvailability } from '../games/learnGames';
import { groupDialects, useMpAvailability } from '../games/mpAvailability';
import { DIFFICULTY_KEY } from '../games/partyChoices';
import { ForeheadCard, GuessTiles, QuestionDeck, WHO_AM_I_TONE } from './WhoAmIStage';

type Round = SoloRound<WhoAmIItemView, WhoAmIHint, WhoAmICorrection>;

/**
 * Who Am I? on the phone: a hidden word on a card on Hevalo's forehead,
 * found by asking yes/no questions in Kurdish. Without an id, the start —
 * a round alone (the solo shell) or a race with friends (the invite sheet) —
 * each offered only where approved identities and questions allow. With an
 * id, a race's room (play/GameRoom.tsx), for an account only. The website's
 * whoami/WhoAmI.tsx plays the same game.
 */
export function WhoAmIScreen({ id: initialId, onExit }: { id?: string; onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const [id, setId] = useState<string | null>(initialId ?? null);
  const [alone, setAlone] = useState(false);
  useEffect(() => {
    if (initialId) setId(initialId);
  }, [initialId]);
  useEffect(() => () => leftResults(), [id]);
  if (alone && !id) return <SoloRoundScreen onExit={() => setAlone(false)} />;
  return (
    <GradientBackground>
      <ScreenHeader title={t('games.whoAmI.name')} onBack={onExit} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {id ? (
          <GuestWall reason="play" onBack={() => setId(null)}>
            <RaceRoom key={id} id={id} onNew={() => setId(null)} onOpen={setId} />
          </GuestWall>
        ) : (
          <Start onAlone={() => setAlone(true)} />
        )}
      </ScrollView>
    </GradientBackground>
  );
}

function Start({ onAlone }: { onAlone: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { isGuest } = useAuth();
  const dialect = useCourseDialect();
  const availability = useAvailability(dialect);
  const race = useMpAvailability('who-am-i', !isGuest);
  const [inviting, setInviting] = useState(false);
  if (availability === null || (!isGuest && race === null)) return <ActivityIndicator color={colors.primary} style={styles.loading} />;
  const solo = availability.games.find((g) => g.id === 'who-am-i')?.available ?? false;
  const together = !isGuest && groupDialects(race).length > 0;
  if (!solo && !together) {
    return (
      <GlassCard style={styles.card}>
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.whoAmI.notOffered')}</Text>
      </GlassCard>
    );
  }
  return (
    <>
      <GlassCard style={styles.card}>
        <ForeheadCard dialect={dialect} category="animal" identity={null} />
        <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.whoAmI.intro')}</Text>
      </GlassCard>
      {solo ? (
        <GlassCard style={styles.card}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
            {t('games.whoAmI.alone')}
          </Text>
          <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.whoAmI.aloneBlurb')}</Text>
          <ClayButton label={t('games.play')} icon="play" tone="primary" onPress={onAlone} style={styles.stretch} />
        </GlassCard>
      ) : null}
      {together ? (
        <GlassCard style={styles.card}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
            {t('games.whoAmI.race')}
          </Text>
          <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.whoAmI.raceBlurb')}</Text>
          <ClayButton label={t('games.whoAmI.race')} icon="people" tone="primary" onPress={() => setInviting(true)} style={styles.stretch} />
        </GlassCard>
      ) : null}
      {inviting ? <InviteSheet target={{ kind: 'new', game: 'who-am-i' }} onClose={() => setInviting(false)} /> : null}
    </>
  );
}

// ---------- alone ----------

function SoloBoard({ round, dialect, onAsked }: { round: Round; dialect: GameDialect; onAsked: (index: number, asked: WhoAmIAsked[]) => void }): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { client } = useAuth();
  const { item, result, busy, submit, sessionId, state } = round;
  const [asked, setAsked] = useState<WhoAmIAsked[]>(item.asked);
  const [crossed, setCrossed] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setAsked(item.asked);
    setCrossed([]);
    setError(null);
  }, [item.index, item.asked]);
  useEffect(() => {
    const not = result?.hint?.notThis;
    if (not) setCrossed((c) => (c.includes(not) ? c : [...c, not]));
  }, [result]);
  const done = result?.done === true || state.done;
  const ask = async (question: string): Promise<void> => {
    setAsking(true);
    setError(null);
    const res = await client.post<WhoAmIAskResult>(`/games/who-am-i/sessions/${sessionId}/ask`, { index: item.index, question });
    setAsking(false);
    if (!res.ok) return setError(describeError(res.error, t));
    setAsked(res.data.asked);
    onAsked(item.index, res.data.asked);
    haptic(res.data.answer ? 'correct' : 'wrong');
  };
  const identity = result?.correction ? { word: result.correction.word, meanings: result.correction.meanings } : null;
  const line = done
    ? result?.correct
      ? t('games.whoAmI.score', { count: whoAmIPoints(asked.length, crossed.length, true) })
      : t('games.whoAmI.out')
    : `${t('games.whoAmI.worth', { count: whoAmIPoints(asked.length, crossed.length, true) })} · ${t('games.whoAmI.guessesLeft', { count: WHO_AM_I_GUESSES - state.attempts })}`;
  return (
    <View style={styles.board}>
      <ForeheadCard dialect={dialect} category={item.category} identity={identity} />
      <Text style={[styles.line, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">
        {line}
      </Text>
      <QuestionDeck dialect={dialect} questions={item.questions} asked={asked} disabled={done || busy || asking} onAsk={(q) => void ask(q)} />
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <GuessTiles dialect={dialect} tiles={item.tiles} crossed={crossed} right={result?.correction?.id ?? null} disabled={done || busy} onGuess={(tile) => void submit({ guess: tile })} />
    </View>
  );
}

function SoloRoundScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const { client } = useAuth();
  const { scheme } = useTheme();
  const dialect = useCourseDialect();
  const availability = useAvailability(dialect);
  const [open, setOpen] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const asked = useRef(new Map<number, number>());
  const session = useRef<string | null>(null);
  const tone = TONES[scheme][WHO_AM_I_TONE];

  useEffect(() => {
    void client.get<{ id: string | null }>(`/games/solo/open?game=who-am-i&dialect=${dialect}`).then((res) => {
      if (res.ok) setOpen(res.data.id);
    });
  }, [client, dialect]);

  const finished = useCallback(
    async (results: SoloResults) => {
      // a round come back to may have had questions asked before: the round itself says how many
      const id = session.current;
      const view = id ? await client.get<{ items: WhoAmIItemView[] }>(`/games/solo/sessions/${id}`) : null;
      const counts = new Map(asked.current);
      if (view?.ok) for (const item of view.data.items) counts.set(item.index, item.asked.length);
      setScore(results.items.reduce((sum, i) => sum + whoAmIPoints(counts.get(i.index) ?? 0, i.correct && !i.firstTry ? 1 : 0, i.correct), 0));
    },
    [client],
  );

  const game = availability?.games.find((g) => g.id === 'who-am-i');
  return (
    <SoloGameShell<WhoAmIItemView, WhoAmIHint, WhoAmICorrection>
      game="who-am-i"
      dialect={dialect}
      title={t('games.whoAmI.name')}
      blurb={t('games.whoAmI.intro')}
      difficulties={availability ? (game?.difficulties ?? []) : null}
      open={open}
      roundItems={WHO_AM_I_ROUND_ITEMS}
      renderRound={(round) => {
        session.current = round.sessionId;
        return <SoloBoard round={round} dialect={dialect} onAsked={(index, a) => asked.current.set(index, a.length)} />;
      }}
      explain={() => null}
      onFinished={(r) => void finished(r)}
      resultsExtra={score !== null ? <Text style={[styles.total, { color: tone.text }]}>{t('games.whoAmI.score', { count: score })}</Text> : null}
      onExit={onExit}
      tone={tone.fill}
    />
  );
}

// ---------- the race ----------

function RaceRoom({ id, onNew, onOpen }: { id: string; onNew: () => void; onOpen: (id: string) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const room = useGameView<WhoAmIRaceBoard | null, WhoAmIRaceOutcome>('who-am-i', id, { deadlineOf: (v) => v.board?.endsAt ?? null });
  return (
    <GameRoom
      game="who-am-i"
      id={id}
      room={room}
      onNew={onNew}
      onOpen={onOpen}
      newLabel={t('games.whoAmI.name')}
      lobbyNote={(v) => {
        const s = v.settings as { difficulty?: GameDifficulty; minutes?: number };
        return (
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            {v.dialect === 'ckb' ? 'Soranî' : 'Kurmancî'}
            {s.difficulty ? ` · ${t(DIFFICULTY_KEY[s.difficulty])}` : ''}
            {s.minutes ? ` · ${t('games.whoAmI.minutesCount', { count: s.minutes })}` : ''}
          </Text>
        );
      }}
      playing={(v) => <RaceBoard view={v} skew={room.skew} move={room.move} />}
      ending={(v) => {
        const reveal = v.board?.reveal ?? [];
        if (reveal.length === 0) return null;
        const dir = dialectDirection(v.dialect);
        return (
          <View style={styles.reveal}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
              {t('games.whoAmI.reveal')}
            </Text>
            {reveal.map((r) => {
              const p = v.players.find((x) => x.seat === r.seat);
              return (
                <View key={r.seat} style={styles.revealRow}>
                  <Text style={[styles.bold, { color: colors.textPrimary }]}>{p ? multiSeatName(p, t) : t('stories.player', { seat: r.seat })}</Text>
                  <Text style={[styles.revealWord, { color: colors.textPrimary, writingDirection: dir.dir }]}>
                    {r.word}
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>{r.meanings.en}</Text>
                </View>
              );
            })}
          </View>
        );
      }}
      scoreOf={(r) => t('games.whoAmI.points', { count: r.score })}
    />
  );
}

/** The server's time, ticking every second while `on`. */
function useServerNow(skew: number, on: boolean): number {
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    setNow(Date.now() + skew);
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now() + skew), 1000);
    return () => clearInterval(timer);
  }, [skew, on]);
  return now;
}

function RaceBoard({
  view,
  skew,
  move,
}: {
  view: MultiView<WhoAmIRaceBoard | null>;
  skew: number;
  move: (body: unknown) => Promise<ApiResult<MultiMoveAnswer<WhoAmIRaceBoard | null, WhoAmIRaceOutcome>>>;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const now = useServerNow(skew, view.status === 'active');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const board = view.board;
  if (!board) return null;
  const mine = board.mine;
  const name = (seat: number): string => {
    const p = view.players.find((x) => x.seat === seat);
    return p ? multiSeatName(p, t) : t('stories.player', { seat });
  };
  const left = Math.max(0, Math.ceil((Date.parse(board.endsAt) - now) / 1000));
  const act = async (body: unknown): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await move(body);
    setBusy(false);
    if (!res.ok) return setError(describeError(res.error, t));
    const outcome = res.data.outcome;
    if (outcome.kind === 'guess') haptic(outcome.correct ? 'celebrate' : 'wrong');
  };
  const playing = !!mine && !mine.solved && !mine.out;
  const crossed = mine?.guesses.filter((g) => !g.correct).map((g) => g.tile) ?? [];
  return (
    <View style={styles.board}>
      <Text style={[styles.clock, { color: colors.textPrimary }]} accessibilityRole="timer" accessibilityLabel={t('games.whoAmI.timeLeft', { count: left })}>
        {t('games.whoAmI.timeLeft', { count: left })}
      </Text>
      {board.firstSolver !== null ? (
        <Text style={[styles.line, { color: colors.primary }]} accessibilityLiveRegion="polite">
          {board.firstSolver === view.me?.seat ? t('games.whoAmI.youFirst') : t('games.whoAmI.first', { name: name(board.firstSolver) })}
        </Text>
      ) : null}
      {mine ? (
        <>
          <ForeheadCard dialect={board.dialect} category={mine.category} identity={mine.identity} />
          <Text style={[styles.line, { color: colors.textPrimary }]}>
            {mine.solved
              ? `${t('games.whoAmI.gotIt')} ${t('games.whoAmI.score', { count: mine.points })}`
              : mine.out
                ? t('games.whoAmI.out')
                : `${t('games.whoAmI.worth', { count: whoAmIPoints(mine.asked.length, crossed.length, true) })} · ${t('games.whoAmI.guessesLeft', { count: mine.guessesLeft })}`}
          </Text>
          <QuestionDeck dialect={board.dialect} questions={mine.questions} asked={mine.asked} disabled={!playing || busy} onAsk={(q) => void act({ kind: 'ask', question: q })} />
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <GuessTiles dialect={board.dialect} tiles={mine.tiles} crossed={crossed} right={mine.identity?.id ?? null} disabled={!playing || busy} onGuess={(tile) => void act({ kind: 'guess', tile })} />
        </>
      ) : null}
      <View style={styles.others}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
          {t('games.whoAmI.others')}
        </Text>
        {board.seats
          .filter((s) => s.seat !== view.me?.seat)
          .map((s) => (
            <View key={s.seat} style={[styles.other, { borderColor: colors.controlTrack, opacity: s.out || s.left ? 0.6 : 1 }]}>
              <Text style={[styles.bold, { color: colors.textPrimary }]}>{name(s.seat)}</Text>
              <Text style={{ color: colors.textSecondary }}>{t('games.whoAmI.seatAsked', { count: s.asked })}</Text>
              {s.solved ? <Text style={[styles.bold, { color: colors.success }]}>{t('games.whoAmI.solved')}</Text> : null}
              {s.out ? <Text style={{ color: colors.danger }}>{t('games.whoAmI.out')}</Text> : null}
            </View>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { alignItems: 'center', gap: spacing.sm },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  loading: { marginTop: spacing.xl },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 22 },
  board: { gap: spacing.md },
  line: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, textAlign: 'center' },
  clock: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center' },
  note: { fontSize: typography.sizes.sm, textAlign: 'center' },
  total: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  bold: { fontWeight: typography.weights.bold },
  others: { gap: spacing.sm },
  other: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radii.md, padding: spacing.sm, minHeight: 44 },
  reveal: { alignSelf: 'stretch', gap: spacing.sm },
  revealRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  revealWord: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
});
