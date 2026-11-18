import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, WordleGuessRow, LetterFeedback } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { GameHead, stageTone } from '../games/GameHead';
import { TrophyIcon } from '../components/icons';
import { WordleBoard, WordleKeyboard, useReveal } from '../components/WordleBoard';
import { WordMeaningLine, type WordMeanings } from '../components/WordAnswer';
import { useWordleKeys } from '../keyboard/wordleKeys';
import { useRail } from '../social/RailProvider';
import { PlayerChip } from '../ui/PlayerChip';
import { RankList, RankRow } from '../ui/RankRow';
import { useT } from '../i18n/I18nProvider';
import { useGameFinished } from '../feedback/gameFinished';
import type { MessageKey } from '../i18n/en';
import type { GameAccess, RatedState } from '@kurda/shared';
import { LobbyRated, RatedBadge, shownRated } from '../ranks/rated';
import { RankResult } from '../ranks/RankResult';
import { InviteForm } from '../play/InviteSheet';
import { InviteFriendsButton, InvitedList } from '../play/LobbyInvites';
import { CodeTicket } from '../play/CodeTicket';
import { LeaveLobby, LobbyRoster, RoomUnavailable, seatName, type RoomGone, type SeatPlayer } from '../play/GameRoom';
import { RematchPanel } from '../play/RematchPanel';
import { useLobbyUpdates } from '../play/usePlay';
import { playError } from '../play/playApi';
import { useQuietInvites } from '../play/quietInvites';
import { PlayerReport } from '../reports/PlayerReport';
import { haptic } from '../lib/haptics';

type Difficulty = 'easy' | 'medium' | 'hard';
type GameStatus = 'playing' | 'won' | 'lost';

interface OpponentView {
  /** `seat:N`, never another player's account. */
  userId: string;
  seat: number;
  /** Only when this viewer may see it (a friend, or an open battle). */
  name: string | null;
  avatarUrl: string | null;
  guessCount: number;
  solved: boolean;
  status: GameStatus;
  progress: number;
  finished: boolean;
  gone: boolean;
}
interface BattleState {
  id: string;
  status: 'lobby' | 'active' | 'finished' | 'cancelled';
  difficulty: Difficulty;
  targetLength: number;
  maxPlayers: number;
  createdBy: string;
  isHost: boolean;
  /** Who may join: the host's friends, or any adult with the code. */
  access?: GameAccess;
  /** The code a friend types while the lobby can be joined; null after. */
  code?: string | null;
  /** Rated or Friendly, shown before anyone joins and decided at the start. */
  rated?: RatedState;
  /** Everyone in it by seat, as this viewer may see them. */
  players: SeatPlayer[];
  me: {
    guesses: WordleGuessRow[];
    keyboard: Record<string, LetterFeedback>;
    status: GameStatus;
    solved: boolean;
    remainingAttempts: number;
  } | null;
  opponents: OpponentView[];
  target: string | null;
}
interface BattleResults {
  id: string;
  target: string;
  /** The word's meanings in every language a word card gives; absent from older servers. */
  meanings?: WordMeanings;
  difficulty: Difficulty;
  ranking: Array<{
    /** Yours on your own row, `seat:N` on everyone else's. */
    userId: string;
    seat: number;
    name: string | null;
    avatarUrl: string | null;
    isMe: boolean;
    rank: number;
    solved: boolean;
    guessCount: number;
    progress: number;
    xpAwarded: number | null;
  }>;
}

function guessMsg(err: ApiError, t: (key: MessageKey) => string): string {
  switch (err.code) {
    case 'WRONG_LENGTH':
      return t('games.wordle.wrongLength');
    case 'NOT_A_WORD':
      return t('games.wordle.notAWord');
    default:
      return describeError(err, t);
  }
}

/** Peyvok Battle: race to the same word. Create and invite, or hand out the code, then play. */
export function WordleBattle(): React.JSX.Element {
  const [params] = useSearchParams();
  const t = useT();
  const id = params.get('id');
  return (
    <div className="container game-page gs" style={stageTone('peyvok')}>
      <GameHead game="peyvok" title={t('games.battle.name')} meaning={t('games.battle.meaning')} />
      {id ? <BattleRoom key={id} id={id} /> : <CreateBattle />}
    </div>
  );
}

