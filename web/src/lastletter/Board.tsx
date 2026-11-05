import { useEffect, useMemo, useRef, useState } from 'react';
import {
  beginsWith,
  firstLetter,
  lastLetter,
  letterDirection,
  wordKey,
  type LastLetterBoard,
  type LastLetterOutcome,
  type LastLetterStrikeReason,
  type LetterDialect,
  type MultiMoveAnswer,
  type MultiView,
} from '@kurda/shared';
import { Button } from '../components/Button';
import { useTypeOnly } from '../components/typeOnly';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { haptic } from '../lib/haptics';
import { prefersReducedMotion } from '../lib/motion';
import type { ApiResult } from '../lib/types';
import { describeError } from '../lib/api';
import { useServerClock } from '../stories/useStoryGame';
import { multiSeatName } from '../play/MultiRoom';

export type LastLetterView = MultiView<LastLetterBoard | null>;

/** Why a word was struck, in the reader's words. */
export const REASON_KEY: Record<LastLetterStrikeReason, MessageKey> = {
  'not-a-word': 'games.lastLetter.reason.notAWord',
  'wrong-letter': 'games.lastLetter.reason.wrongLetter',
  used: 'games.lastLetter.reason.used',
  'not-allowed': 'games.lastLetter.reason.notAllowed',
  'not-one-word': 'games.lastLetter.reason.notOneWord',
  time: 'games.lastLetter.reason.time',
  gone: 'games.lastLetter.reason.gone',
};

/** The language tag a Kurdish word is marked with, so a screen reader says it as Kurdish. */
export function langOf(dialect: LetterDialect): string {
  return dialect === 'ckb' ? 'ckb' : 'ku';
}

/**
 * What the composer says before a word is sent — the slips the client can see
 * for itself, so they cost no strike: not one word in the game's letters, the
 * wrong first letter, a word already in the chain. Null when it looks fine
 * (the dictionary is still the server's to ask).
 */
export function precheck(board: LastLetterBoard, typed: string): { key: MessageKey; letter?: string } | null {
  if (!typed.trim()) return null;
  const key = wordKey(board.dialect, typed);
  if (key === null) return { key: 'games.lastLetter.hintScript' };
  if (board.required && !beginsWith(board.dialect, key, board.required)) {
    return { key: 'games.lastLetter.hintLetter', letter: board.requiredSpellings.join(' / ') || board.required };
  }
  if (board.chain.some((w) => w.word === key)) return { key: 'games.lastLetter.hintUsed' };
  return null;
}

/**
 * The Last Letter's own staging, inside the room (play/MultiRoom.tsx):
 *
 * - the chain, a row of word cards that reads in the dialect's own direction,
 *   each card's last letter and the next card's first lit in the same colour,
 *   so the link between two words is the thing you see; the newest card slides
 *   in, and the row keeps it in view;
 * - a ring around the letter the next word must begin with, emptying as the
 *   turn's time runs out (drawn from the server's clock), with how a word
 *   beginning with it is written (Soranî writes a first vowel with ئ);
 * - the players, each with three strike marks, out or away;
 * - and, on your turn, the word box, which says a slip it can see before the
 *   word is sent. A strike buzzes (and shakes the seat that took it); under
 *   Reduce Motion nothing moves, the colour alone says it.
 */
