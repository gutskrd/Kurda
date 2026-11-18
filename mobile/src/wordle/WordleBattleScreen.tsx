import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { ClayButton, ErrorRetry, GlassCard, GradientBackground, Segmented } from '../theme/glass';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useGameBack } from '../navigation/hardwareBack';
import { LobbyPeople, useLobbyRefresh } from '../play/lobby';
import { FriendPicker, togglePick, useFriendsToAsk } from '../play/FriendPicker';
import { inviteFriends } from '../play/api';
import { showNotice } from '../theme/notice';
import { askLeaveGame, useLeaveLobbyOnBack } from '../play/backOut';
import { RankResultPanel } from '../ranks/RankResultPanel';
import { useQuietInvites } from '../play/quietInvites';
import { InviteSheet } from '../play/InviteSheet';
import { LobbyShare } from '../play/CodeTicket';
import { JoinCodeCard } from '../play/JoinByCode';
import { RematchPanel } from '../play/RematchPanel';
import { Verdict } from '../play/Verdict';
import { PlayerReportButton } from '../reports/PlayerReportButton';
import { backspace, buildBoard, DEL, DIFFICULTIES, DIFFICULTY_KEY, ENTER, typeLetter } from './board';
import { WordleBoard, cellSizeFor } from './WordleBoard';
import { WordleKeyboard } from './WordleKeyboard';
import { WordMeaningLine } from './WordAnswer';
import { leftResults, reportGameFinished } from '../feedback/gameFinished';
import {
  createBattle,
  getBattle,
  getResults,
  guessInBattle,
  joinBattle,
  leaveBattle,
  removeFromBattle,
  startBattle,
  type BattleResults,
  type BattleState,
  type Difficulty,
} from './battleApi';
import { Loading } from '../theme/Loading';
import { GameArt } from '../games/GameArt';
import { useDirection } from '../reports/direction';
import { MAX_INVITEES_PER_REQUEST } from '@kurda/shared';


/**
 * Peyvok Battle: race a friend to the same word. Built on the poll-safe REST endpoints, so a realtime gateway can
 * be layered on later without changing this screen.
 *
 * Without `id` the screen creates a room or joins one by code; with one it is that room, so a code, an invite or
 * an old invite link opens straight into a match. Backing out of the lobby leaves it after asking (play/backOut),
 * the host can remove a player by seat, and Android's back mid-race asks before leaving the board.
 */
