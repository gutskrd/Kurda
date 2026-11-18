import { useEffect, useMemo, useRef, useState } from 'react';
import {
  firstLetter,
  lastLetter,
  lastLetterSlip,
  letterDirection,
  typingKeys,
  type AppLocale,
  type LastLetterBoard,
  type LastLetterChainWord,
  type LastLetterOutcome,
  type LastLetterStrikeReason,
  type LetterDialect,
  type MultiMoveAnswer,
  type MultiView,
} from '@kurda/shared';
import { Button } from '../components/Button';
import { useTypeOnly } from '../components/typeOnly';
import { useLocale, useT } from '../i18n/I18nProvider';
import { KeyBar } from '../keyboard/KeyBar';
import type { MessageKey } from '../i18n/en';
import { haptic } from '../lib/haptics';
import { prefersReducedMotion } from '../lib/motion';
import type { ApiResult } from '../lib/types';
import { describeError } from '../lib/api';
import { useServerClock } from '../stories/useStoryGame';
import { multiSeatName } from '../play/MultiRoom';

type LastLetterView = MultiView<LastLetterBoard | null>;

/** Why a word was struck, in the reader's words. */
const REASON_KEY: Record<LastLetterStrikeReason, MessageKey> = {
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

/** What a chain word means in the reader's language, falling back to English or to the older single `meaning`. */
function meaningIn(word: Pick<LastLetterChainWord, 'meaning' | 'meanings'>, locale: AppLocale): { text: string; lang: string } | null {
  const own = word.meanings?.[locale];
  if (own) return { text: own, lang: locale };
  const en = word.meanings?.en ?? word.meaning;
  return en ? { text: en, lang: 'en' } : null;
}

/** The problem the word box can see before a word is sent (shared `lastLetterSlip`). */
export function precheck(board: LastLetterBoard, typed: string): { key: MessageKey; letter?: string } | null {
  const slip = lastLetterSlip(board, typed);
  if (!slip) return null;
  if (slip.kind === 'script') return { key: 'games.lastLetter.hintScript' };
  if (slip.kind === 'letter') return { key: 'games.lastLetter.hintLetter', letter: slip.letter };
  return { key: 'games.lastLetter.hintUsed' };
}

/**
 * The Last Letter's board inside the room (play/MultiRoom.tsx): the chain of word cards in the dialect's direction,
 * each link's letters lit in the same colour; a ring around the next required letter that empties on the server's
 * clock; the players with their three strike marks; and on your turn the word box. A strike buzzes and shakes the
 * seat; under Reduce Motion nothing moves.
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
  // A new strike buzzes once; the chain growing ticks.
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
              {board.requiredSpellings[0] ?? board.required}
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
          ) : board.openLetter ? (
            <p className="ll-starts ll-note">{t('games.lastLetter.openLetter', { letter: board.openLetter })}</p>
          ) : (
            <p className="ll-starts muted">{t('games.lastLetter.firstWord')}</p>
          )}
          {/* A soft ending passes on the letter before it, explained under the ring. */}
          {board.required && board.requiredFrom ? (
            <p className="ll-note muted">
              {t('games.lastLetter.softEnding', { word: board.requiredFrom.word, vowel: board.requiredFrom.vowel, letter: board.required })}
            </p>
          ) : null}
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

