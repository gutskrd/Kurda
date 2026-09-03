import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { RhymeResult } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { ArrowIcon } from '../components/icons';
import { buildInviteUrl } from '../lib/gameInvites';

type Dialect = 'kurmanci' | 'sorani';

interface ScoreEntry {
  userId: string;
  score: number;
  accepted: number;
}
interface MatchState {
  id: string;
  status: 'lobby' | 'active' | 'finished';
  dialect: Dialect;
  prompt: string | null;
  windowMs: number;
  remainingMs: number;
  maxPlayers: number;
  createdBy: string;
  me: { score: number; accepted: number; usedWords: string[] } | null;
  scoreboard: ScoreEntry[];
}
interface MatchResults {
  prompt: string;
  dialect: Dialect;
  ranking: Array<{ userId: string; rank: number; score: number; accepted: number; xpAwarded: number | null }>;
}

const REJECT_COPY: Record<string, string> = {
  'not-a-word': 'Not a word in the dictionary.',
  'is-prompt': 'That’s the prompt itself.',
  'already-used': 'You already used that one.',
  'no-rhyme': 'Doesn’t rhyme — try another.',
  profane: 'Let’s keep it clean.',
};

/** Rhyme Match (KUR-299): head-to-head timed rhyming. Create → share → play. */
export function RhymeMatch(): React.JSX.Element {
  const [params] = useSearchParams();
  const id = params.get('id');
  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 72 }}>
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label="Back to games">
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">Yarî · Rhyme Match</span>
          <h1 className="page-title" style={{ margin: 0 }}>Rhyme Match</h1>
        </div>
      </div>
      {id ? <MatchRoom key={id} id={id} /> : <CreateMatch />}
    </div>
  );
}

function CreateMatch(): React.JSX.Element {
  const { client } = useAuth();
  const navigate = useNavigate();
  const [dialect, setDialect] = useState<Dialect>('kurmanci');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(): Promise<void> {
    setBusy(true);
    setErr(null);
    const res = await client.post<MatchState>('/rhyme/matches', { dialect });
    setBusy(false);
    if (res.ok) navigate(`/app/games/rhyme-match?id=${res.data.id}`);
    else setErr(res.error.code === 'EMPTY_LEXICON' ? 'No words available for play yet — check back soon.' : describeError(res.error));
  }

  return (
    <div className="quiz-lobby">
      <p className="page-sub">Create a match, share the invite link, and race a friend to find the most rhymes for one prompt before the clock runs out.</p>
      {err && <div className="wordle-notice">{err}</div>}
      <div className="chat-tabs" role="tablist" aria-label="Dialect">
        {(['kurmanci', 'sorani'] as const).map((d) => (
          <button key={d} role="tab" aria-selected={dialect === d} className={`chip${dialect === d ? ' active' : ''}`} onClick={() => setDialect(d)}>
            {d === 'kurmanci' ? 'Kurmancî' : 'Soranî'}
          </button>
        ))}
      </div>
      <Button size="lg" disabled={busy} onClick={() => void create()}>
        {busy ? 'Creating…' : 'Create match'}
      </Button>
    </div>
  );
}

