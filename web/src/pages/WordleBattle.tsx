import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, WordleGuessRow, LetterFeedback } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { ArrowIcon } from '../components/icons';
import { WordleBoard, WordleKeyboard, KURMANCI_LETTER_RE } from '../components/WordleBoard';
import { buildInviteUrl } from '../lib/gameInvites';

type Difficulty = 'easy' | 'medium' | 'hard';
type GameStatus = 'playing' | 'won' | 'lost';

interface OpponentView {
  userId: string;
  guessCount: number;
  solved: boolean;
  status: GameStatus;
  progress: number;
  finished: boolean;
}
interface BattleState {
  id: string;
  status: 'lobby' | 'active' | 'finished';
  difficulty: Difficulty;
  targetLength: number;
  maxPlayers: number;
  createdBy: string;
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
  difficulty: Difficulty;
  ranking: Array<{ userId: string; rank: number; solved: boolean; guessCount: number; progress: number; xpAwarded: number | null }>;
}

function guessMsg(err: ApiError): string {
  switch (err.code) {
    case 'WRONG_LENGTH':
      return 'That guess is the wrong length.';
    case 'NOT_A_WORD':
      return 'Not a word in the dictionary — try another.';
    default:
      return describeError(err);
  }
}

/** Wordle Battle (KUR-306): race the same word. Create → share link → play. */
export function WordleBattle(): React.JSX.Element {
  const [params] = useSearchParams();
  const id = params.get('id');
  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 72 }}>
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label="Back to games">
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">Yarî · Wordle Battle</span>
          <h1 className="page-title" style={{ margin: 0 }}>Wordle Battle</h1>
        </div>
      </div>
      {id ? <BattleRoom key={id} id={id} /> : <CreateBattle />}
    </div>
  );
}

function CreateBattle(): React.JSX.Element {
  const { client } = useAuth();
  const navigate = useNavigate();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(): Promise<void> {
    setBusy(true);
    setErr(null);
    const res = await client.post<BattleState>('/wordle/battles', { difficulty });
    setBusy(false);
    if (res.ok) navigate(`/app/games/wordle-battle?id=${res.data.id}`);
    else setErr(res.error.code === 'EMPTY_POOL' ? 'No words available for play yet — check back soon.' : describeError(res.error));
  }

  return (
    <div className="quiz-lobby">
      <p className="page-sub">Create a battle, share the invite link with a friend, and race to guess the same Kurdish word first.</p>
      {err && <div className="wordle-notice">{err}</div>}
      <div className="chat-tabs" role="tablist" aria-label="Difficulty">
        {(['easy', 'medium', 'hard'] as const).map((d) => (
          <button key={d} role="tab" aria-selected={difficulty === d} className={`chip${difficulty === d ? ' active' : ''}`} onClick={() => setDifficulty(d)}>
            {d.charAt(0).toUpperCase() + d.slice(1)}
          </button>
        ))}
      </div>
      <Button size="lg" disabled={busy} onClick={() => void create()}>
        {busy ? 'Creating…' : 'Create battle'}
      </Button>
    </div>
  );
}

