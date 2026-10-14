import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { RhymeResult } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { ArrowIcon } from '../components/icons';
import { useRail } from '../social/RailProvider';
import { PlayerChip } from '../ui/PlayerChip';
import { RankList, RankRow } from '../ui/RankRow';
import { useTypeOnly } from '../components/typeOnly';
import { buildInviteUrl } from '../lib/gameInvites';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { InviteForm } from '../play/InviteSheet';
import { InviteFriendsButton, InvitedList } from '../play/LobbyInvites';
import { LeaveLobby, LobbyRoster, RoomUnavailable, seatName, type RoomGone, type SeatPlayer } from '../play/GameRoom';
import { RematchPanel } from '../play/RematchPanel';
import { useLobbyUpdates } from '../play/usePlay';
import { playError } from '../play/playApi';
import { useQuietInvites } from '../play/quietInvites';
import { PlayerReport } from '../reports/PlayerReport';

type Dialect = 'kurmanci' | 'sorani';

interface ScoreEntry {
  /** yours on your own entry, `seat:N` on everyone else's */
  userId: string;
  seat: number;
  /** only when this viewer may see it (a friend, or an open match) */
  name: string | null;
  avatarUrl: string | null;
  score: number;
  accepted: number;
  gone: boolean;
}
interface MatchState {
  id: string;
  status: 'lobby' | 'active' | 'finished' | 'cancelled';
  dialect: Dialect;
  prompt: string | null;
  windowMs: number;
  remainingMs: number;
  maxPlayers: number;
  createdBy: string;
  isHost: boolean;
  /** everyone in it, by seat, as this viewer may see them */
  players: SeatPlayer[];
  me: { seat: number; score: number; accepted: number; usedWords: string[] } | null;
  scoreboard: ScoreEntry[];
}
interface MatchResults {
  prompt: string;
  dialect: Dialect;
  ranking: Array<{
    userId: string;
    seat: number;
    name: string | null;
    avatarUrl: string | null;
    isMe: boolean;
    rank: number;
    score: number;
    accepted: number;
    xpAwarded: number | null;
  }>;
}

const REJECT_KEY: Record<string, MessageKey> = {
  'not-a-word': 'games.rhyme.reject.notAWord',
  'is-prompt': 'games.rhyme.reject.isPromptShort',
  'already-used': 'games.rhyme.reject.alreadyUsed',
  'no-rhyme': 'games.rhyme.reject.noRhyme',
  profane: 'games.rhyme.reject.profane',
};

/** Rhyme Match (KUR-299): head-to-head timed rhyming. Create → share → play. */
export function RhymeMatch(): React.JSX.Element {
  const [params] = useSearchParams();
  const t = useT();
  const id = params.get('id');
  return (
    <div className="container game-page">
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label={t('games.back')}>
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">{t('nav.games')}</span>
          <h1 className="page-title" style={{ margin: 0 }}>{t('games.rhymeMatch.name')}</h1>
        </div>
      </div>
      {id ? <MatchRoom key={id} id={id} /> : <CreateMatch />}
    </div>
  );
}

/**
 * A new match: its variety and the friends to ask, in one step — the invite
 * sheet's form, in place (play/InviteSheet).
 */
function CreateMatch(): React.JSX.Element {
  const t = useT();
  return (
    <div className="match-lobby match-create">
      <p className="page-sub">{t('games.rhymeMatch.intro')}</p>
      <InviteForm target={{ kind: 'new', game: 'rhyme-match' }} lockGame heading={false} />
    </div>
  );
}