export function WordleBattleScreen({ id: initialId, onExit }: { id?: string; onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const [id, setId] = useState<string | null>(initialId ?? null);
  /*
   * Another battle opened while this screen is up (an invite's Join, a game card, "Invite someone else") arrives
   * as new params on this screen, so the room follows them.
   */
  useEffect(() => {
    if (initialId) setId(initialId);
  }, [initialId]);
  // A game's results are left when another game opens here or the screen closes, and their rating box goes with
  // them (feedback/gameFinished).
  useEffect(() => () => leftResults(), [id]);

  return (
    <Shell title={t('games.battle.name')} onExit={onExit}>
      {id ? <BattleRoom key={id} id={id} onLeave={() => setId(null)} onOpen={setId} onExit={onExit} /> : <CreateBattle onEnter={setId} />}
    </Shell>
  );
}

/**
 * Pick a difficulty and friends to ask, and open a room — or join one with the code a friend gave you. As on the
 * website, asking nobody is fine: the room has a code to hand out. Games are played for fun, so every battle is
 * friendly.
 */
function CreateBattle({ onEnter }: { onEnter: (id: string) => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const { friends, recentIds } = useFriendsToAsk();
  const [asked, setAsked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await createBattle(client, difficulty, false);
    if (res.ok && asked.length > 0) {
      // The room exists whatever happens to the invites; one that did not go is said, and the room can ask again.
      const sent = await inviteFriends(client, 'wordle-battle', res.data.id, asked);
      if (!sent.ok) showNotice(describeError(sent.error, t));
    }
    setBusy(false);
    if (res.ok) onEnter(res.data.id);
    else setError(res.error.code === 'EMPTY_POOL' ? t('games.emptyPool') : describeError(res.error, t));
  };

  return (
    <>
      <GlassCard>
        <View style={styles.card}>
          {/* The game's own cover, as its stamp and the solo game show it. */}
          <GameArt game="peyvok" size={72} />
          <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.battle.intro')}</Text>
          <View style={styles.stretch}>
            <Segmented<Difficulty>
              options={DIFFICULTIES}
              value={difficulty}
              onChange={setDifficulty}
              labelOf={(d) => t(DIFFICULTY_KEY[d])}
            />
          </View>
          {/* Who to ask, in the same step, as the website's page has it. */}
          <View style={[styles.stretch, styles.who]}>
            <Text style={[styles.label, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('play.invite.friends')}
            </Text>
            <FriendPicker
              friends={friends}
              recentIds={recentIds}
              picked={asked}
              onToggle={(friend) => setAsked((list) => togglePick(list, friend, false, MAX_INVITEES_PER_REQUEST))}
              limit={MAX_INVITEES_PER_REQUEST}
            />
          </View>
          <ClayButton
            label={t('games.battle.create')}
            // Working: the button spins and ignores a second press, and screen readers are told what it is doing.
            accessibilityLabel={busy ? t('games.creating') : undefined}
            busy={busy}
            icon="play"
            tone="primary"
            onPress={() => void create()}
            style={styles.stretch}
          />
          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        </View>
      </GlassCard>

      {/* A battle somebody else made: its code opens it, whichever game it turns out to be. */}
      <JoinCodeCard />
    </>
  );
}

/** One room: lobby, play, scoreboard. Polls until the match is over. */
function BattleRoom({
  id,
  onLeave,
  onOpen,
  onExit,
}: {
  id: string;
  /** To a new battle, in this screen. */
  onLeave: () => void;
  onOpen: (id: string) => void;
  /** The screen's own back. */
  onExit: () => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();

  const [battle, setBattle] = useState<BattleState | null>(null);
  const [results, setResults] = useState<BattleResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const loadedOnce = useRef(false);
  // Results: "Invite someone else" opens the invite sheet for this game.
  const [inviting, setInviting] = useState(false);
  // The server has no battle here for this viewer: never one, not theirs, or the host removed them.
  const [gone, setGone] = useState(false);

  const load = useCallback(async () => {
    const res = await getBattle(client, id);
    if (res.ok) {
      setBattle(res.data);
      loadedOnce.current = true;
    } else if (res.error.status === 404) {
      setGone(true);
    } else if (!loadedOnce.current) {
      // A later poll failing is a blip; the first one failing is the whole screen.
      setError(res.error.code === 'GAME_STARTED' ? t('stories.join.started') : describeError(res.error, t));
    }
  }, [client, id, t]);

  /*
   * Changes (a join, the start, an opponent's guess, the end) are pushed as `play_changed` and the screen
   * refetches then, with a slow poll underneath in case one is missed.
   */
  useEffect(() => {
    void load();
  }, [load]);
  useLobbyRefresh('wordle-battle', id, () => void load(), !gone && battle?.status !== 'finished' && battle?.status !== 'cancelled');

  // Results are fetched once the battle is over and nothing polls; a failed fetch is shown with a retry, not an
  // endless spinner.
  const [resultsFailed, setResultsFailed] = useState(false);
  const [resultsAsk, setResultsAsk] = useState(0);
  useEffect(() => {
    if (battle?.status !== 'finished' || results) return;
    setResultsFailed(false);
    void getResults(client, id).then((r) => {
      if (r.ok) setResults(r.data);
      else setResultsFailed(true);
    });
  }, [battle?.status, results, client, id, resultsAsk]);

  /*
   * A battle played to its end here counts as a finished game for the rating box once its results are in, as a
   * rhyme match does; one opened already finished does not.
   */
  const played = useRef(false);
  useEffect(() => {
    if (battle?.status === 'active' && battle.me) played.current = true;
  }, [battle?.status, battle?.me]);
  useEffect(() => {
    if (!results || !played.current) return;
    played.current = false;
    const mine = results.ranking.find((r) => r.isMe ?? r.userId === user?.id);
    if (mine) reportGameFinished({ moment: mine.rank === 1 ? 'won' : 'other' });
  }, [results, user?.id]);

  const me = battle?.me ?? null;
  const active = battle?.status === 'active' && me != null && me.status === 'playing' && !me.solved;
  // An invite waits while a battle is on (the banner would sit over the board).
  useQuietInvites(battle?.status === 'active');
  const isHost = battle ? (battle.isHost ?? battle.createdBy === user?.id) : false;
  // Backing out of the lobby leaves it after asking; mid-race Android's back asks and the iOS swipe is off.
  useLeaveLobbyOnBack(!gone && battle?.status === 'lobby' && me != null, isHost, () => leaveBattle(client, id));
  useGameBack(active ? () => askLeaveGame(t, onExit) : null);

  const submit = useCallback(async () => {
    if (!battle || !me || !active || busy) return;
    if (draft.length !== battle.targetLength) {
      setNotice(t('games.wordle.enterLetters', { count: battle.targetLength }));
      return;
    }
    setBusy(true);
    setNotice(null);
    const res = await guessInBattle(client, id, draft.join(''));
    setBusy(false);
    if (res.ok) {
      setBattle(res.data);
      setDraft([]);
      // This guess finished your board (solved or out of tries), so it is felt now; the battle ends when every board has.
      const after = res.data.me;
      if (after && (after.solved || after.status !== 'playing')) haptic(after.solved ? 'correct' : 'wrong');
    } else {
      // A rejected guess costs no attempt — the draft stays put, with a reason.
      setNotice(guessMessage(res.error, t));
    }
  }, [client, id, battle, me, active, busy, draft, t]);

  const press = useCallback(
    (key: string) => {
      if (!active || !battle) return;
      setNotice(null);
      if (key === ENTER) return void submit();
      if (key === DEL) return setDraft((d) => backspace(d));
      setDraft((d) => typeLetter(d, key, battle.targetLength));
    },
    [active, battle, submit],
  );

  const act = async (work: () => Promise<{ ok: true; data: BattleState } | { ok: false; error: ApiError }>) => {
    setBusy(true);
    setNotice(null);
    const res = await work();
    setBusy(false);
    if (res.ok) setBattle(res.data);
    else setNotice(describeError(res.error, t));
  };

  // Cancelled by the host, or gone for this viewer: said plainly, with a new battle one tap away.
  if (gone || battle?.status === 'cancelled') {
    return (
      <GlassCard>
        <View style={styles.card}>
          <Text style={[styles.blurb, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {gone ? t('stories.game.unavailable') : t('stories.game.cancelled')}
          </Text>
          <ClayButton label={t('games.battle.new')} tone="primary" onPress={onLeave} style={styles.stretch} />
        </View>
      </GlassCard>
    );
  }
  if (error && !battle) {
    return (
      <GlassCard>
        <View style={styles.card}>
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          <ClayButton label={t('common.retry')} tone="primary" onPress={() => void load()} style={styles.stretch} />
        </View>
      </GlassCard>
    );
  }
  if (!battle) return <Loading style={styles.loading} />;

  const playerCount = (battle.me ? 1 : 0) + battle.opponents.length;

  // ---- lobby -----------------------------------------------------------------
  if (battle.status === 'lobby') {
    return (
      <>
        {/* The code to tell people, with Invite friends beside it: for whoever is in the lobby. */}
        {battle.me != null ? (
          <LobbyShare
            game="wordle-battle"
            lobbyId={id}
            code={battle.code}
            canInvite={isHost && playerCount < battle.maxPlayers}
            mode={battle.maxPlayers === 2 ? 'duo' : 'group'}
          />
        ) : null}
        <GlassCard>
          <View style={styles.card}>
            <Text style={[styles.blurb, { color: colors.textSecondary }]}>
              {t('games.lobbyWaiting', { count: playerCount })}
            </Text>
            {battle.me != null ? (
              <LobbyPeople
                game="wordle-battle"
                lobbyId={id}
                players={battle.players ?? []}
                isHost={isHost}
                onRemove={isHost ? (seat) => void act(() => removeFromBattle(client, id, seat)) : undefined}
              />
            ) : null}
            {notice ? <Text style={[styles.error, { color: colors.danger }]}>{notice}</Text> : null}
            {battle.me == null ? (
              <ClayButton
                label={t('games.battle.join')}
                accessibilityLabel={busy ? t('games.joining') : undefined}
                busy={busy}
                tone="primary"
                onPress={() => void act(() => joinBattle(client, id))}
                style={styles.stretch}
              />
            ) : isHost && playerCount >= 2 ? (
              <ClayButton
                label={t('games.battle.start')}
                accessibilityLabel={busy ? t('games.starting') : undefined}
                busy={busy}
                tone="primary"
                onPress={() => {
                  haptic('tap');
                  void act(() => startBattle(client, id));
                }}
                style={styles.stretch}
              />
            ) : (
              <Text style={[styles.waiting, { color: colors.textSecondary }]}>
                {isHost ? t('games.waitingForPlayer') : t('games.waitingForHost')}
              </Text>
            )}
            {/* The lobby's own way out is the screen's back, which asks and then leaves (play/backOut). */}
            {battle.me != null ? (
              <ClayButton
                label={isHost ? t('stories.lobby.cancelGame') : t('stories.lobby.leave')}
                tone="danger"
                variant="outline"
                onPress={onExit}
                style={styles.stretch}
              />
            ) : null}
          </View>
        </GlassCard>
      </>
    );
  }

  // ---- scoreboard ------------------------------------------------------------
  if (battle.status === 'finished') {
    const mine = results?.ranking.find((r) => r.userId === user?.id);
    return (
      <GlassCard>
        <View style={styles.card}>
          <Verdict won={mine?.rank === 1}>{mine?.rank === 1 ? t('games.youWon') : mine?.solved ? t('games.battle.solvedIt') : t('games.battle.over')}</Verdict>
          {/* What this game did to your rank, with its one plain reason — before the table. */}
          {battle.rated?.rated ? <RankResultPanel game="wordle-battle" gameRef={id} /> : null}
          {results ? (
            <>
              <Text style={[styles.blurb, { color: colors.textSecondary }]}>
                {t('games.wordle.theWordWas')} {results.target.toUpperCase()}
              </Text>
              {/* The word everyone raced for, and what it means: the one thing a battle teaches. */}
              <WordMeaningLine word={results.target} meanings={results.meanings} />
              <View style={styles.stretch}>
                {results.ranking.map((r) => (
                  <View key={r.userId} style={[styles.scoreLine, { flexDirection: dir.row }]}>
                    <Text style={[styles.rank, { color: colors.textSecondary }]}>{r.rank}</Text>
                    <Text style={[styles.scoreName, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
                      {r.isMe ?? r.userId === user?.id ? t('games.you') : (r.name ?? t('games.opponent'))}
                    </Text>
                    <Text style={[styles.scoreValue, { color: colors.textSecondary }]}>
                      {r.solved
                        ? t('games.battle.solvedIn', { count: r.guessCount })
                        : t('games.battle.lettersProgress', { done: r.progress, total: results.target.length })}
                    </Text>
                    {r.xpAwarded ? <Text style={[styles.xp, { color: colors.goldText }]}>+{r.xpAwarded} XP</Text> : null}
                    {/* Anyone else in the game can be reported, by seat. */}
                    {r.userId !== user?.id && r.seat !== undefined ? (
                      <PlayerReportButton game="wordle-battle" gameId={results.id} seat={r.seat} name={r.name ?? null} />
                    ) : null}
                  </View>
                ))}
              </View>
            </>
          ) : resultsFailed ? (
            <ErrorRetry onRetry={() => setResultsAsk((n) => n + 1)} />
          ) : (
            <Loading />
          )}
          {/* Play again with the same people: a rematch for two, the host's next round for more. */}
          <View style={styles.stretch}>
            <RematchPanel
              game="wordle-battle"
              lobbyId={id}
              isHost={isHost}
              other={results?.ranking.find((r) => !(r.isMe ?? r.userId === user?.id))?.name ?? t('games.opponent')}
              onOpen={onOpen}
              onInviteOthers={() => setInviting(true)}
            />
          </View>
          <ClayButton label={t('games.battle.new')} tone="neutral" onPress={onLeave} style={styles.stretch} />
          {inviting ? <InviteSheet target={{ kind: 'new', game: 'wordle-battle' }} onClose={() => setInviting(false)} /> : null}
        </View>
      </GlassCard>
    );
  }

  // ---- play ------------------------------------------------------------------
  return (
    <>
      {battle.opponents.length > 0 ? (
        <View style={styles.opponents}>
          {battle.opponents.map((o, i) => (
            <View key={o.userId} style={[styles.opponent, { flexDirection: dir.row }]}>
              {/* One line: a long name is cut short rather than broken in the middle of a word. */}
              <Text style={[styles.opponentName, dir.free, { color: colors.textSecondary }]} numberOfLines={1}>
                {o.name ?? (battle.opponents.length > 1 ? t('games.battle.opponentNumbered', { n: i + 1 }) : t('games.opponent'))}
              </Text>
              <View
                accessibilityLabel={t('games.battle.opponentProgress')}
                style={[styles.track, { backgroundColor: colors.controlTrack }]}
              >
                <View
                  style={[
                    styles.trackFill,
                    {
                      backgroundColor: o.solved ? colors.success : colors.primary,
                      width: `${Math.round((o.progress / battle.targetLength) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.opponentState, { textAlign: dir.rtl ? 'left' : 'right', color: o.solved ? colors.success : colors.textSecondary }]}>
                {o.solved
                  ? t('games.battle.opponentSolved')
                  : o.finished
                    ? t('games.battle.opponentDone')
                    : t('games.battle.opponentGuesses', { count: o.guessCount })}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {me ? (
        <>
          <WordleBoard
            board={buildBoard(me.guesses, battle.targetLength, draft, {
              finished: !active,
              maxAttempts: me.guesses.length + me.remainingAttempts,
            })}
            cellSize={cellSizeFor(battle.targetLength)}
          />
          {notice ? <Text style={[styles.error, { color: colors.danger }]}>{notice}</Text> : null}
          {!active ? (
            <Text style={[styles.waiting, { color: colors.textSecondary }]}>
              {me.solved ? t('games.battle.youSolvedWaiting') : t('games.battle.noTriesWaiting')}
            </Text>
          ) : null}
          <WordleKeyboard keyboard={me.keyboard} onKey={press} disabled={!active} checking={busy} style={styles.keyboardBleed} />
        </>
      ) : null}
    </>
  );
}

/**
 * Why a guess was refused: the two deliberate server rejections get the catalogue's wording; anything else is
 * infrastructure, which `describeError` covers.
 */
function guessMessage(error: ApiError, t: (key: TranslationKey) => string): string {
  if (error.code === 'WRONG_LENGTH') return t('games.wordle.wrongLength');
  if (error.code === 'NOT_A_WORD') return t('games.wordle.notAWord');
  return describeError(error, t);
}

/** A match screen's frame: back, title, and a scroller that clears the notch. Rhyme Match uses it too. */
export function Shell({
  title,
  onExit,
  children,
}: {
  title: string;
  onExit: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <GradientBackground>
      <ScreenHeader title={title} onBack={onExit} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  // The keyboard reaches nearer the edges than the rest of the screen: wide keys.
  keyboardBleed: { marginHorizontal: -spacing.md, width: 'auto' },
  // Lay out a card's contents on an inner View: a GlassCard's own style only dresses its outside.
  card: { alignItems: 'center', gap: spacing.sm },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  who: { gap: spacing.xs },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 20 },
  error: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center' },
  waiting: { fontSize: typography.sizes.md, textAlign: 'center', marginTop: spacing.sm },
  loading: { marginTop: spacing.xxl },
  scoreLine: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  rank: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, width: 20 },
  scoreName: { flex: 1, fontSize: typography.sizes.md },
  scoreValue: { fontSize: typography.sizes.sm },
  xp: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  opponents: { gap: spacing.sm },
  opponent: { alignItems: 'center', gap: spacing.sm },
  opponentName: { fontSize: typography.sizes.sm, width: 84 },
  track: { flex: 1, height: 6, borderRadius: radii.pill, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: radii.pill },
  opponentState: { fontSize: typography.sizes.sm, minWidth: 72 },
});
