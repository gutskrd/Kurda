import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, WordleGame } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { TrophyIcon } from '../components/icons';
import { WordleBoard, WordleKeyboard, useReveal } from '../components/WordleBoard';
import { WordAnswer, type WordMeanings } from '../components/WordAnswer';
import { useWordleKeys } from '../keyboard/wordleKeys';
import { useT } from '../i18n/I18nProvider';
import { useGameFinished } from '../feedback/gameFinished';
import type { MessageKey } from '../i18n/en';
import { haptic } from '../lib/haptics';
import { GameHead, stageTone } from '../games/GameHead';
import { ShareWin } from '../share/ShareWin';
import { wordGameShare } from '../share/winText';

type Mode = 'daily' | 'practice';
type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * A game as the server sends it; once finished, `word` is the answer's card with its meanings and the dictionary entry to
 * save (null when none is spelt exactly so). Older servers send no `word`.
 */
type PeyvokGame = WordleGame & { word?: { entryId: string | null; meanings: WordMeanings; saved: boolean } | null };

const DIFFICULTY_KEY: Record<Difficulty, MessageKey> = {
  easy: 'games.difficulty.easy',
  medium: 'games.difficulty.medium',
  hard: 'games.difficulty.hard',
};

/** How Peyvok was last played on this device (today's word or practice, and difficulty), so it opens the same way. */
const CHOICE_KEY = 'hevalo_peyvok_choice';
const MODES: readonly Mode[] = ['daily', 'practice'];
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

function readChoice(): { mode: Mode; difficulty: Difficulty } {
  const first = { mode: 'daily' as Mode, difficulty: 'medium' as Difficulty };
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? 'null');
    if (!kept || typeof kept !== 'object') return first;
    const { mode, difficulty } = kept as { mode?: unknown; difficulty?: unknown };
    return {
      mode: MODES.includes(mode as Mode) ? (mode as Mode) : first.mode,
      difficulty: DIFFICULTIES.includes(difficulty as Difficulty) ? (difficulty as Difficulty) : first.difficulty,
    };
  } catch {
    // Nothing kept, or storage blocked: the default opening.
    return first;
  }
}

function writeChoice(choice: { mode: Mode; difficulty: Difficulty }): void {
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify(choice));
  } catch {
    // Storage blocked: the choice lasts for this visit.
  }
}

/** A server refusal in the reader's language. */
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

/**
 * Solo Peyvok, scored by the server with the answer withheld until the end. Played alone it earns no XP, said once. The
 * result names the word, found or not, with its meaning from the word's own card and Save to vocabulary
 * (components/WordAnswer.tsx). A quiet Share sends the grid of squares, the score and the site's address
 * (share/winText.ts), which gives nothing of the word away.
 */