function MatchRoom({ id }: { id: string }): React.JSX.Element {
  const { client, user } = useAuth();
  const [match, setMatch] = useState<MatchState | null>(null);
  const [results, setResults] = useState<MatchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [word, setWord] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [found, setFound] = useState<Array<{ word: string; quality: RhymeResult['quality']; points: number }>>([]);
  const loadedOnce = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await client.get<MatchState>(`/rhyme/matches/${id}`);
    if (res.ok) {
      setMatch(res.data);
      setRemaining(res.data.remainingMs);
      loadedOnce.current = true;
    } else if (!loadedOnce.current) {
      setError(describeError(res.error));
    }
  }, [client, id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (match?.status !== 'finished') void load();
    }, 1500);
    return () => clearInterval(t);
  }, [load, match?.status]);

  useEffect(() => {
    if (match?.status === 'finished' && !results) {
      void client.get<MatchResults>(`/rhyme/matches/${id}/results`).then((r) => {
        if (r.ok) setResults(r.data);
      });
    }
  }, [match?.status, results, client, id]);

  // local countdown between polls (resynced on each load/submit)
  const active = match?.status === 'active' && match.me != null && remaining > 0;
  useEffect(() => {
    if (match?.status !== 'active') return;
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining((ms) => Math.max(0, ms - 200)), 200);
    return () => clearTimeout(t);
  }, [remaining, match?.status]);

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
      else setNotice(REJECT_COPY[result.reason ?? ''] ?? 'Not accepted — try another.');
      inputRef.current?.focus();
    } else {
      setNotice(res.error.code === 'NOT_ACTIVE' ? 'Time’s up for this match.' : describeError(res.error));
    }
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildInviteUrl('rhyme-match', id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice('Couldn’t copy — long-press the link to share it.');
    }
  }

  async function join(): Promise<void> {
    setBusy(true);
    const res = await client.post<MatchState>(`/rhyme/matches/${id}/join`);
    setBusy(false);
    if (res.ok) setMatch(res.data);
    else setNotice(describeError(res.error));
  }
  async function start(): Promise<void> {
    setBusy(true);
    const res = await client.post<MatchState>(`/rhyme/matches/${id}/start`);
    setBusy(false);
    if (res.ok) setMatch(res.data);
    else setNotice(describeError(res.error));
  }

  if (error && !match) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!match) return <Loading />;

  const playerCount = match.scoreboard.length || (match.me ? 1 : 0);
  const isHost = match.createdBy === user?.id;
  const seconds = Math.ceil(remaining / 1000);

  if (match.status === 'lobby') {
    return (
      <div className="quiz-lobby">
        <p>Waiting in the lobby — {playerCount} player{playerCount === 1 ? '' : 's'} joined.</p>
        <div className="battle-invite">
          <span className="battle-invite-label">Invite link</span>
          <code className="battle-invite-url">{buildInviteUrl('rhyme-match', id)}</code>
          <Button size="sm" onClick={() => void copyLink()}>{copied ? 'Copied!' : 'Copy link'}</Button>
        </div>
        {notice && <div className="wordle-notice">{notice}</div>}
        {match.me == null ? (
          <Button size="lg" disabled={busy} onClick={() => void join()}>{busy ? 'Joining…' : 'Join match'}</Button>
        ) : isHost ? (
          <Button size="lg" disabled={busy || playerCount < 2} onClick={() => void start()}>
            {playerCount < 2 ? 'Waiting for a second player…' : busy ? 'Starting…' : 'Start match'}
          </Button>
        ) : (
          <p className="muted">Waiting for the host to start…</p>
        )}
      </div>
    );
  }

  if (match.status === 'finished') {
    const mine = results?.ranking.find((r) => r.userId === user?.id);
    return (
      <div className="quiz-results">
        <h2 className="quiz-verdict">{mine?.rank === 1 ? '🏆 You won!' : 'Match over.'}</h2>
        {results && (
          <>
            <p className="muted">Prompt was <strong>{results.prompt}</strong>.</p>
            <ol className="quiz-scoreboard">
              {results.ranking.map((r) => (
                <li key={r.userId} className={`quiz-scoreline${r.userId === user?.id ? ' me' : ''}`}>
                  <span className="quiz-rank">{r.rank}</span>
                  <span className="quiz-name">{r.userId === user?.id ? 'You' : 'Opponent'}</span>
                  <span className="quiz-pts">{r.score} pts · {r.accepted} rhymes</span>
                  {r.xpAwarded ? <span className="quiz-xp">+{r.xpAwarded} XP</span> : null}
                </li>
              ))}
            </ol>
          </>
        )}
        <Link to="/app/games/rhyme-match" className="btn btn-primary">New match</Link>
      </div>
    );
  }

  // active
  return (
    <div className="quiz-match">
      <div className="rhyme-stage">
        <div className="rhyme-prompt-box">
          <span className="rhyme-label">Rhyme with</span>
          <span className="rhyme-prompt">{match.prompt}</span>
        </div>
        <div className="rhyme-meters">
          <div className={`rhyme-timer${seconds <= 5 && active ? ' low' : ''}`} aria-label="Time left">{seconds}s</div>
        </div>
      </div>

      <div className="quiz-live-score">
        {match.scoreboard.map((s) => (
          <span key={s.userId} className={s.userId === user?.id ? 'me' : ''}>
            {s.userId === user?.id ? 'You' : 'Opponent'}: {s.score}
          </span>
        ))}
      </div>

      {active ? (
        <form className="rhyme-compose" onSubmit={submit}>
          <input
            ref={inputRef}
            className="input"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder={`A word that rhymes with “${match.prompt}”…`}
            maxLength={64}
            aria-label="Your rhyme"
            autoFocus
          />
          <Button type="submit" disabled={busy || word.trim().length === 0}>{busy ? '…' : 'Submit'}</Button>
        </form>
      ) : (
        <p className="muted" style={{ textAlign: 'center' }}>Time’s up — finishing the match…</p>
      )}

      {notice && <div className="wordle-notice" role="status">{notice}</div>}

      {found.length > 0 && (
        <ul className="rhyme-found" aria-label="Rhymes you found">
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
