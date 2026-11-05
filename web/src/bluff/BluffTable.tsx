import { useEffect, useRef, useState } from 'react';
import {
  BLUFF_FAKE_MAX,
  dialectDirection,
  type BluffBoard,
  type BluffOutcome,
  type BluffReveal,
  type MultiMoveAnswer,
  type MultiView,
} from '@kurda/shared';
import { Button } from '../components/Button';
import { CheckIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { haptic } from '../lib/haptics';
import { prefersReducedMotion } from '../lib/motion';
import type { ApiResult } from '../lib/types';
import { seatNamer } from '../play/MultiRoom';
import { useServerClock } from '../stories/useStoryGame';
import { languageName } from '../games/partyChoices';

export type BluffView = MultiView<BluffBoard | null>;
type Move = (body: unknown) => Promise<ApiResult<MultiMoveAnswer<BluffBoard | null, BluffOutcome>>>;

/** A seat's own colour, for its tokens: the same on every screen, told apart around the table. */
export function seatHue(seat: number): string {
  return `hsl(${(seat * 67 + 150) % 360} 58% 46%)`;
}

/** The first letter of a seat's name, on its token. */
function initial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

/** How much of a phase is left: the bar across the top of the table, from the server's clock. */
function TimeBar({ startedAt, endsAt, now, label }: { startedAt: string; endsAt: string; now: number; label: string }): React.JSX.Element {
  const total = Math.max(1, Date.parse(endsAt) - Date.parse(startedAt));
  const left = Math.max(0, Date.parse(endsAt) - now);
  const low = left <= 10_000;
  return (
    <div className={`bf-time${low ? ' is-low' : ''}`} role="timer" aria-label={label}>
      <span className="bf-time-fill" style={{ inlineSize: `${Math.min(100, (left / total) * 100)}%` }} />
    </div>
  );
}

/**
 * Kurdish Bluff's own staging, inside the room (play/MultiRoom.tsx): a
 * table. The word sits at its head on a card of its own. While everyone
 * writes, each fake goes down face down — you see how many are on the table,
 * never what they say — and yours stays face up in front of you. Then every
 * meaning is laid out as a handwritten card, lettered, yours left out, and you
 * tap the one you believe: your token drops onto it, and the others' wait face
 * down in the tray. At the reveal the cards flip: the real one stamped, each
 * fake signed by whoever wrote it, everyone's tokens on the card they chose,
 * and the word taught with its meaning and an example. Under Reduce Motion
 * nothing flips or drops; the cards simply show their other side.
 */
export function BluffTable({ view, skew, move }: { view: BluffView; skew: number; move: Move }): React.JSX.Element | null {
  const t = useT();
  const board = view.board;
  const now = useServerClock(skew, view.status === 'active');
  const [still] = useState(prefersReducedMotion);
  const name = seatNamer(view, t);
  const mySeat = view.me?.seat ?? null;
  // the reveal is felt once: found it, or not
  const felt = useRef<number | null>(null);
  useEffect(() => {
    if (!board || board.phase !== 'reveal' || !board.reveal || felt.current === board.reveal.round) return;
    felt.current = board.reveal.round;
    const mine = board.reveal.points.find((p) => p.seat === mySeat);
    if (mine) haptic(mine.total > 0 ? 'correct' : 'wrong');
  }, [board, mySeat]);
  if (!board) return null;
  const word = dialectDirection(board.dialect);
  const present = board.scores.filter((s) => !s.left).length;
  const phaseTitle = board.phase === 'write' ? t('games.bluff.phaseWrite') : board.phase === 'vote' ? t('games.bluff.phaseVote') : t('games.bluff.phaseReveal');
  const secondsLeft = board.phaseEndsAt ? Math.max(0, Math.ceil((Date.parse(board.phaseEndsAt) - now) / 1000)) : 0;

  return (
    <div className={`bf-table${still ? ' is-still' : ''}`}>
      <header className="bf-head">
        <span className="bf-round">{t('games.bluff.round', { n: board.round, total: board.rounds })}</span>
        <span className="bf-lang">{languageName(board.language)}</span>
      </header>
      {board.phaseStartedAt && board.phaseEndsAt && board.phase !== 'done' && (
        <TimeBar startedAt={board.phaseStartedAt} endsAt={board.phaseEndsAt} now={now} label={t('games.bluff.timeLeft', { count: secondsLeft })} />
      )}

      <div className="bf-word-card">
        <span className="bf-word" lang={word.lang} dir={word.dir}>
          {board.word}
        </span>
        <h2 className="bf-phase" aria-live="polite">
          {phaseTitle}
        </h2>
      </div>

      {board.phase === 'write' && <WritePhase board={board} present={present} move={move} />}
      {board.phase === 'vote' && <VotePhase board={board} mySeat={mySeat} move={move} name={name} />}
      {board.phase === 'reveal' && board.reveal && <RevealPhase reveal={board.reveal} mySeat={mySeat} name={name} dialect={board.dialect} />}

      <Scores board={board} name={name} mySeat={mySeat} />
    </div>
  );
}

function WritePhase({ board, present, move }: { board: BluffBoard; present: number; move: Move }): React.JSX.Element {
  const t = useT();
  const mine = board.mine;
  const down = board.writtenBy.length;
  return (
    <section className="bf-write" aria-label={t('games.bluff.phaseWrite')}>
      {mine?.canWrite ? (
        <FakeForm move={move} />
      ) : mine?.knewIt ? (
        <p className="bf-knew" role="status">
          <CheckIcon size={18} /> {t('games.bluff.knewIt')}
        </p>
      ) : mine?.wrote ? (
        <figure className="bf-note is-mine">
          <figcaption className="bf-note-label">{t('games.bluff.yourFake')}</figcaption>
          <p className="bf-note-text">{mine.wrote}</p>
        </figure>
      ) : null}
      <div className="bf-pile" aria-label={t('games.bluff.written', { count: down, total: present })} role="img">
        {Array.from({ length: present }, (_, i) => (
          <span key={i} className={`bf-back${i < down ? ' is-down' : ''}`} style={{ ['--i' as string]: i }} />
        ))}
      </div>
      <p className="muted bf-count">{t('games.bluff.written', { count: down, total: present })}</p>
    </section>
  );
}

/** The fake: typed, capped, sent once; the server's chat checks have the last word on it. */
function FakeForm({ move }: { move: Move }): React.JSX.Element {
  const t = useT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = BLUFF_FAKE_MAX - Array.from(text).length;
  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!text.trim() || busy || left < 0) return;
    setBusy(true);
    setError(null);
    const res = await move({ kind: 'write', text });
    setBusy(false);
    if (!res.ok) setError(describeError(res.error, t));
    else haptic('correct');
  }
  return (
    <form className="bf-note bf-compose" onSubmit={send}>
      <label className="bf-note-label" htmlFor="bf-fake">
        {t('games.bluff.yourFake')}
      </label>
      <textarea
        id="bf-fake"
        className="bf-note-input"
        value={text}
        rows={3}
        maxLength={BLUFF_FAKE_MAX}
        placeholder={t('games.bluff.placeholder')}
        onChange={(e) => setText(e.target.value)}
        dir="auto"
        aria-describedby="bf-fake-left"
        autoFocus
      />
      <div className="bf-compose-foot">
        <span id="bf-fake-left" className="muted">
          {t('games.bluff.charsLeft', { count: Math.max(0, left) })}
        </span>
        <Button type="submit" disabled={busy || !text.trim()}>
          {busy ? '…' : t('games.bluff.send')}
        </Button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function VotePhase({ board, mySeat, move, name }: { board: BluffBoard; mySeat: number | null; move: Move; name: (seat: number) => string }): React.JSX.Element {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = board.mine;
  const options = board.options ?? [];
  async function vote(option: string): Promise<void> {
    if (!mine?.canVote || busy) return;
    setBusy(true);
    setError(null);
    const res = await move({ kind: 'vote', option });
    setBusy(false);
    if (!res.ok) setError(describeError(res.error, t));
  }
  const waitingTokens = board.votedBy.filter((s) => s !== mySeat);
  return (
    <section className="bf-vote" aria-label={t('games.bluff.phaseVote')}>
      {mine?.canVote ? <p className="muted">{t('games.bluff.voteHint')}</p> : !mine?.vote && <p className="muted">{t('games.bluff.notVoting')}</p>}
      <ul className="bf-cards">
        {options.map((o, i) => {
          const chosen = mine?.vote === o.id;
          return (
            <li key={o.id} style={{ ['--i' as string]: i }}>
              <button
                type="button"
                className={`bf-card${chosen ? ' is-chosen' : ''}`}
                aria-pressed={chosen}
                disabled={!mine?.canVote || busy}
                onClick={() => void vote(o.id)}
              >
                <span className="bf-card-letter" aria-hidden="true">
                  {o.id}
                </span>
                <span className="bf-card-text" dir="auto">
                  {o.text}
                </span>
                {chosen && mySeat !== null && (
                  <span className="bf-token is-dropped is-pinned" style={{ background: seatHue(mySeat) }} aria-label={t('games.bluff.yourVote')}>
                    {initial(name(mySeat))}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="bf-tray" role="img" aria-label={t('games.bluff.voted', { count: board.votedBy.length, total: board.voters.length })}>
        {waitingTokens.map((s) => (
          <span key={s} className="bf-token is-face-down" />
        ))}
        <span className="muted">{t('games.bluff.voted', { count: board.votedBy.length, total: board.voters.length })}</span>
      </div>
    </section>
  );
}

/** The flip: every card shows its other side — real or whose — with everyone's tokens on it, and the word is taught. */
export function RevealPhase({ reveal, mySeat, name, dialect }: { reveal: BluffReveal; mySeat: number | null; name: (seat: number) => string; dialect: BluffBoard['dialect'] }): React.JSX.Element {
  const t = useT();
  const word = dialectDirection(dialect);
  const bluffed = reveal.options.some((o) => !o.real);
  return (
    <section className="bf-reveal" aria-label={t('games.bluff.phaseReveal')}>
      <ul className="bf-cards is-revealed">
        {reveal.options.map((o, i) => (
          <li key={o.id} style={{ ['--i' as string]: i }}>
            <div className={`bf-card is-flipped${o.real ? ' is-real' : ''}`}>
              <span className="bf-card-letter" aria-hidden="true">
                {o.id}
              </span>
              <span className="bf-card-text" dir="auto">
                {o.text}
              </span>
              <span className="bf-card-verdict">
                {o.real ? (
                  <span className="bf-stamp">{t('games.bluff.real')}</span>
                ) : (
                  <span className="bf-by">{t('games.bluff.by', { names: o.authors.map(name).join(', ') })}</span>
                )}
              </span>
              {o.voters.length > 0 && (
                <span className="bf-tokens">
                  {o.voters.map((s) => (
                    <span key={s} className={`bf-token is-dropped${s === mySeat ? ' is-mine' : ''}`} style={{ background: seatHue(s) }} title={name(s)} aria-label={name(s)}>
                      {initial(name(s))}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!bluffed && <p className="muted">{t('games.bluff.nobodyBluffed')}</p>}
      <div className="bf-lesson">
        <p className="bf-lesson-word" lang={word.lang} dir={word.dir}>
          {reveal.word}
        </p>
        <p className="bf-lesson-meaning" dir="auto">
          {reveal.real}
        </p>
        {reveal.example && (
          <div className="bf-example">
            <span className="bf-example-label">{t('games.bluff.example')}</span>
            <p lang={word.lang} dir={word.dir}>
              {reveal.example.ku}
            </p>
            {reveal.example.meaning && (
              <p className="muted" dir="auto">
                {reveal.example.meaning}
              </p>
            )}
          </div>
        )}
      </div>
      <ul className="bf-points">
        {reveal.points
          .filter((p) => p.total > 0)
          .map((p) => (
            <li key={p.seat} className={p.seat === mySeat ? 'is-mine' : undefined}>
              <span className="bf-points-name">{name(p.seat)}</span>
              {p.found + p.knewIt > 0 && <span className="bf-chip">{t('games.bluff.found', { count: p.found + p.knewIt })}</span>}
              {p.fooled > 0 && <span className="bf-chip is-fooled">{t('games.bluff.fooled', { count: p.fooled })}</span>}
            </li>
          ))}
      </ul>
    </section>
  );
}

function Scores({ board, name, mySeat }: { board: BluffBoard; name: (seat: number) => string; mySeat: number | null }): React.JSX.Element {
  const t = useT();
  const sorted = [...board.scores].sort((a, b) => b.score - a.score || a.seat - b.seat);
  return (
    <section className="bf-scores" aria-label={t('games.bluff.scores')}>
      <ul>
        {sorted.map((s) => (
          <li key={s.seat} className={`${s.seat === mySeat ? 'is-mine' : ''}${s.left ? ' is-gone' : ''}`}>
            <span className="bf-token" style={{ background: seatHue(s.seat) }} aria-hidden="true">
              {initial(name(s.seat))}
            </span>
            <span className="bf-scores-name">{name(s.seat)}</span>
            <span className="bf-scores-points">{t('games.bluff.points', { count: s.score })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
