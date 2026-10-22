import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, WordleGame } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { ArrowIcon } from '../components/icons';
import { WordleBoard, WordleKeyboard } from '../components/WordleBoard';
import { useWordleKeys } from '../keyboard/wordleKeys';
import { useT } from '../i18n/I18nProvider';
import { useGameFinished } from '../feedback/gameFinished';
import type { MessageKey } from '../i18n/en';
import { haptic } from '../lib/haptics';

type Mode = 'daily' | 'practice';
type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_KEY: Record<Difficulty, MessageKey> = {
  easy: 'games.difficulty.easy',
  medium: 'games.difficulty.medium',
  hard: 'games.difficulty.hard',
};

/** A refusal from the server, in the reader's language. */
function guessError(err: ApiError, t: (key: MessageKey) => string): string {
  switch (err.code) {
    case 'WRONG_LENGTH':
      return t('games.wordle.wrongLength');
    case 'NOT_A_WORD':
      return t('games.wordle.notAWord');
    case 'GAME_OVER':
      return t('games.wordle.alreadyFinished');
    default:
      return describeError(err, t);
  }
}

/** A single-player Kurdish Peyvok — server-scored, answer withheld until it ends. */
export function Wordle(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
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
    else setLoadError(describeError(res.error, t));
  }, [client, mode, difficulty]);

  useEffect(() => {
    void start();
  }, [start]);

  const playing = game?.status === 'playing';
  // the rating box hears of a game played to its end here (not a daily reopened)
  useGameFinished('wordle', game?.id ?? null, game !== null && !playing);

  const submit = useCallback(async () => {
    if (!game || !playing || submitting) return;
    const letters = Array.from(current);
    if (letters.length === 0) return;
    if (letters.length !== game.targetLength) {
      setNotice(t('games.wordle.enterLetters', { count: game.targetLength }));
      return;
    }
    setSubmitting(true);
    setNotice(null);
    const res = await client.post<WordleGame>(`/wordle/games/${game.id}/guesses`, { word: current });
    setSubmitting(false);
    if (res.ok) {
      setGame(res.data);
      setCurrent('');
      // the word found is a right answer, running out of tries a gentle miss; a guess along the way is neither
      if (res.data.status !== 'playing') haptic(res.data.status === 'won' ? 'correct' : 'wrong');
    } else {
      setNotice(guessError(res.error, t));
    }
  }, [client, game, playing, submitting, current, t]);

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

  // the physical keyboard: any key that types a letter of the alphabet
  // (AltGr, Option and dead keys included), Backspace and Enter
  useWordleKeys(playing, press);

  return (
    <div className="container game-page">
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label={t('games.back')}>
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">{t('nav.games')}</span>
          <h1 className="page-title" style={{ margin: 0 }}>{t('games.wordle.name')}</h1>
        </div>
      </div>

      <div className="toolbar wordle-toolbar" role="group" aria-label={t('games.options')}>
        <div className="chat-tabs" role="tablist" aria-label={t('games.wordle.mode')}>
          {(['daily', 'practice'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={`chip${mode === m ? ' active' : ''}`} onClick={() => setMode(m)}>
              {m === 'daily' ? t('games.wordle.daily') : t('games.wordle.practice')}
            </button>
          ))}
        </div>
        <div className="chat-tabs" role="tablist" aria-label={t('games.difficulty')}>
          {(['easy', 'medium', 'hard'] as const).map((d) => (
            <button key={d} role="tab" aria-selected={difficulty === d} className={`chip${difficulty === d ? ' active' : ''}`} onClick={() => setDifficulty(d)}>
              {t(DIFFICULTY_KEY[d])}
            </button>
          ))}
        </div>
      </div>

      {emptyPool ? (
        <div className="wordle-msg">{t('games.wordle.emptyDifficulty')}</div>
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
                {game.status === 'won' ? t('games.wordle.solved') : t('games.wordle.outOfTries')}
                {game.target && game.status === 'lost' && <> {t('games.wordle.theWordWas', { word: game.target })}</>}
                {game.xpAwarded ? <> +{game.xpAwarded} XP</> : null}
              </p>
              {mode === 'practice' ? (
                <Button onClick={() => void start()}>{t('games.playAgain')}</Button>
              ) : (
                <p className="muted">{t('games.wordle.comeBackTomorrow')}</p>
              )}
            </div>
          )}
          <WordleKeyboard keyboard={game.keyboard} onPress={press} disabled={!playing || submitting} />
        </>
      )}
    </div>
  );
}
