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
 * A game as the server sends it: once it is finished, `word` is the answer's
 * card, with its meanings in every language a word card gives and the
 * dictionary entry to save it as (null when there is none spelt exactly so).
 * A server from before it sends no `word`, and the result is as it was.
 */
type PeyvokGame = WordleGame & { word?: { entryId: string | null; meanings: WordMeanings; saved: boolean } | null };

const DIFFICULTY_KEY: Record<Difficulty, MessageKey> = {
  easy: 'games.difficulty.easy',
  medium: 'games.difficulty.medium',
  hard: 'games.difficulty.hard',
};

/**
 * How Peyvok was last played on this device — today's word or a practice one,
 * and how hard — so the game opens the way it was left. On this device only:
 * it is a habit of the hand, not something an account needs to carry.
 */
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
    // nothing kept, or storage blocked: the game opens as it always did
    return first;
  }
}

function writeChoice(choice: { mode: Mode; difficulty: Difficulty }): void {
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify(choice));
  } catch {
    // storage blocked: the choice lasts for this visit
  }
}

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

/**
 * A single-player Kurdish Peyvok — server-scored, answer withheld until it ends.
 *
 * Played alone it earns no XP (XP is for lessons, stories and games played
 * online with other people), so the result shows no figure of it and says so
 * once, with where XP is earned.
 *
 * The result names the word, found or not, with what it means in the
 * reader's language and Save to vocabulary (components/WordAnswer.tsx): the
 * meaning is the word card's for exactly this word, never the nearest
 * dictionary hit, and a word nobody has written a meaning for is shown alone.
 *
 * Under the result there is a quiet Share, as the phone's game has: the grid
 * of squares the guesses made, with the score over it and the site's address
 * under it (share/winText.ts). Only squares and counts, so it gives nothing
 * of the word away, and a word that was not found can be shown as well as
 * one that was.
 */
export function Wordle(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  // the way it was last played on this device: the same two questions are not asked again before every game
  const [mode, setMode] = useState<Mode>(() => readChoice().mode);
  const [difficulty, setDifficulty] = useState<Difficulty>(() => readChoice().difficulty);
  useEffect(() => writeChoice({ mode, difficulty }), [mode, difficulty]);
  const [game, setGame] = useState<PeyvokGame | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emptyPool, setEmptyPool] = useState(false);
  const [current, setCurrent] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // guesses the game would not take, counted: each one shakes the row it was typed in
  const [refusals, setRefusals] = useState(0);
  // the last guess's row is still turning over: the result waits for the tiles to have said it
  const { revealing, hold } = useReveal();
  // Save to vocabulary on the finished game's word: on its way, and why it did not land
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Each difficulty has a daily of its own, so the chips are pressed one after another; only the game asked for
  // last may land, or a slow answer for the chip left behind would show its word under the chip pressed after it.
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
  // the rating box hears of a game played to its end here (not a daily reopened)
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
      // the word found is a right answer, running out of tries a gentle miss; a guess along the way is neither
      if (res.data.status !== 'playing') {
        haptic(res.data.status === 'won' ? 'correct' : 'wrong');
        hold(res.data.targetLength, res.data.status === 'won');
      }
    } else {
      refuse(guessError(res.error, t));
    }
  }, [client, game, playing, submitting, current, t, refuse, hold]);

  /**
   * The finished game's word into the player's vocabulary, by the game rather than by the entry: the server saves
   * exactly the word the game was about, and counts it once toward the words learned however often it is pressed.
   */
  const saveWord = useCallback(async () => {
    const id = game?.id;
    if (!id || !game.word?.entryId || game.word.saved || saving) return;
    setSaving(true);
    setSaveError(null);
    const res = await client.post<{ saved: boolean }>(`/wordle/games/${id}/save`);
    setSaving(false);
    if (res.ok) setGame((g) => (g && g.id === id && g.word ? { ...g, word: { ...g.word, saved: true } } : g));
    // a full vocabulary, or the network: said as the dictionary says it, under the button
    else setSaveError(describeError(res.error, t));
  }, [client, game, saving, t]);

  const press = useCallback(
    (key: string) => {
      // while a guess is being judged the keys are let go, not dimmed: the board is about to answer
      if (!game || !playing || submitting) return;
      setNotice(null);
      if (key === 'Enter') return void submit();
      if (key === 'Backspace') return setCurrent((c) => Array.from(c).slice(0, -1).join(''));
      setCurrent((c) => (Array.from(c).length >= game.targetLength ? c : c + key));
    },
    [game, playing, submitting, submit],
  );

  // the physical keyboard: any key that types a letter of the alphabet
  // (AltGr, Option and dead keys included), Backspace and Enter
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
              {/* found or not, the word is the lesson: what it means, and a way to keep it */}
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
