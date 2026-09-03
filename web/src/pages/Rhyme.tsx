import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { RhymeGame, RhymeResult } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { ArrowIcon } from '../components/icons';

type Dialect = 'kurmanci' | 'sorani';

/** A found rhyme, kept for the on-screen list this round. */
interface Found {
  word: string;
  quality: RhymeResult['quality'];
  points: number;
}

const REJECT_COPY: Record<string, string> = {
  'not-a-word': 'Not a word in the dictionary.',
  'is-prompt': 'That’s the prompt itself — find a different word.',
  'already-used': 'You already used that one.',
  'no-rhyme': 'Doesn’t rhyme — try another.',
  profane: 'Let’s keep it clean.',
};

/** Solo Rhyming Words — a timed round; each rhyme is scored server-side. */
export function Rhyme(): React.JSX.Element {
  const { client } = useAuth();
  const [dialect, setDialect] = useState<Dialect>('kurmanci');
  const [game, setGame] = useState<RhymeGame | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emptyLexicon, setEmptyLexicon] = useState(false);
  const [found, setFound] = useState<Found[]>([]);
  const [word, setWord] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = useCallback(async () => {
    setGame(null);
    setLoadError(null);
    setEmptyLexicon(false);
    setFound([]);
    setWord('');
    setNotice(null);
    const res = await client.post<RhymeGame>('/rhyme/training', { dialect });
    if (res.ok) {
      setGame(res.data);
      setRemaining(res.data.remainingMs);
    } else if (res.error.code === 'EMPTY_LEXICON') {
      setEmptyLexicon(true);
    } else {
      setLoadError(describeError(res.error));
    }
  }, [client, dialect]);

  useEffect(() => {
    void start();
  }, [start]);

  const active = game?.status === 'active' && remaining > 0;

  const end = useCallback(async () => {
    if (!game) return;
    const res = await client.post<{ game: RhymeGame }>(`/rhyme/training/${game.id}/end`);
    if (res.ok) setGame(res.data.game);
  }, [client, game]);

  // countdown; when it runs out, finalize the round on the server
  useEffect(() => {
    if (!game || game.status !== 'active') return;
    if (remaining <= 0) {
      void end();
      return;
    }
    const t = setTimeout(() => setRemaining((ms) => Math.max(0, ms - 100)), 100);
    return () => clearTimeout(t);
  }, [remaining, game, end]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const w = word.trim();
    if (!w || !game || !active || busy) return;
    setBusy(true);
    setNotice(null);
    const res = await client.post<{ game: RhymeGame; result: RhymeResult }>(`/rhyme/training/${game.id}/guesses`, { word: w });
    setBusy(false);
    if (res.ok) {
      const { game: g, result } = res.data;
      setGame(g);
      setRemaining(g.remainingMs);
      setWord('');
      if (result.accepted) {
        setFound((f) => [{ word: result.normalized, quality: result.quality, points: result.points }, ...f]);
      } else {
        setNotice(REJECT_COPY[result.reason ?? ''] ?? 'Not accepted — try another.');
      }
      inputRef.current?.focus();
    } else {
      setNotice(res.error.code === 'GAME_OVER' ? 'Time’s up for this round.' : describeError(res.error));
    }
  }

  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 72 }}>
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label="Back to games">
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">Yarî · Rhyming Words</span>
          <h1 className="page-title" style={{ margin: 0 }}>Rhyme</h1>
        </div>
      </div>

      <div className="chat-tabs" role="tablist" aria-label="Dialect" style={{ marginBottom: 8 }}>
        {(['kurmanci', 'sorani'] as const).map((d) => (
          <button key={d} role="tab" aria-selected={dialect === d} className={`chip${dialect === d ? ' active' : ''}`} onClick={() => setDialect(d)}>
            {d === 'kurmanci' ? 'Kurmancî' : 'Soranî'}
          </button>
        ))}
      </div>

      {emptyLexicon ? (
        <div className="wordle-msg">No words available for play yet — check back soon.</div>
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={() => void start()} />
      ) : game === null ? (
        <Loading />
      ) : (
        <>
          <div className="rhyme-stage">
            <div className="rhyme-prompt-box">
              <span className="rhyme-label">Rhyme with</span>
              <span className="rhyme-prompt">{game.prompt}</span>
            </div>
            <div className="rhyme-meters">
              <div className={`rhyme-timer${seconds <= 5 && active ? ' low' : ''}`} aria-label="Time left">
                {seconds}s
              </div>
              <div className="rhyme-score" aria-label="Score">
                {game.score} pts · {game.accepted} found
              </div>
            </div>
          </div>

          {active ? (
            <form className="rhyme-compose" onSubmit={submit}>
              <input
                ref={inputRef}
                className="input"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder={`A word that rhymes with “${game.prompt}”…`}
                maxLength={64}
                aria-label="Your rhyme"
                autoFocus
              />
              <Button type="submit" disabled={busy || word.trim().length === 0}>
                {busy ? '…' : 'Submit'}
              </Button>
            </form>
          ) : (
            <div className="wordle-result">
              <p className="wordle-result-title">
                Round over — {game.score} points, {game.accepted} rhyme{game.accepted === 1 ? '' : 's'}.
                {game.xpAwarded ? <> +{game.xpAwarded} XP</> : null}
              </p>
              <Button onClick={() => void start()}>Play again</Button>
            </div>
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

          {active && (
            <div className="rhyme-actions">
              <Button variant="ghost" size="sm" onClick={() => void end()}>
                End round
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