function BattleRoom({ id }: { id: string }): React.JSX.Element {
  const { client, user } = useAuth();
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [results, setResults] = useState<BattleResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    const res = await client.get<BattleState>(`/wordle/battles/${id}`);
    if (res.ok) {
      setBattle(res.data);
      loadedOnce.current = true;
    } else if (!loadedOnce.current) {
      setError(describeError(res.error));
    }
  }, [client, id]);

  // poll while not finished (opponent progress + lobby joins); realtime push is
  // an optional extra the backend may add later on top of these same endpoints
  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (battle?.status !== 'finished') void load();
    }, 1800);
    return () => clearInterval(t);
  }, [load, battle?.status]);

  useEffect(() => {
    if (battle?.status === 'finished' && !results) {
      void client.get<BattleResults>(`/wordle/battles/${id}/results`).then((r) => {
        if (r.ok) setResults(r.data);
      });
    }
  }, [battle?.status, results, client, id]);

  const active = battle?.status === 'active' && battle.me != null && battle.me.status === 'playing' && !battle.me.solved;

  const submit = useCallback(async () => {
    if (!battle?.me || !active || busy) return;
    const letters = Array.from(current);
    if (letters.length !== battle.targetLength) {
      setNotice(`Enter ${battle.targetLength} letters.`);
      return;
    }
    setBusy(true);
    setNotice(null);
    const res = await client.post<BattleState>(`/wordle/battles/${id}/guesses`, { word: current });
    setBusy(false);
    if (res.ok) {
      setBattle(res.data);
      setCurrent('');
    } else {
      setNotice(guessMsg(res.error));
    }
  }, [client, id, battle, active, busy, current]);

  const press = useCallback(
    (key: string) => {
      if (!active) return;
      setNotice(null);
      if (key === 'Enter') return void submit();
      if (key === 'Backspace') return setCurrent((c) => Array.from(c).slice(0, -1).join(''));
      setCurrent((c) => (battle && Array.from(c).length >= battle.targetLength ? c : c + key));
    },
    [active, submit, battle],
  );

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') return press('Enter');
      if (e.key === 'Backspace') return press('Backspace');
      const k = e.key.toLowerCase();
      if (KURMANCI_LETTER_RE.test(k)) press(k);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, press]);

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildInviteUrl('wordle-battle', id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice('Couldn’t copy — long-press the link to share it.');
    }
  }

  async function join(): Promise<void> {
    setBusy(true);
    const res = await client.post<BattleState>(`/wordle/battles/${id}/join`);
    setBusy(false);
    if (res.ok) setBattle(res.data);
    else setNotice(describeError(res.error));
  }

  async function start(): Promise<void> {
    setBusy(true);
    const res = await client.post<BattleState>(`/wordle/battles/${id}/start`);
    setBusy(false);
    if (res.ok) setBattle(res.data);
    else setNotice(describeError(res.error));
  }

  if (error && !battle) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!battle) return <Loading />;

  const playerCount = (battle.me ? 1 : 0) + battle.opponents.length;
  const isHost = battle.createdBy === user?.id;

  // ---- lobby ----
  if (battle.status === 'lobby') {
    return (
      <div className="quiz-lobby">
        <p>Waiting in the lobby — {playerCount} player{playerCount === 1 ? '' : 's'} joined.</p>
        <div className="battle-invite">
          <span className="battle-invite-label">Invite link</span>
          <code className="battle-invite-url">{buildInviteUrl('wordle-battle', id)}</code>
          <Button size="sm" onClick={() => void copyLink()}>{copied ? 'Copied!' : 'Copy link'}</Button>
        </div>
        {notice && <div className="wordle-notice">{notice}</div>}
        {battle.me == null ? (
          <Button size="lg" disabled={busy} onClick={() => void join()}>{busy ? 'Joining…' : 'Join battle'}</Button>
        ) : isHost ? (
          <Button size="lg" disabled={busy || playerCount < 2} onClick={() => void start()}>
            {playerCount < 2 ? 'Waiting for a second player…' : busy ? 'Starting…' : 'Start battle'}
          </Button>
        ) : (
          <p className="muted">Waiting for the host to start…</p>
        )}
      </div>
    );
  }

  // ---- results ----
  if (battle.status === 'finished') {
    const mine = results?.ranking.find((r) => r.userId === user?.id);
    return (
      <div className="quiz-results">
        <h2 className="quiz-verdict">{mine?.rank === 1 ? '🏆 You won!' : mine?.solved ? 'Solved it!' : 'Battle over.'}</h2>
        {results && (
          <>
            <p className="muted">The word was <strong>{results.target}</strong>.</p>
            <ol className="quiz-scoreboard">
              {results.ranking.map((r) => (
                <li key={r.userId} className={`quiz-scoreline${r.userId === user?.id ? ' me' : ''}`}>
                  <span className="quiz-rank">{r.rank}</span>
                  <span className="quiz-name">{r.userId === user?.id ? 'You' : 'Opponent'}</span>
                  <span className="quiz-pts">{r.solved ? `solved in ${r.guessCount}` : `${r.progress}/${results.target.length} letters`}</span>
                  {r.xpAwarded ? <span className="quiz-xp">+{r.xpAwarded} XP</span> : null}
                </li>
              ))}
            </ol>
          </>
        )}
        <Link to="/app/games/wordle-battle" className="btn btn-primary">New battle</Link>
      </div>
    );
  }

  // ---- active ----
  const me = battle.me;
  return (
    <div className="wordle-battle-play">
      {battle.opponents.length > 0 && (
        <div className="battle-opponents">
          {battle.opponents.map((o, i) => (
            <div className="battle-opp" key={o.userId}>
              <span className="battle-opp-name">Opponent {battle.opponents.length > 1 ? i + 1 : ''}</span>
              <div className="battle-bar" aria-label="Opponent progress">
                <div className="battle-bar-fill" style={{ width: `${Math.round((o.progress / battle.targetLength) * 100)}%` }} />
              </div>
              <span className="battle-opp-status">{o.solved ? '✓ solved' : o.finished ? 'done' : `${o.guessCount} guesses`}</span>
            </div>
          ))}
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
          />
          {notice && <div className="wordle-notice" role="status">{notice}</div>}
          {!active && (
            <div className="wordle-result">
              <p className="wordle-result-title">
                {me.solved ? '🎉 You solved it! Waiting for the others…' : 'No tries left — waiting for the battle to finish…'}
              </p>
            </div>
          )}
          <WordleKeyboard keyboard={me.keyboard} onPress={press} disabled={!active || busy} />
        </>
      )}
    </div>
  );
}