function MatchRoom({ id }: { id: string }): React.JSX.Element {
  const { client } = useAuth();
  const myAvatar = useRail().data.you?.avatarUrl ?? null;
  const t = useT();
  const navigate = useNavigate();
  const [match, setMatch] = useState<MatchState | null>(null);
  const [results, setResults] = useState<MatchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<RoomGone | null>(null);
  const [word, setWord] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [found, setFound] = useState<Array<{ word: string; quality: RhymeResult['quality']; points: number }>>([]);
  const { handlers: typeOnly, notice: pasteNotice } = useTypeOnly(t('games.rhyme.noPasting'));
  const loadedOnce = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await client.get<MatchState>(`/rhyme/matches/${id}`);
    if (res.ok) {
      setMatch(res.data);
      setRemaining(res.data.remainingMs);
      setGone(null);
      loadedOnce.current = true;
    } else if (res.error.code === 'GAME_STARTED') {
      // a latecomer: the match is running without them — not "time's up"
      setGone('started');
    } else if (res.error.status === 404) {
      setGone('gone');
    } else if (!loadedOnce.current) {
      setError(describeError(res.error, t));
    }
  }, [client, id]);

  useEffect(() => {
    void load();
  }, [load]);

  // `play_changed` brings the lobby and the scoreboard; a slow read covers a missed event
  const live = match?.status === 'lobby' || match?.status === 'active';
  useLobbyUpdates('rhyme-match', id, load, live && gone === null);

  useEffect(() => {
    if (match?.status === 'finished' && !results) {
      void client.get<MatchResults>(`/rhyme/matches/${id}/results`).then((r) => {
        if (r.ok) setResults(r.data);
      });
    }
  }, [match?.status, results, client, id]);

  // local countdown between reads (resynced on each load/submit)
  const active = match?.status === 'active' && match.me != null && remaining > 0;
  // while matching, an invite to something else waits as a chip
  useQuietInvites(active);
  useEffect(() => {
    if (match?.status !== 'active') return;
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((ms) => Math.max(0, ms - 200)), 200);
    return () => clearTimeout(timer);
  }, [remaining, match?.status]);

  // the window closed here: the server ends the match on its next read, and
  // says so — ask once, rather than wait for the slow safety read
  const timeUp = match?.status === 'active' && remaining <= 0;
  useEffect(() => {
    if (!timeUp) return;
    const timer = setTimeout(() => void load(), 1500);
    return () => clearTimeout(timer);
  }, [timeUp, load]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const w = word.trim();
    if (!w || !active || busy) return;
    setBusy(true);
    setNotice(null);
    const res = await client.post<{ match: MatchState; result: RhymeResult }>(`/rhyme/matches/${id}/submissions`, { word: w });
    setBusy(false);
    if (res.ok) {
      setMatch(res.data.match);
      setRemaining(res.data.match.remainingMs);
      setWord('');
      const { result } = res.data;
      if (result.accepted) setFound((f) => [{ word: result.normalized, quality: result.quality, points: result.points }, ...f]);
      else setNotice(t(REJECT_KEY[result.reason ?? ''] ?? 'games.rhyme.reject.other'));
      inputRef.current?.focus();
    } else {
      setNotice(res.error.code === 'NOT_ACTIVE' ? t('games.rhymeMatch.timeUpMatch') : describeError(res.error, t));
    }
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildInviteUrl('rhyme-match', id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice(t('games.copyFailed'));
    }
  }

  async function join(): Promise<void> {
    setBusy(true);
    const res = await client.post<MatchState>(`/rhyme/matches/${id}/join`);
    setBusy(false);
    if (res.ok) setMatch(res.data);
    // full, started, or not theirs to join: said as every game says it
    else setNotice(playError(res.error, t));
  }
  async function start(): Promise<void> {
    setBusy(true);
    const res = await client.post<MatchState>(`/rhyme/matches/${id}/start`);
    setBusy(false);
    if (res.ok) {
      setMatch(res.data);
      setRemaining(res.data.remainingMs);
    } else setNotice(describeError(res.error, t));
  }
  async function remove(seat: number): Promise<void> {
    const res = await client.post<MatchState>(`/rhyme/matches/${id}/remove`, { seat });
    if (res.ok) setMatch(res.data);
    else setNotice(describeError(res.error, t));
  }
  async function leave(): Promise<void> {
    await client.post(`/rhyme/matches/${id}/leave`);
    navigate('/app/games');
  }

  if (gone) return <RoomUnavailable why={gone} newPath="/app/games/rhyme-match" newLabel={t('games.rhymeMatch.new')} />;
  if (error && !match) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!match) return <Loading />;
  if (match.status === 'cancelled') {
    return <RoomUnavailable why="cancelled" newPath="/app/games/rhyme-match" newLabel={t('games.rhymeMatch.new')} />;
  }

  const playerCount = match.players.filter((p) => !p.gone).length;
  const room = Math.max(0, match.maxPlayers - playerCount);
  const seconds = Math.ceil(remaining / 1000);

  if (match.status === 'lobby') {
    return (
      <div className="match-lobby match-room">
        <div className="battle-invite">
          <span className="battle-invite-label">{t('games.inviteLink')}</span>
          <code className="battle-invite-url">{buildInviteUrl('rhyme-match', id)}</code>
          <Button size="sm" onClick={() => void copyLink()}>{copied ? t('games.copied') : t('games.copyLink')}</Button>
          {match.isHost && <InviteFriendsButton game="rhyme-match" lobbyId={id} room={room} />}
        </div>
        <LobbyRoster players={match.players} max={match.maxPlayers} canRemove={match.isHost} onRemove={remove} game="rhyme-match" gameId={id} />
        {match.isHost && <InvitedList game="rhyme-match" lobbyId={id} room={room} headingLevel={2} />}
        {notice && <div className="wordle-notice" role="status">{notice}</div>}
        {match.me == null ? (
          <Button size="lg" disabled={busy} onClick={() => void join()}>
            {busy ? t('games.joining') : t('games.rhymeMatch.join')}
          </Button>
        ) : match.isHost ? (
          <Button size="lg" disabled={busy || playerCount < 2} onClick={() => void start()}>
            {playerCount < 2 ? t('games.waitingForPlayer') : busy ? t('games.starting') : t('games.rhymeMatch.start')}
          </Button>
        ) : (
          <p className="muted">{t('games.waitingForHost')}</p>
        )}
        {match.me != null && <LeaveLobby isHost={match.isHost} onLeave={leave} />}
      </div>
    );
  }

  if (match.status === 'finished') {
    const mine = results?.ranking.find((r) => r.isMe);
    const others = results?.ranking.filter((r) => !r.isMe) ?? [];
    return (
      <div className="match-results">
        <h2 className="match-verdict">{mine?.rank === 1 ? t('games.youWon') : t('games.rhymeMatch.over')}</h2>
        {results && (
          <>
            <p className="muted">{t('games.rhymeMatch.promptWas', { word: results.prompt })}</p>
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
                    score={t('games.rhymeMatch.playerScore', { score: r.score, count: r.accepted })}
                    trailing={
                      <>
                        {r.xpAwarded ? <span className="rank-xp">+{r.xpAwarded} XP</span> : null}
                        {/* another player, reported by seat — the page never has their account */}
                        {!me && <PlayerReport game="rhyme-match" gameId={id} seat={r.seat} name={seatName(r, t)} />}
                      </>
                    }
                  />
                );
              })}
            </RankList>
          </>
        )}
        {match.me != null && (
          <RematchPanel
            game="rhyme-match"
            lobbyId={id}
            otherName={others[0] ? seatName(others[0], t) : t('games.opponent')}
            isHost={match.isHost}
          />
        )}
        <Link to="/app/games/rhyme-match" className="btn btn-ghost">{t('games.rhymeMatch.new')}</Link>
      </div>
    );
  }

  // active
  return (
    <div className="match-play">
      <div className="rhyme-stage">
        <div className="rhyme-prompt-box">
          <span className="rhyme-label">{t('games.rhyme.rhymeWith')}</span>
          <span className="rhyme-prompt">{match.prompt}</span>
        </div>
        <div className="rhyme-meters">
          <div className={`rhyme-timer${seconds <= 5 && active ? ' low' : ''}`} aria-label={t('games.timeLeft')}>{seconds}s</div>
        </div>
      </div>

      <div className="players">
        {match.scoreboard.map((s) => {
          const me = match.me?.seat === s.seat;
          return (
            <PlayerChip
              key={s.seat}
              name={me ? t('games.you') : (s.name ?? t('games.opponent'))}
              avatarUrl={me ? myAvatar : s.avatarUrl}
              status={t('games.rhymeMatch.playerScore', { score: s.score, count: s.accepted })}
              action={!me && <PlayerReport game="rhyme-match" gameId={id} seat={s.seat} name={s.name} />}
            />
          );
        })}
      </div>

      {active ? (
        <form className="rhyme-compose" onSubmit={submit}>
          {/* against another person, a pasted rhyme is somebody else's point */}
          <input
            ref={inputRef}
            className="input"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder={t('games.rhyme.placeholder', { word: match.prompt ?? '' })}
            maxLength={64}
            aria-label={t('games.rhyme.yourRhyme')}
            autoFocus
            {...typeOnly}
          />
          <Button type="submit" disabled={busy || word.trim().length === 0}>{busy ? '…' : t('games.submit')}</Button>
        </form>
      ) : (
        <p className="muted" style={{ textAlign: 'center' }}>{t('games.rhymeMatch.timeUpFinishing')}</p>
      )}

      {/* one slot: a refused paste is the more urgent of the two to answer */}
      {(pasteNotice ?? notice) && (
        <div className="wordle-notice" role="status">
          {pasteNotice ?? notice}
        </div>
      )}

      {found.length > 0 && (
        <ul className="rhyme-found" aria-label={t('games.rhyme.foundList')}>
          {found.map((f, i) => (
            <li key={`${f.word}-${i}`} className={`rhyme-chip rhyme-${f.quality}`}>
              <span>{f.word}</span>
              <span className="rhyme-pts">+{f.points}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