export function LastLetterBoardView({
  view,
  skew,
  move,
}: {
  view: LastLetterView;
  skew: number;
  move: (body: unknown) => Promise<ApiResult<MultiMoveAnswer<LastLetterBoard | null, LastLetterOutcome>>>;
}): React.JSX.Element | null {
  const t = useT();
  const board = view.board;
  const now = useServerClock(skew, view.status === 'active');
  const [still] = useState(prefersReducedMotion);
  const name = (seat: number): string => {
    const p = view.players.find((x) => x.seat === seat);
    return p ? multiSeatName(p, t) : t('stories.game.playerN', { seat });
  };
  const lastStrike = board?.strikes.at(-1) ?? null;
  const strikeKey = lastStrike ? `${lastStrike.seat}:${lastStrike.turn}:${lastStrike.reason}` : null;
  // a new strike buzzes once, for whoever sees it; the chain growing ticks
  const seenStrike = useRef(strikeKey);
  const seenLength = useRef(board?.chain.length ?? 0);
  const [shaking, setShaking] = useState<number | null>(null);
  useEffect(() => {
    if (!board) return;
    if (strikeKey && strikeKey !== seenStrike.current && lastStrike) {
      seenStrike.current = strikeKey;
      if (lastStrike.seat === view.me?.seat) haptic('wrong');
      setShaking(lastStrike.seat);
      const timer = setTimeout(() => setShaking(null), 600);
      return () => clearTimeout(timer);
    }
    seenStrike.current = strikeKey;
  }, [strikeKey, lastStrike, board, view.me?.seat]);
  useEffect(() => {
    if (!board) return;
    if (board.chain.length > seenLength.current && board.chain.at(-1)?.seat === view.me?.seat) haptic('correct');
    seenLength.current = board.chain.length;
  }, [board, view.me?.seat]);

  if (!board) return null;
  const dir = letterDirection(board.dialect);
  const lang = langOf(board.dialect);
  const turn = board.turn;
  const remaining = turn ? Math.max(0, Date.parse(turn.endsAt) - now) : 0;
  const total = turn ? Math.max(1, Date.parse(turn.endsAt) - Date.parse(turn.startedAt)) : 1;
  const share = Math.min(1, remaining / total);
  const seconds = Math.ceil(remaining / 1000);
  const whose = turn ? name(turn.seat) : '';
  const announce = lastStrike
    ? t('games.lastLetter.strikeLine', { name: name(lastStrike.seat), reason: t(REASON_KEY[lastStrike.reason]) })
    : null;

  return (
    <div className={`ll-board${still ? ' is-still' : ''}`}>
      <div className="ll-turn" aria-live="polite">
        <TurnRing share={share} low={seconds <= 5 && board.yourTurn} label={t('games.lastLetter.timeLeft', { count: seconds })}>
          {board.required ? (
            <span className="ll-letter" lang={lang} dir={dir}>
              {board.required}
            </span>
          ) : (
            <span className="ll-letter is-any" aria-hidden="true">
              ✱
            </span>
          )}
        </TurnRing>
        <div className="ll-turn-text">
          <p className={`ll-whose${board.yourTurn ? ' is-mine' : ''}`}>
            {board.yourTurn ? t('games.lastLetter.yourTurn') : turn ? t('games.lastLetter.theirTurn', { name: whose }) : null}
          </p>
          {board.required ? (
            <p className="ll-starts">
              <span className="muted">{t('games.lastLetter.startsWith')}</span>{' '}
              <span className="ll-spellings" lang={lang} dir={dir}>
                {board.requiredSpellings.join(' · ')}
              </span>
            </p>
          ) : (
            <p className="ll-starts muted">{t('games.lastLetter.firstWord')}</p>
          )}
        </div>
      </div>

      <WordChain board={board} name={name} mySeat={view.me?.seat ?? null} />

      <ul className="ll-seats" aria-label={t('stories.game.players', { count: board.seats.length, max: view.maxPlayers })}>
        {board.seats.map((s) => {
          const p = view.players.find((x) => x.seat === s.seat);
          return (
            <li
              key={s.seat}
              className={`ll-seat${turn?.seat === s.seat ? ' is-turn' : ''}${s.out ? ' is-out' : ''}${shaking === s.seat ? ' is-struck' : ''}`}
            >
              <span className="ll-seat-name">{name(s.seat)}</span>
              <span className="ll-strikes" role="img" aria-label={t('games.lastLetter.strikes', { count: s.strikes, max: board.maxStrikes })}>
                {Array.from({ length: board.maxStrikes }, (_, i) => (
                  <span key={i} className={`ll-strike${i < s.strikes ? ' is-on' : ''}`} />
                ))}
              </span>
              {s.out ? <span className="ll-tag">{s.left ? t('games.lastLetter.reason.gone') : t('games.lastLetter.out')}</span> : null}
              {!s.out && p?.away ? <span className="ll-tag is-away">{t('play.room.away')}</span> : null}
            </li>
          );
        })}
      </ul>

      {announce && (
        <p className="ll-announce" role="status" key={strikeKey ?? undefined}>
          {announce}
        </p>
      )}

      {board.yourTurn && <WordComposer board={board} move={move} />}
    </div>
  );
}

/** The ring around the next letter: a full circle at the start of a turn, empty when its time is up. */
export function TurnRing({ share, low, label, children }: { share: number; low: boolean; label: string; children: React.ReactNode }): React.JSX.Element {
  const r = 34;
  const length = 2 * Math.PI * r;
  return (
    <div className={`ll-ring${low ? ' is-low' : ''}`} role="timer" aria-label={label}>
      <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
        <circle className="ll-ring-track" cx="40" cy="40" r={r} />
        <circle
          className="ll-ring-time"
          cx="40"
          cy="40"
          r={r}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - share)}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <span className="ll-ring-inner">{children}</span>
    </div>
  );
}