export function Wordle(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  // The way it was last played on this device, so the same questions are not asked before every game.
  const [mode, setMode] = useState<Mode>(() => readChoice().mode);
  const [difficulty, setDifficulty] = useState<Difficulty>(() => readChoice().difficulty);
  useEffect(() => writeChoice({ mode, difficulty }), [mode, difficulty]);
  const [game, setGame] = useState<PeyvokGame | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emptyPool, setEmptyPool] = useState(false);
  const [current, setCurrent] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Refused guesses, counted: each shakes the row it was typed in.
  const [refusals, setRefusals] = useState(0);
  // The last guess's row is still turning over; the result waits for the tiles.
  const { revealing, hold } = useReveal();
  // Save to vocabulary on the finished word: in flight, and why it failed.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Each difficulty has its own daily, so only the game asked for last may land; a slow answer for an earlier chip would
  // otherwise show its word under the later one.
  const asked = useRef(0);

  const refuse = useCallback((why: string) => {
    setNotice(why);
    setRefusals((n) => n + 1);
    haptic('wrong');
  }, []);

  const start = useCallback(async () => {
    const ask = ++asked.current;
    setGame(null);
    setLoadError(null);
    setEmptyPool(false);
    setCurrent('');
    setNotice(null);
    setRefusals(0);
    setSaving(false);
    setSaveError(null);
    const res = await client.post<PeyvokGame>(`/wordle/${mode}`, { difficulty });
    if (ask !== asked.current) return;
    if (res.ok) setGame(res.data);
    else if (res.error.code === 'EMPTY_POOL') setEmptyPool(true);
    else setLoadError(describeError(res.error, t));
  }, [client, mode, difficulty]);

  useEffect(() => {
    void start();
  }, [start]);

  const playing = game?.status === 'playing';
  // The rating box hears of a game played to its end here, not a daily reopened.
  useGameFinished('wordle', game?.id ?? null, game !== null && !playing);

  const submit = useCallback(async () => {
    if (!game || !playing || submitting) return;
    const letters = Array.from(current);
    if (letters.length === 0) return;
    if (letters.length !== game.targetLength) {
      refuse(t('games.wordle.enterLetters', { count: game.targetLength }));
      return;
    }
    setSubmitting(true);
    setNotice(null);
    const res = await client.post<PeyvokGame>(`/wordle/games/${game.id}/guesses`, { word: current });
    setSubmitting(false);
    if (res.ok) {
      setGame(res.data);
      setCurrent('');
      // Finding the word is a right answer, running out a gentle miss; guesses along the way are neither.
      if (res.data.status !== 'playing') {
        haptic(res.data.status === 'won' ? 'correct' : 'wrong');
        hold(res.data.targetLength, res.data.status === 'won');
      }
    } else {
      refuse(guessError(res.error, t));
    }
  }, [client, game, playing, submitting, current, t, refuse, hold]);

  /** Saves the finished game's word by game, so the server saves exactly that word and counts it once however often pressed. */
  const saveWord = useCallback(async () => {
    const id = game?.id;
    if (!id || !game.word?.entryId || game.word.saved || saving) return;
    setSaving(true);
    setSaveError(null);
    const res = await client.post<{ saved: boolean }>(`/wordle/games/${id}/save`);
    setSaving(false);
    if (res.ok) setGame((g) => (g && g.id === id && g.word ? { ...g, word: { ...g.word, saved: true } } : g));
    // A full vocabulary or the network, said as the dictionary says it, under the button.
    else setSaveError(describeError(res.error, t));
  }, [client, game, saving, t]);

  const press = useCallback(
    (key: string) => {
      // While a guess is judged the keys are ignored, not dimmed: the board is about to answer.
      if (!game || !playing || submitting) return;
      setNotice(null);
      if (key === 'Enter') return void submit();
      if (key === 'Backspace') return setCurrent((c) => Array.from(c).slice(0, -1).join(''));
      setCurrent((c) => (Array.from(c).length >= game.targetLength ? c : c + key));
    },
    [game, playing, submitting, submit],
  );

  // The physical keyboard: any key typing an alphabet letter (AltGr, Option and dead keys included), Backspace and Enter.
  useWordleKeys(playing, press);

  return (
    <div className="container game-page gs" style={stageTone('peyvok')}>
      <GameHead game="peyvok" title={t('games.wordle.name')} />

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
            refusals={refusals}
          />
          {notice && <div className="wordle-notice" role="status">{notice}</div>}
          {game.status !== 'playing' && !revealing && (
            <div className={`wordle-result is-${game.status}`}>
              <p className="wordle-result-title">
                {game.status === 'won' && <TrophyIcon size={22} className="verdict-icon" />}
                {game.status === 'won' ? t('games.wordle.solved') : t('games.wordle.outOfTries')}
                {game.target && game.status === 'lost' && <> {t('games.wordle.theWordWas', { word: game.target })}</>}
              </p>
              {/* Found or not, the word is the lesson: its meaning, and a way to keep it. */}
              {game.target && (
                <WordAnswer
                  word={game.target}
                  meanings={game.word?.meanings}
                  save={
                    game.word?.entryId
                      ? { saved: game.word.saved, busy: saving, onSave: () => void saveWord(), error: saveError }
                      : undefined
                  }
                />
              )}
              <p className="gs-alone">{t('games.noXpAlone')}</p>
              {mode === 'practice' ? (
                <Button onClick={() => void start()}>{t('games.playAgain')}</Button>
              ) : (
                <p className="muted">{t('games.wordle.comeBackTomorrow')}</p>
              )}
              <ShareWin text={wordGameShare(game, { practice: t('games.wordle.practice'), difficulty: t(DIFFICULTY_KEY[game.difficulty]) })} />
            </div>
          )}
          <WordleKeyboard keyboard={game.keyboard} onPress={press} disabled={!playing} />
        </>
      )}
    </div>
  );
}
