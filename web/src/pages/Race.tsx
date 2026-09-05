import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { ErrorState } from '../components/states';
import { ArrowIcon } from '../components/icons';

/**
 * Typing race: reproduce a Kurdish text as fast and as accurately as you can.
 *
 * The clock shown here is for the racer's benefit only. The score comes from
 * the server, which timed the race from when it handed the text over — so what
 * this page displays can never be what counts.
 */

interface RaceGame {
  id: string;
  text: { id: string; title: string; body: string; difficulty: number };
  startedAt: string;
}

interface RaceResult {
  wpm: number;
  accuracy: number;
  score: number;
  correctChars: number;
  perfect: boolean;
  elapsedMs: number;
  xpAwarded: number;
}

const DIFFICULTY = [
  { value: 1, label: 'Short' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Long' },
];

export function Race(): React.JSX.Element {
  const { client } = useAuth();
  const [game, setGame] = useState<RaceGame | null>(null);
  const [difficulty, setDifficulty] = useState(1);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<RaceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const target = game?.text.body ?? '';

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setTyped('');
    const res = await client.post<RaceGame>('/race', { difficulty });
    setBusy(false);
    if (res.ok) {
      setGame(res.data);
      startedAt.current = Date.now();
      setElapsed(0);
      // typing should begin the moment the text appears
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setGame(null);
      setError(describeError(res.error));
    }
  }, [client, difficulty]);

  // a running clock, for the racer — the score is timed server-side
  useEffect(() => {
    if (!game || result) return;
    const t = setInterval(() => {
      if (startedAt.current) setElapsed(Date.now() - startedAt.current);
    }, 100);
    return () => clearInterval(t);
  }, [game, result]);

  const finish = useCallback(async () => {
    if (!game) return;
    setBusy(true);
    const res = await client.post<RaceResult>(`/race/${game.id}/finish`, { typed });
    setBusy(false);
    if (res.ok) setResult(res.data);
    else setError(describeError(res.error));
  }, [client, game, typed]);

  // finishing the text ends the race on its own; nobody should have to notice
  // they are done and reach for a button
  useEffect(() => {
    if (game && !result && typed.length >= target.length && target.length > 0) void finish();
  }, [typed, target.length, game, result, finish]);

  const chars = useMemo(() => [...target], [target]);
  const typedChars = useMemo(() => [...typed], [typed]);
  const progress = target.length === 0 ? 0 : Math.min(typedChars.length / chars.length, 1);

  return (
    <div className="container container-narrow">
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label="Back to games">
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">Pêşbaziya nivîsandinê · Race</span>
          <h1 className="page-title">Typing Race</h1>
        </div>
      </div>

      {!game && (
        <div className="race-lobby">
          <p className="page-sub">
            Type the Kurdish text as fast and as accurately as you can. Your speed is measured by the server
            from the moment the text appears.
          </p>
          <div className="chat-tabs" role="tablist" aria-label="Length">
            {DIFFICULTY.map((d) => (
              <button
                key={d.value}
                role="tab"
                aria-selected={difficulty === d.value}
                className={`chip${difficulty === d.value ? ' active' : ''}`}
                onClick={() => setDifficulty(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <Button onClick={() => void start()} disabled={busy}>
            {busy ? 'Starting…' : 'Start race'}
          </Button>
          {error && <ErrorState message={error} onRetry={() => void start()} />}
        </div>
      )}

      {game && (
        <>
          <div className="race-stats">
            <span className="race-timer">{(elapsed / 1000).toFixed(1)}s</span>
            <div className="race-progress" aria-hidden>
              <div className="race-progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="muted">{game.text.title}</span>
          </div>

          {/* every character coloured as you go, so a mistake is visible at once */}
          <p className="race-text" aria-label="Text to type">
            {chars.map((ch, i) => {
              const t = typedChars[i];
              const state = t === undefined ? '' : t === ch ? ' race-ok' : ' race-bad';
              const cursor = i === typedChars.length ? ' race-cursor' : '';
              return (
                <span key={i} className={`race-char${state}${cursor}`}>
                  {ch}
                </span>
              );
            })}
          </p>

          <textarea
            ref={inputRef}
            className="input race-input"
            rows={3}
            value={typed}
            disabled={!!result}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Start typing…"
            aria-label="Your typing"
          />

          {!result && (
            <div className="race-actions">
              <Button variant="ghost" onClick={() => void finish()} disabled={busy}>
                {busy ? 'Scoring…' : 'Give up and score'}
              </Button>
            </div>
          )}

          {result && (
            <div className="race-result">
              <h2 className="section-heading">{result.perfect ? 'Perfect run!' : 'Race finished'}</h2>
              <div className="race-figures">
                <Figure value={result.wpm.toFixed(1)} label="WPM" />
                <Figure value={`${Math.round(result.accuracy * 100)}%`} label="Accuracy" />
                <Figure value={(result.elapsedMs / 1000).toFixed(1) + 's'} label="Time" />
                <Figure value={`+${result.xpAwarded}`} label="XP" />
              </div>
              <Button onClick={() => void start()} disabled={busy}>
                Race again
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <div className="race-figure">
      <span className="race-figure-value">{value}</span>
      <span className="race-figure-label">{label}</span>
    </div>
  );
}