/** The ring around the next letter: full at the start of a turn, empty when its time is up. */
function TurnRing({ share, low, label, children }: { share: number; low: boolean; label: string; children: React.ReactNode }): React.JSX.Element {
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
function WordChain({ board, name, mySeat }: { board: LastLetterBoard; name: (seat: number) => string; mySeat: number | null }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const list = useRef<HTMLOListElement>(null);
  const dir = letterDirection(board.dialect);
  const lang = langOf(board.dialect);
  useEffect(() => {
    const el = list.current;
    const last = el?.lastElementChild as HTMLElement | null;
    // Keep the newest word in view without scrolling the page.
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
          const meaning = meaningIn(w, locale);
          return (
            <li key={w.n} className={`ll-card${w.seat === mySeat ? ' is-mine' : ''}`}>
              <span className="ll-word" lang={lang} dir={dir}>
                <WordLetters word={w.word} first={first} last={last} dialect={board.dialect} />
              </span>
              {meaning && (
                <span className="ll-meaning" lang={meaning.lang}>
                  {meaning.text}
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

/** Every word of a finished game in order, with who played it and what it means. */
export function ChainReview({ board, name }: { board: LastLetterBoard; name: (seat: number) => string }): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  if (board.chain.length === 0) return null;
  const lang = langOf(board.dialect);
  const dir = letterDirection(board.dialect);
  return (
    <section className="ll-review" aria-labelledby="ll-review-title">
      <h3 id="ll-review-title" className="ll-review-title">
        {t('games.lastLetter.review')}
      </h3>
      <ol className="ll-review-list">
        {board.chain.map((w) => {
          const meaning = meaningIn(w, locale);
          return (
            <li key={w.n} className="ll-review-row">
              <span className="ll-review-word" lang={lang} dir={dir}>
                {w.word}
              </span>
              {meaning && (
                <span className="ll-review-meaning" lang={meaning.lang}>
                  {meaning.text}
                </span>
              )}
              <span className="ll-review-by muted">{name(w.seat)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** A word with its first and last letters marked, keeping a Soranî word's letters joined. */
function WordLetters({ word, first, last, dialect }: { word: string; first: string | null; last: string | null; dialect: LetterDialect }): React.JSX.Element {
  const chars = Array.from(word);
  // Spans would break joined Arabic script, so only Kurmancî letters are lit one by one.
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

/** The word box on your turn: no pasting, and problems it can see are shown before a strike. */
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
  // A word the server took for a missing mark: no strike, and the likely word is offered instead.
  const [didYouMean, setDidYouMean] = useState<string | null>(null);
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
    if (!res.ok) {
      setError(describeError(res.error, t));
      return;
    }
    const spelling = res.data.outcome?.spelling ?? null;
    setDidYouMean(spelling);
    setWord(spelling ?? '');
    if (spelling) input.current?.focus();
  }

  /** Types a letter from the key bar at the cursor. */
  function insert(letter: string): void {
    const el = input.current;
    const at = el?.selectionStart ?? word.length;
    const end = el?.selectionEnd ?? at;
    setWord(word.slice(0, at) + letter + word.slice(end));
    setDidYouMean(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + letter.length, at + letter.length);
    });
  }

  // In a right-to-left box a sentence in the reader's language would clip and read backwards, so only the letter shows.
  const placeholder = !board.required
    ? t('games.lastLetter.placeholderAny')
    : dir === 'rtl'
      ? `${board.requiredSpellings[0] ?? board.required}…`
      : t('games.lastLetter.placeholder', { letter: board.requiredSpellings[0] ?? board.required });
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
        onChange={(e) => {
          setWord(e.target.value);
          setDidYouMean(null);
        }}
        placeholder={placeholder}
        lang={langOf(board.dialect)}
        dir={dir}
        maxLength={40}
        aria-invalid={hint ? true : undefined}
        aria-describedby={hint || error || pasteNotice || didYouMean ? 'll-word-hint' : undefined}
        {...typeOnly}
      />
      {/* While busy the button keeps its label so its width does not change. */}
      <Button type="submit" disabled={busy || !word.trim() || hint !== null} aria-busy={busy || undefined}>
        {t('games.lastLetter.send')}
      </Button>
      <KeyBar keys={typingKeys(board.dialect)} onKey={insert} disabled={busy} lang={langOf(board.dialect) as 'ku' | 'ckb'} dir={dir} />
      {(pasteNotice ?? error ?? hint ?? didYouMean) && (
        <p id="ll-word-hint" className="ll-hint" role="status">
          {pasteNotice ??
            error ??
            (hint ? t(hint.key, hint.letter ? { letter: hint.letter } : undefined) : didYouMean ? t('games.lastLetter.didYouMean', { word: didYouMean }) : null)}
        </p>
      )}
    </form>
  );
}
