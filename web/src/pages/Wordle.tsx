import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, WordleGame } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { ArrowIcon } from '../components/icons';
import { WordleBoard, WordleKeyboard, KURMANCI_LETTER_RE } from '../components/WordleBoard';

type Mode = 'daily' | 'practice';
type Difficulty = 'easy' | 'medium' | 'hard';

function guessError(err: ApiError): string {
  switch (err.code) {
    case 'WRONG_LENGTH':
      return 'That guess is the wrong length.';
    case 'NOT_A_WORD':
      return 'Not a word in the dictionary — try another.';
    case 'GAME_OVER':
      return 'This game is already finished.';
    default:
      return describeError(err);
  }
}

/** A single-player Kurdish Wordle — server-scored, answer withheld until it ends. */
export function Wordle(): React.JSX.Element {
  const { client } = useAuth();
  const [mode, setMode] = useState<Mode>('daily');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [game, setGame] = useState<WordleGame | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emptyPool, setEmptyPool] = useState(false);
  const [current, setCurrent] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const start = useCallback(async () => {
    setGame(null);
    setLoadError(null);
    setEmptyPool(false);
    setCurrent('');
    setNotice(null);
    const res = await client.post<WordleGame>(`/wordle/${mode}`, { difficulty });
    if (res.ok) setGame(res.data);
    else if (res.error.code === 'EMPTY_POOL') setEmptyPool(true);
    else setLoadError(describeError(res.error));
  }, [client, mode, difficulty]);

  useEffect(() => {
    void start();
  }, [start]);

  const playing = game?.status === 'playing';

  const submit = useCallback(async () => {
    if (!game || !playing || submitting) return;
    const letters = Array.from(current);
    if (letters.length === 0) return;
    if (letters.length !== game.targetLength) {
      setNotice(`Enter ${game.targetLength} letters.`);
      return;
    }
    setSubmitting(true);
    setNotice(null);
    const res = await client.post<WordleGame>(`/wordle/games/${game.id}/guesses`, { word: current });
    setSubmitting(false);
    if (res.ok) {
      setGame(res.data);
      setCurrent('');
    } else {
      setNotice(guessError(res.error));
    }
  }, [client, game, playing, submitting, current]);

  const press = useCallback(
    (key: string) => {
      if (!game || !playing) return;
      setNotice(null);
      if (key === 'Enter') return void submit();
      if (key === 'Backspace') return setCurrent((c) => Array.from(c).slice(0, -1).join(''));
      setCurrent((c) => (Array.from(c).length >= game.targetLength ? c : c + key));
    },
    [game, playing, submit],
  );

  // physical keyboard: letters a–z + the special keys, Backspace, Enter
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') return press('Enter');
      if (e.key === 'Backspace') return press('Backspace');
      const k = e.key.toLowerCase();
      if (KURMANCI_LETTER_RE.test(k)) press(k);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, press]);

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 72 }}>
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label="Back to games">
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">Yarî · Kurdish Wordle</span>
          <h1 className="page-title" style={{ margin: 0 }}>Wordle</h1>
        </div>
      </div>

      <div className="toolbar wordle-toolbar" role="group" aria-label="Game options">
        <div className="chat-tabs" role="tablist" aria-label="Mode">
          {(['daily', 'practice'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={`chip${mode === m ? ' active' : ''}`} onClick={() => setMode(m)}>
              {m === 'daily' ? 'Daily' : 'Practice'}
            </button>
          ))}
        </div>
        <div className="chat-tabs" role="tablist" aria-label="Difficulty">
          {(['easy', 'medium', 'hard'] as const).map((d) => (
            <button key={d} role="tab" aria-selected={difficulty === d} className={`chip${difficulty === d ? ' active' : ''}`} onClick={() => setDifficulty(d)}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {emptyPool ? (
        <div className="wordle-msg">No puzzles available yet for this difficulty — check back soon.</div>
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={() => void start()} />
      ) : game === null ? (
        <Loading />
      ) : (
        <>
          <WordleBoard
            targetLength={game.targetLength}
            guesses={game.guesses}
            current={current}
            totalRows={game.guesses.length + game.remainingAttempts}
            showCurrent={game.status === 'playing'}
          />
          {notice && <div className="wordle-notice" role="status">{notice}</div>}
          {game.status !== 'playing' && (
            <div className="wordle-result">
              <p className="wordle-result-title">
                {game.status === 'won' ? '🎉 Solved it!' : 'Out of tries.'}
                {game.target && game.status === 'lost' && <> The word was <strong>{game.target}</strong>.</>}
                {game.xpAwarded ? <> +{game.xpAwarded} XP</> : null}
              </p>
              {mode === 'practice' ? (
                <Button onClick={() => void start()}>Play again</Button>
              ) : (
                <p className="muted">Come back tomorrow for a new daily word — or switch to Practice for unlimited rounds.</p>
              )}
            </div>
          )}
          <WordleKeyboard keyboard={game.keyboard} onPress={press} disabled={!playing || submitting} />
        </>
      )}
    </div>
  );
}