/** A new battle: its difficulty and friends to ask in one step, the invite sheet's form in place; asking nobody is fine. */
function CreateBattle(): React.JSX.Element {
  const t = useT();
  return (
    <div className="match-lobby match-create">
      <p className="page-sub">{t('games.battle.intro')}</p>
      <InviteForm target={{ kind: 'new', game: 'wordle-battle' }} lockGame heading={false} />
    </div>
  );
}

function BattleRoom({ id }: { id: string }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  // Your own face, from the poll the nav already runs.
  const myAvatar = useRail().data.you?.avatarUrl ?? null;
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [results, setResults] = useState<BattleResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<RoomGone | null>(null);
  const [current, setCurrent] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusals, setRefusals] = useState(0);
  // Your last guess's row is still turning over; what it means for you waits for the tiles.
  const { revealing, hold } = useReveal();
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    const res = await client.get<BattleState>(`/wordle/battles/${id}`);
    if (res.ok) {
      setBattle(res.data);
      setGone(null);
      loadedOnce.current = true;
    } else if (res.error.code === 'GAME_STARTED') {
      // A latecomer: the battle is running without them.
      setGone('started');
    } else if (res.error.status === 404) {
      // Not found, not theirs to see, or removed: one answer.
      setGone('gone');
    } else if (!loadedOnce.current) {
      setError(describeError(res.error, t));
    }
  }, [client, id]);

  useEffect(() => {
    void load();
  }, [load]);

  // The server says when the lobby or battle moves (`play_changed`); a slow read covers a missed event, until it is over.
  const live = battle?.status === 'lobby' || battle?.status === 'active';
  useLobbyUpdates('wordle-battle', id, load, live && gone === null);

  useEffect(() => {
    if (battle?.status === 'finished' && !results) {
      void client.get<BattleResults>(`/wordle/battles/${id}/results`).then((r) => {
        if (r.ok) setResults(r.data);
      });
    }
  }, [battle?.status, results, client, id]);

  const active = battle?.status === 'active' && battle.me != null && battle.me.status === 'playing' && !battle.me.solved;
  // While guessing, an invite to something else waits as a chip.
  useQuietInvites(active);
  // The rating box hears of a battle that ended while you watched, not one opened finished.
  useGameFinished('wordle-battle', battle?.me ? id : null, battle?.status === 'finished');

  // A refused guess shakes the row it was typed in (components/WordleBoard.tsx).
  const refuse = useCallback((why: string) => {
    setNotice(why);
    setRefusals((n) => n + 1);
    haptic('wrong');
  }, []);

  const submit = useCallback(async () => {
    if (!battle?.me || !active || busy) return;
    const letters = Array.from(current);
    if (letters.length !== battle.targetLength) {
      refuse(t('games.wordle.enterLetters', { count: battle.targetLength }));
      return;
    }
    setBusy(true);
    setNotice(null);
    const res = await client.post<BattleState>(`/wordle/battles/${id}/guesses`, { word: current });
    setBusy(false);
    if (res.ok) {
      setBattle(res.data);
      setCurrent('');
      // This guess finished your board: found, or out of tries.
      const after = res.data.me;
      if (after && (after.solved || after.status !== 'playing')) {
        haptic(after.solved ? 'correct' : 'wrong');
        hold(res.data.targetLength, after.solved);
      }
    } else {
      refuse(guessMsg(res.error, t));
    }
  }, [client, id, battle, active, busy, current, t, refuse, hold]);

  const press = useCallback(
    (key: string) => {
      // While a guess is judged the keys are ignored, not dimmed.
      if (!active || busy) return;
      setNotice(null);
      if (key === 'Enter') return void submit();
      if (key === 'Backspace') return setCurrent((c) => Array.from(c).slice(0, -1).join(''));
      setCurrent((c) => (battle && Array.from(c).length >= battle.targetLength ? c : c + key));
    },
    [active, busy, submit, battle],
  );

  useWordleKeys(active, press);

  async function join(): Promise<void> {
    setBusy(true);
    const res = await client.post<BattleState>(`/wordle/battles/${id}/join`);
    setBusy(false);
    if (res.ok) setBattle(res.data);
    // Full, started, or not theirs to join, said as every game says it.
    else setNotice(playError(res.error, t));
  }

  async function start(): Promise<void> {
    setBusy(true);
    const res = await client.post<BattleState>(`/wordle/battles/${id}/start`);
    setBusy(false);
    if (res.ok) setBattle(res.data);
    else setNotice(describeError(res.error, t));
  }

  async function remove(seat: number): Promise<void> {
    const res = await client.post<BattleState>(`/wordle/battles/${id}/remove`, { seat });
    if (res.ok) setBattle(res.data);
    else setNotice(describeError(res.error, t));
  }

  async function leave(): Promise<void> {
    await client.post(`/wordle/battles/${id}/leave`);
    navigate('/app/games');
  }

  if (gone) return <RoomUnavailable why={gone} newPath="/app/games/peyvok-battle" newLabel={t('games.battle.new')} />;
  if (error && !battle) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!battle) return <Loading />;
  if (battle.status === 'cancelled') {
    return <RoomUnavailable why="cancelled" newPath="/app/games/peyvok-battle" newLabel={t('games.battle.new')} />;
  }

  const present = battle.players.filter((p) => !p.gone);
  const playerCount = present.length;
  const room = Math.max(0, battle.maxPlayers - playerCount);

  // ---- Lobby ----
  if (battle.status === 'lobby') {
    return (
      <div className="match-lobby match-room">
        {/* The code anyone can be told, and Invite friends for friends on Hevalo. */}
        <CodeTicket
          game="wordle-battle"
          code={battle.code}
          access={battle.access}
          invite={battle.isHost ? <InviteFriendsButton game="wordle-battle" lobbyId={id} room={room} /> : undefined}
        />
        <LobbyRoster players={battle.players} max={battle.maxPlayers} canRemove={battle.isHost} onRemove={remove} game="wordle-battle" gameId={battle.id} />
        {/* Rated or Friendly: seen before joining, changed by the host here. */}
        <LobbyRated
          game="wordle-battle"
          lobbyId={id}
          state={battle.rated}
          isHost={battle.isHost}
          member={battle.me != null}
          playerCount={playerCount}
          seatName={(seat) => {
            const p = battle.players.find((x) => x.seat === seat);
            return p ? seatName(p, t) : t('stories.game.playerN', { seat });
          }}
        />
        {battle.isHost && <InvitedList game="wordle-battle" lobbyId={id} room={room} headingLevel={2} />}
        {notice && <div className="wordle-notice" role="status">{notice}</div>}
        {battle.me == null ? (
          <Button size="lg" disabled={busy} onClick={() => void join()}>
            {busy ? t('games.joining') : t('games.battle.join')}
          </Button>
        ) : battle.isHost ? (
          <Button size="lg" disabled={busy || playerCount < 2} onClick={() => void start()}>
            {playerCount < 2 ? t('games.waitingForPlayer') : busy ? t('games.starting') : t('games.battle.start')}
          </Button>
        ) : (
          <p className="muted">{t('games.waitingForHost')}</p>
        )}
        {battle.me != null && <LeaveLobby isHost={battle.isHost} onLeave={leave} />}
      </div>
    );
  }

  // ---- Results ----
  if (battle.status === 'finished') {
    const mine = results?.ranking.find((r) => r.isMe);
    const others = results?.ranking.filter((r) => !r.isMe) ?? [];
    return (
      <div className="match-results">
        <h2 className="match-verdict">
          {mine?.rank === 1 && <TrophyIcon size={26} className="verdict-icon" />}
          {mine?.rank === 1 ? t('games.youWon') : mine?.solved ? t('games.battle.solvedIt') : t('games.battle.over')}
        </h2>
        {battle.rated && <RatedBadge rated={shownRated(battle.rated)} size="sm" className="match-rated" />}
        {/* What the game did to your rank, then the badges it earned. */}
        {battle.me != null && <RankResult game="wordle-battle" gameRef={battle.id} />}
        {results && (
          <>
            <p className="muted">{t('games.wordle.theWordWas', { word: results.target })}</p>
            {/* The word everyone raced for and its meaning: what a battle teaches. */}
            <WordMeaningLine word={results.target} meanings={results.meanings} />
            <RankList>
              {results.ranking.map((r) => {
                const me = r.isMe;
                return (
                  <RankRow
                    key={r.seat}
                    rank={r.rank}
                    name={seatName(r, t)}
                    avatarUrl={me ? myAvatar : r.avatarUrl}
                    me={me}
                    score={
                      r.solved
                        ? t('games.battle.solvedIn', { count: r.guessCount })
                        : t('games.battle.lettersProgress', { done: r.progress, total: results.target.length })
                    }
                    trailing={
                      <>
                        {r.xpAwarded ? <span className="rank-xp">+{r.xpAwarded} XP</span> : null}
                        {/* Another player, reported by seat; the page never has their account. */}
                        {!me && <PlayerReport game="wordle-battle" gameId={battle.id} seat={r.seat} name={seatName(r, t)} />}
                      </>
                    }
                  />
                );
              })}
            </RankList>
          </>
        )}
        {battle.me != null && (
          <RematchPanel
            game="wordle-battle"
            lobbyId={id}
            otherName={others[0] ? seatName(others[0], t) : t('games.opponent')}
            isHost={battle.isHost}
          />
        )}
        <Link to="/app/games/peyvok-battle" className="btn btn-ghost">{t('games.battle.new')}</Link>
      </div>
    );
  }

  // ---- Active ----
  const me = battle.me;
  return (
    <div className="wordle-battle-play">
      {battle.rated && <RatedBadge rated={shownRated(battle.rated)} size="sm" className="match-rated" />}
      {/* The same chips the front page draws above its battle: you, and how close everyone else is. */}
      {battle.opponents.length > 0 && (
        <div className="players battle-players">
          {me && (
            <PlayerChip
              name={t('games.you')}
              avatarUrl={myAvatar}
              done={me.solved}
              status={
                me.solved
                  ? t('games.battle.solvedIn', { count: me.guesses.length })
                  : t('games.battle.opponentGuesses', { count: me.guesses.length })
              }
            />
          )}
          {battle.opponents.map((o, i) => {
            // The name the server lets this viewer see, else "Opponent (N)"; the ⋯ says the same.
            const name = o.name ?? (battle.opponents.length > 1 ? t('games.battle.opponentNumbered', { n: i + 1 }) : t('games.opponent'));
            return (
              <PlayerChip
                key={o.seat}
                name={name}
                avatarUrl={o.avatarUrl}
                done={o.solved}
                progress={o.progress / battle.targetLength}
                action={<PlayerReport game="wordle-battle" gameId={battle.id} seat={o.seat} name={name} />}
                status={
                  o.solved
                    ? t('games.battle.opponentSolved')
                    : o.finished || o.gone
                      ? t('games.battle.opponentDone')
                      : `${t('games.battle.opponentGuesses', { count: o.guessCount })} · ${t('games.battle.lettersProgress', { done: o.progress, total: battle.targetLength })}`
                }
              />
            );
          })}
        </div>
      )}

      {me && (
        <>
          <WordleBoard
            targetLength={battle.targetLength}
            guesses={me.guesses}
            current={current}
            totalRows={me.guesses.length + me.remainingAttempts}
            showCurrent={active}
            refusals={refusals}
          />
          {notice && <div className="wordle-notice" role="status">{notice}</div>}
          {!active && !revealing && (
            <div className="wordle-result">
              <p className="wordle-result-title">
                {me.solved && <TrophyIcon size={22} className="verdict-icon" />}
                {me.solved ? t('games.battle.youSolvedWaiting') : t('games.battle.noTriesWaiting')}
              </p>
            </div>
          )}
          <WordleKeyboard keyboard={me.keyboard} onPress={press} disabled={!active} />
        </>
      )}
    </div>
  );
}