/** The chain so far: each word a card, its first and last letters lit so the links show. */
export function WordChain({ board, name, mySeat }: { board: LastLetterBoard; name: (seat: number) => string; mySeat: number | null }): React.JSX.Element {
  const t = useT();
  const list = useRef<HTMLOListElement>(null);
  const dir = letterDirection(board.dialect);
  const lang = langOf(board.dialect);
  useEffect(() => {
    const el = list.current;
    const last = el?.lastElementChild as HTMLElement | null;
    // keep the newest word in view, without moving the page
    if (el && last && typeof el.scrollTo === 'function') {
      el.scrollTo({ left: dir === 'rtl' ? -el.scrollWidth : el.scrollWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }, [board.chain.length, dir]);
  if (board.chain.length === 0) {
    return (
      <div className="ll-chain is-empty">
        <p className="muted">{t('games.lastLetter.firstWord')}</p>
      </div>
    );
  }
  return (
    <div className="ll-chain">
      <h3 className="sr-only">{t('games.lastLetter.chain')}</h3>
      <ol className="ll-cards" ref={list} dir={dir} tabIndex={0} aria-label={t('games.lastLetter.chain')}>
        {board.chain.map((w) => {
          const first = firstLetter(board.dialect, w.word);
          const last = lastLetter(board.dialect, w.word);
          return (
            <li key={w.n} className={`ll-card${w.seat === mySeat ? ' is-mine' : ''}`}>
              <span className="ll-word" lang={lang} dir={dir}>
                <WordLetters word={w.word} first={first} last={last} dialect={board.dialect} />
              </span>
              {w.meaning && (
                <span className="ll-meaning" lang="en" dir="ltr">
                  {w.meaning}
                </span>
              )}
              <span className="ll-by">{name(w.seat)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A word with its first and last letters marked, keeping a Soranî word's letters joined. */
function WordLetters({ word, first, last, dialect }: { word: string; first: string | null; last: string | null; dialect: LetterDialect }): React.JSX.Element {
  const chars = Array.from(word);
  // Arabic letters join: splitting a word into spans would break its shapes, so only Kurmancî letters are lit one by one
  if (dialect === 'ckb' || chars.length < 2) return <>{word}</>;
  const head = chars[0] === first ? chars[0] : '';
  const tail = chars.length > 1 && chars[chars.length - 1] === last ? chars[chars.length - 1] : '';
  const middle = chars.slice(head ? 1 : 0, tail ? -1 : undefined).join('');
  return (
    <>
      {head && <span className="ll-first">{head}</span>}
      {middle}
      {tail && <span className="ll-last">{tail}</span>}
    </>
  );
}

/** The word box on your turn: typed, never pasted, with the slips it can see said before a strike. */
function WordComposer({
  board,
  move,
}: {
  board: LastLetterBoard;
  move: (body: unknown) => Promise<ApiResult<MultiMoveAnswer<LastLetterBoard | null, LastLetterOutcome>>>;
}): React.JSX.Element {
  const t = useT();
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { handlers: typeOnly, notice: pasteNotice } = useTypeOnly(t('games.rhyme.noPasting'));
  const hint = useMemo(() => precheck(board, word), [board, word]);
  const dir = letterDirection(board.dialect);
  useEffect(() => input.current?.focus(), []);

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!word.trim() || hint || busy) return;
    setBusy(true);
    setError(null);
    const res = await move({ word });
    setBusy(false);
    if (res.ok) setWord('');
    else setError(describeError(res.error, t));
  }

  const placeholder = board.required
    ? t('games.lastLetter.placeholder', { letter: board.requiredSpellings[0] ?? board.required })
    : t('games.lastLetter.placeholderAny');
  return (
    <form className="ll-compose" onSubmit={send}>
      <label className="sr-only" htmlFor="ll-word">
        {t('games.lastLetter.yourWord')}
      </label>
      <input
        id="ll-word"
        ref={input}
        className="input ll-input"
        value={word}
        onChange={(e) => setWord(e.target.value)}
        placeholder={placeholder}
        lang={langOf(board.dialect)}
        dir={dir}
        maxLength={40}
        aria-invalid={hint ? true : undefined}
        aria-describedby={hint || error || pasteNotice ? 'll-word-hint' : undefined}
        {...typeOnly}
      />
      <Button type="submit" disabled={busy || !word.trim() || hint !== null}>
        {busy ? '…' : t('games.lastLetter.send')}
      </Button>
      {(pasteNotice ?? error ?? hint) && (
        <p id="ll-word-hint" className="ll-hint" role="status">
          {pasteNotice ?? error ?? (hint ? t(hint.key, hint.letter ? { letter: hint.letter } : undefined) : null)}
        </p>
      )}
    </form>
  );
}
