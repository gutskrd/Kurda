import { useEffect, useRef, useState } from 'react';
import {
  IMPOSTOR_CLUE_LIMITS,
  dialectDirection,
  impostorClueSlip,
  meaningIn,
  type ImpostorBoard,
  type ImpostorOutcome,
  type MultiMoveAnswer,
  type MultiView,
} from '@kurda/shared';
import { Button } from '../components/Button';
import { ImpostorIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { haptic } from '../lib/haptics';
import { prefersReducedMotion } from '../lib/motion';
import type { ApiResult } from '../lib/types';
import { seatNamer } from '../play/MultiRoom';
import { useServerClock } from '../stories/useStoryGame';
import { PartyComposer } from '../party/Composer';
import { PartyTimer, secondsLeft } from '../party/PartyPage';
import { SLIP_KEY, partyTextError } from '../party/text';

export type ImpostorView = MultiView<ImpostorBoard | null>;
type Move = (body: unknown) => Promise<ApiResult<MultiMoveAnswer<ImpostorBoard | null, ImpostorOutcome>>>;

/** How each way the game can end reads, above the places. */
export const IMPOSTOR_END_KEY: Record<NonNullable<ImpostorBoard['endedBy']>, MessageKey> = {
  escaped: 'games.impostor.end.escaped',
  caught: 'games.impostor.end.caught',
  guessed: 'games.impostor.end.guessed',
  'impostor-left': 'games.impostor.end.left',
  'too-few': 'games.impostor.end.tooFew',
  abandoned: 'games.impostor.end.tooFew',
};

/** The seats of the table in two rows around it, the first half across the top. */
function rows<T>(items: readonly T[]): [T[], T[]] {
  const top = Math.ceil(items.length / 2);
  return [items.slice(0, top), items.slice(top)];
}

/**
 * Kurdish Impostor's own staging, inside the room (play/MultiRoom.tsx):
 *
 * - a table with the players seated around it, the one giving a clue in a
 *   pool of light, and on the table your card — the word and its meaning, or
 *   that you are the impostor, with the category everyone is shown;
 * - the clues so far, round by round, each in the game's Kurdish;
 * - on your turn the clue box, which says a slip it can see before the clue
 *   is sent; in the vote, a button for each other player; once the impostor
 *   is caught, the four words they guess from.
 *
 * The countdown is drawn from the server's clock. Under Reduce Motion the
 * light does not move and the cards do not turn; the colours say it.
 */
export function ImpostorBoardView({ view, skew, move }: { view: ImpostorView; skew: number; move: Move }): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const board = view.board;
  const now = useServerClock(skew, view.status === 'active');
  const [still] = useState(prefersReducedMotion);
  const name = seatNamer(view, t);
  const clueCount = board?.clues.length ?? 0;
  const seenClues = useRef(clueCount);
  useEffect(() => {
    if (clueCount > seenClues.current && board?.clues.at(-1)?.seat === view.me?.seat) haptic('correct');
    seenClues.current = clueCount;
  }, [clueCount, board, view.me?.seat]);

  if (!board) return null;
  const script = dialectDirection(board.dialect);
  const speaking = board.phase === 'clues' ? (board.turn?.seat ?? null) : null;
  const wait = board.phase === 'clues' ? board.turn : board.phase === 'vote' ? board.vote : board.guess;
  const seconds = secondsLeft(wait?.endsAt, now);
  const mine = board.yourTurn || board.yourVote || board.yourGuess;
  const status =
    board.phase === 'clues'
      ? board.yourTurn
        ? t('games.impostor.yourTurn')
        : t('games.impostor.theirTurn', { name: name(board.turn?.seat ?? 0) })
      : board.phase === 'vote'
        ? t('games.impostor.vote.title')
        : board.phase === 'guess' && board.guess
          ? board.yourGuess
            ? t('games.impostor.guessPrompt')
            : t('games.impostor.guessWaiting', { name: name(board.guess.seat) })
          : '';
  const [top, bottom] = rows(board.seats);
  const voted = new Set(board.vote?.voted ?? []);

  const seat = (s: ImpostorBoard['seats'][number]): React.JSX.Element => {
    const p = view.players.find((x) => x.seat === s.seat);
    const theirs = board.clues.filter((c) => c.seat === s.seat);
    return (
      <li
        key={s.seat}
        className={`imp-seat${speaking === s.seat ? ' is-speaking' : ''}${p?.isMe ? ' is-me' : ''}${s.left ? ' is-gone' : ''}${voted.has(s.seat) ? ' has-voted' : ''}`}
        aria-current={speaking === s.seat ? 'true' : undefined}
      >
        <span className="imp-seat-disc" aria-hidden="true">
          {name(s.seat).slice(0, 1).toUpperCase()}
        </span>
        <span className="imp-seat-name">{name(s.seat)}</span>
        <span className="imp-seat-tag">
          {speaking === s.seat
            ? t('games.impostor.speaking')
            : voted.has(s.seat)
              ? t('games.impostor.voted')
              : s.left
                ? t('games.lastLetter.reason.gone')
                : p?.away
                  ? t('play.room.away')
                  : t('games.impostor.clueCount', { count: theirs.filter((c) => c.text !== null).length })}
        </span>
      </li>
    );
  };

  return (
    <div className={`imp-board${still ? ' is-still' : ''}`}>
      <div className="imp-status" aria-live="polite">
        <p className="imp-phase">
          {board.phase === 'clues' && board.turn
            ? t('games.impostor.round', { round: board.turn.round, rounds: board.rounds })
            : board.phase === 'vote'
              ? t('games.impostor.vote.phase')
              : t('games.impostor.guessPhase')}
        </p>
        <p className={`imp-whose${mine ? ' is-mine' : ''}`}>{status}</p>
        {board.phase === 'guess' && board.accused && <p className="imp-caught">{t('games.impostor.caught', { name: name(board.accused.seat) })}</p>}
      </div>
      {wait && <PartyTimer startedAt={wait.startedAt} endsAt={wait.endsAt} now={now} low={mine && seconds <= 5} label={t('games.party.timeLeft', { count: seconds })} />}

      <div className="imp-table" role="group" aria-label={t('games.impostor.table')}>
        <ol className="imp-seats is-top">{top.map(seat)}</ol>
        <div className="imp-table-top">
          <HandCard board={board} locale={locale} />
        </div>
        <ol className="imp-seats is-bottom" start={top.length + 1}>
          {bottom.map(seat)}
        </ol>
      </div>

      <section className="imp-clues" aria-labelledby="imp-clues-title">
        <h3 id="imp-clues-title" className="imp-section-title">
          {t('games.impostor.clues')}
        </h3>
        {board.clues.length === 0 ? (
          <p className="muted">{t('games.impostor.noCluesYet')}</p>
        ) : (
          <div className="imp-rounds">
            {Array.from({ length: board.rounds }, (_, r) => r + 1).map((round) => {
              const list = board.clues.filter((c) => c.round === round);
              if (list.length === 0) return null;
              return (
                <div key={round} className="imp-round">
                  <p className="imp-round-title">{t('games.impostor.roundShort', { round })}</p>
                  <ul className="imp-clue-list">
                    {list.map((c, i) => (
                      <li key={`${c.seat}:${i}`} className={`imp-clue${c.seat === view.me?.seat ? ' is-mine' : ''}`}>
                        <span className="imp-clue-by">{name(c.seat)}</span>
                        {c.text === null ? (
                          <span className="imp-clue-text is-none">{t('games.impostor.noClue')}</span>
                        ) : (
                          <span className="imp-clue-text" lang={script.lang} dir={script.dir}>
                            {c.text}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {board.yourTurn && (
        <PartyComposer
          id="imp-clue"
          label={t('games.impostor.yourClue')}
          placeholder={script.dir === 'rtl' ? '…' : t('games.impostor.cluePlaceholder')}
          sendLabel={t('games.impostor.send')}
          dialect={board.dialect}
          maxLength={IMPOSTOR_CLUE_LIMITS.maxChars}
          slip={(text) => {
            const why = impostorClueSlip(board, text);
            if (!why) return null;
            if (why === 'says-word') return t('games.impostor.slip.saysWord');
            const key = SLIP_KEY[why as keyof typeof SLIP_KEY];
            return key ? t(key) : null;
          }}
          onSend={(clue) => move({ clue })}
          errorOf={(e) => partyTextError(e, t, 'games.impostor.slip.saysWord')}
        />
      )}

      {board.phase === 'vote' && view.me && <VotePanel view={view} board={board} name={name} move={move} />}
      {board.phase === 'guess' && board.guess && <GuessPanel board={board} move={move} />}
    </div>
  );
}

/** The viewer's card on the table: the category for everyone, the word and its meaning for all but the impostor. */
function HandCard({ board, locale }: { board: ImpostorBoard; locale: string }): React.JSX.Element {
  const t = useT();
  const script = dialectDirection(board.dialect);
  const hand = board.hand;
  const impostor = hand?.role === 'impostor';
  return (
    <div className={`imp-card is-face${impostor ? ' is-impostor' : ''}`} aria-label={t('games.impostor.yourCard')} role="group">
      <p className="imp-card-label">{t('games.impostor.category')}</p>
      <p className="imp-card-hint">
        <span lang={script.lang} dir={script.dir}>
          {board.hint.ku}
        </span>
        <span className="imp-card-meaning"> · {meaningIn(board.hint.meanings, locale)}</span>
      </p>
      {hand?.role === 'player' && (
        <>
          <p className="imp-card-word" lang={script.lang} dir={script.dir}>
            {hand.word}
          </p>
          <p className="imp-card-meaning">{meaningIn(hand.meanings, locale)}</p>
        </>
      )}
      {impostor && (
        <>
          <p className="imp-card-word is-impostor">
            <ImpostorIcon size={26} /> {t('games.impostor.youAreImpostor')}
          </p>
          <p className="imp-card-meaning">{t('games.impostor.blendIn')}</p>
        </>
      )}
    </div>
  );
}

function VotePanel({ view, board, name, move }: { view: ImpostorView; board: ImpostorBoard; name: (seat: number) => string; move: Move }): React.JSX.Element {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = board.seats.filter((s) => !s.left && s.seat !== view.me?.seat);
  const present = board.seats.filter((s) => !s.left).length;
  const mine = board.vote?.mine ?? null;

  async function vote(seat: number): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await move({ vote: seat });
    setBusy(false);
    if (!res.ok) setError(partyTextError(res.error, t, 'games.impostor.slip.saysWord'));
  }

  return (
    <section className="imp-vote" aria-labelledby="imp-vote-title">
      <h3 id="imp-vote-title" className="imp-section-title">
        {t('games.impostor.vote.title')}
      </h3>
      {mine !== null ? (
        <p className="imp-vote-cast" role="status">
          {t('games.impostor.vote.cast', { name: name(mine) })}
        </p>
      ) : board.yourVote ? (
        <div className="imp-vote-options">
          {others.map((s) => (
            <Button key={s.seat} variant="secondary" disabled={busy} onClick={() => void vote(s.seat)}>
              {t('games.impostor.vote.pick', { name: name(s.seat) })}
            </Button>
          ))}
        </div>
      ) : null}
      <p className="muted">{t('games.impostor.vote.waiting', { count: board.vote?.voted.length ?? 0, total: present })}</p>
      {error && (
        <p className="party-hint" role="status">
          {error}
        </p>
      )}
    </section>
  );
}

function GuessPanel({ board, move }: { board: ImpostorBoard; move: Move }): React.JSX.Element {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const script = dialectDirection(board.dialect);
  const options = board.guess?.options ?? [];
  async function guess(option: number): Promise<void> {
    setBusy(true);
    const res = await move({ guess: option });
    setBusy(false);
    if (res.ok) haptic(res.data.outcome.kind === 'guess' && res.data.outcome.right ? 'correct' : 'wrong');
  }
  return (
    <section className="imp-guess" aria-label={t('games.impostor.guessPrompt')}>
      <div className="imp-guess-options">
        {options.map((o, i) => (
          <Button key={`${o}:${i}`} variant="secondary" className="imp-guess-option" disabled={busy || !board.yourGuess} onClick={() => void guess(i)}>
            <span lang={script.lang} dir={script.dir}>
              {o}
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}

/**
 * The reveal, once the game is over: every seat's card turns over — the
 * impostor's shows who they were, the rest the word — then the word with its
 * meaning, how it ended, every clue and who voted for whom.
 */
export function ImpostorReveal({ view }: { view: ImpostorView }): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const board = view.board;
  const [still] = useState(prefersReducedMotion);
  const [turned, setTurned] = useState(still);
  useEffect(() => {
    if (still) return;
    const frame = requestAnimationFrame(() => setTurned(true));
    return () => cancelAnimationFrame(frame);
  }, [still]);
  if (!board?.reveal) return null;
  const reveal = board.reveal;
  const name = seatNamer(view, t);
  const script = dialectDirection(board.dialect);
  return (
    <div className={`imp-reveal${still ? ' is-still' : ''}`}>
      <ol className="imp-reveal-cards" aria-label={t('games.impostor.table')}>
        {board.seats.map((s, i) => {
          const isImpostor = s.seat === reveal.impostor;
          return (
            <li key={s.seat} className={`imp-flip${turned ? ' is-turned' : ''}${isImpostor ? ' is-impostor' : ''}`} style={{ ['--i' as string]: i }}>
              <span className="imp-flip-inner">
                <span className="imp-flip-back" aria-hidden="true" />
                <span className="imp-flip-face">
                  {isImpostor ? (
                    <>
                      <ImpostorIcon size={20} />
                      <span>{t('games.impostor.impostorTag')}</span>
                    </>
                  ) : (
                    <span lang={script.lang} dir={script.dir}>
                      {reveal.word}
                    </span>
                  )}
                </span>
              </span>
              <span className="imp-flip-name">{name(s.seat)}</span>
            </li>
          );
        })}
      </ol>
      <div className="imp-reveal-word">
        <p className="imp-card-label">{t('games.impostor.reveal.title')}</p>
        <p className="imp-card-word" lang={script.lang} dir={script.dir}>
          {reveal.word}
        </p>
        <p className="imp-card-meaning">{meaningIn(reveal.meanings, locale)}</p>
      </div>
      <p className="imp-reveal-who">
        {reveal.impostor === view.me?.seat ? t('games.impostor.reveal.youWere') : t('games.impostor.reveal.impostor', { name: name(reveal.impostor) })}
      </p>
      {board.endedBy && <p className="muted">{t(IMPOSTOR_END_KEY[board.endedBy])}</p>}
      {reveal.guessed && (
        <p className="muted">
          {t('games.impostor.guessedWith')}{' '}
          <span lang={script.lang} dir={script.dir}>
            {reveal.guessed}
          </span>
        </p>
      )}
      {reveal.votes.length > 0 && (
        <section aria-labelledby="imp-votes-title">
          <h3 id="imp-votes-title" className="imp-section-title">
            {t('games.impostor.votes')}
          </h3>
          <ul className="imp-votes">
            {reveal.votes.map((v) => (
              <li key={v.seat}>{v.for === null ? t('games.impostor.noVote', { name: name(v.seat) }) : t('games.impostor.votedFor', { name: name(v.seat), target: name(v.for) })}</li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="imp-reveal-clues">
        <h3 id="imp-reveal-clues" className="imp-section-title">
          {t('games.impostor.clues')}
        </h3>
        <ul className="imp-clue-list">
          {board.clues.map((c, i) => (
            <li key={i} className={`imp-clue${c.seat === reveal.impostor ? ' is-impostor' : ''}`}>
              <span className="imp-clue-by">{name(c.seat)}</span>
              {c.text === null ? (
                <span className="imp-clue-text is-none">{t('games.impostor.noClue')}</span>
              ) : (
                <span className="imp-clue-text" lang={script.lang} dir={script.dir}>
                  {c.text}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
