import { useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  WHO_AM_I_ANSWER_SECONDS,
  WHO_AM_I_ASK_SECONDS,
  WHO_AM_I_COUCH_MAX_PLAYERS,
  WHO_AM_I_COUCH_MIN_PLAYERS,
  WHO_AM_I_DECIDE_SECONDS,
  WHO_AM_I_HELP_POINTS,
  WHO_AM_I_TABLE_MAX_PLAYERS,
  WHO_AM_I_TABLE_MIN_PLAYERS,
  learnGame,
  whoAmIPoints,
  type GameDifficulty,
  type MultiMoveAnswer,
  type MultiView,
  type WhoAmITableBoard,
  type WhoAmITableMove,
  type WhoAmITableOutcome,
} from '@kurda/shared';
import { Button } from '../components/Button';
import { HelpIcon } from '../components/icons';
import { Loading } from '../components/states';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { describeError } from '../lib/api';
import type { ApiError, ApiResult } from '../lib/types';
import { haptic } from '../lib/haptics';
import { prefersReducedMotion } from '../lib/motion';
import { InviteForm } from '../play/InviteSheet';
import { GameRoom, seatNamer } from '../play/MultiRoom';
import { useGameView } from '../play/useGameView';
import { useServerClock } from '../stories/useStoryGame';
import { GameHead, stageTone } from '../games/GameHead';
import { useGameDialect } from '../games/soloRounds';
import { groupDialects, useMpAvailability } from '../games/mpAvailability';
import { DIFFICULTY_KEY, type TableOffer } from '../games/partyChoices';
import { dialectName } from '../learn/map';
import { Couch, useCouchOffers } from './Couch';
import {
  AnswerPanel,
  ForeheadCard,
  Foreheads,
  GuessTiles,
  QuestionCard,
  QuestionDeck,
  ScoringNote,
  Stamp,
  VerdictCard,
  WHO_AM_I_END_KEY,
  WHO_AM_I_PATH,
  WithWord,
  yesNo,
  type TableSeat,
} from './WhoAmIStage';
import '../learn/path.css';
import './whoami.css';

const TONE = learnGame('who-am-i').tone;

type Board = WhoAmITableBoard;
type View = MultiView<Board | null>;
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** How long each of a turn's three waits is given, for the bar that empties with it. */
const PHASE_SECONDS: Record<Board['phase'], number> = { ask: WHO_AM_I_ASK_SECONDS, answer: WHO_AM_I_ANSWER_SECONDS, decide: WHO_AM_I_DECIDE_SECONDS };

/**
 * Who Am I? (/app/games/who-am-i): everyone wears a card on their forehead
 * that everyone else can read and they cannot, and finds out who they are by
 * asking yes/no questions in Kurdish. It is never played alone. Three pages
 * in one:
 *
 *   /app/games/who-am-i            the start: the two ways to play
 *   /app/games/who-am-i?couch=1    one phone passed round a room (Couch.tsx)
 *   /app/games/who-am-i?id=…       a table with friends online (play/MultiRoom.tsx)
 *
 * Each way is offered only where approved identities and questions allow,
 * and nothing says "coming soon". An address left over from the round that
 * used to be played alone (`?solo=1`) lands on the start.
 */
export function WhoAmI(): React.JSX.Element {
  const [params] = useSearchParams();
  const t = useT();
  const id = params.get('id');
  const couch = !id && params.get('couch') === '1';
  return (
    <div className={`container game-page wa-page gs lp-tone-${TONE}`} style={stageTone('who-am-i')}>
      {couch ? (
        <Couch />
      ) : (
        <>
          <GameHead game="who-am-i" title={t('games.whoAmI.name')} />
          {id ? <Room key={id} id={id} /> : <Start />}
        </>
      )}
    </div>
  );
}

/**
 * The start: the hidden deer on the night, what the game is in a line, and
 * the two ways to play it, each a card with its own way in. A way the
 * reviewed words cannot fill yet is left out, and with neither the page says
 * so plainly.
 */
function Start(): React.JSX.Element {
  const t = useT();
  const dialect = useGameDialect();
  const tables = useMpAvailability<TableOffer>('who-am-i');
  const phones = useCouchOffers();
  if (tables === null || phones === null) return <Loading />;
  const online = groupDialects(tables).length > 0;
  const onePhone = phones.length > 0;
  if (!online && !onePhone) {
    return (
      <div className="state wa-not-offered">
        <HelpIcon size={32} />
        <p>{t('games.whoAmI.notOffered')}</p>
        <Link to="/app/games" className="btn btn-secondary">
          {t('games.back')}
        </Link>
      </div>
    );
  }
  return (
    <div className="wa-start">
      <div className="gs-hero">
        <div className="wa-start-stage">
          <ForeheadCard dialect={dialect} category={null} identity={null} />
        </div>
        <p className="gs-hero-line">{t('games.whoAmI.intro')}</p>
      </div>
      {onePhone && (
        <section className="wa-way" aria-labelledby="wa-way-phone">
          <h2 id="wa-way-phone" className="wa-way-title">
            {t('games.whoAmI.way.phone')}
          </h2>
          <p className="muted">{t('games.whoAmI.way.phoneBlurb', { min: WHO_AM_I_COUCH_MIN_PLAYERS, max: WHO_AM_I_COUCH_MAX_PLAYERS })}</p>
          <Link to={`${WHO_AM_I_PATH}?couch=1`} className="btn btn-primary btn-lg wa-way-go">
            {t('games.couch.open')}
          </Link>
        </section>
      )}
      {online && (
        <section className="wa-way" aria-labelledby="wa-way-online">
          <h2 id="wa-way-online" className="wa-way-title">
            {t('games.whoAmI.way.online')}
          </h2>
          <p className="muted">{t('games.whoAmI.way.onlineBlurb', { min: WHO_AM_I_TABLE_MIN_PLAYERS, max: WHO_AM_I_TABLE_MAX_PLAYERS })}</p>
          <InviteForm target={{ kind: 'new', game: 'who-am-i' }} lockGame heading={false} />
        </section>
      )}
      <ScoringNote />
    </div>
  );
}

// ---------- the table with friends online ----------

/** The sooner of the turn's wait and the game's own end: when the server next has something to settle. */
function nextDeadline(board: Board): string {
  return Date.parse(board.endsAt) < Date.parse(board.phaseEndsAt) ? board.endsAt : board.phaseEndsAt;
}

function Room({ id }: { id: string }): React.JSX.Element {
  const t = useT();
  const room = useGameView<Board | null, WhoAmITableOutcome>('who-am-i', id, { deadlineOf: (v) => (v.board ? nextDeadline(v.board) : null) });
  return (
    <GameRoom
      game="who-am-i"
      id={id}
      room={room}
      newPath={WHO_AM_I_PATH}
      newLabel={t('games.whoAmI.name')}
      lobbyNote={(v) => {
        const s = v.settings as { difficulty?: GameDifficulty; minutes?: number };
        return (
          <p className="wa-lobby-note muted">
            <span lang={v.dialect === 'ckb' ? 'ckb' : 'ku'}>{dialectName(v.dialect === 'ckb' ? 'sorani' : 'kurmanci')}</span>
            {s.difficulty ? ` · ${t(DIFFICULTY_KEY[s.difficulty])}` : null}
            {s.minutes ? ` · ${t('games.whoAmI.minutesCount', { count: s.minutes })}` : null}
          </p>
        );
      }}
      playing={(v) => (v.board ? <TableBoard view={v} board={v.board} skew={room.skew} move={room.move} refresh={room.refresh} /> : null)}
      ending={(v) => <Ending view={v} />}
      scoreOf={(r) => t('games.whoAmI.points', { count: r.score })}
    />
  );
}

/** A refused move, in the reader's words: not their turn, or a move the turn is no longer waiting for. */
function moveError(error: ApiError, t: Translate): string {
  if (error.code === 'NOT_YOUR_TURN') return t('games.party.notYourTurn');
  if (error.code === 'MOVE_REFUSED' || error.code === 'NOT_ACTIVE') return t('games.party.notNow');
  return describeError(error, t);
}

/** Minutes and seconds, for the time the whole game has left. */
function clock(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** Brings a part of the page to the top of the window when it is not wholly in view already. */
function bringIntoView(el: HTMLElement): void {
  const box = el.getBoundingClientRect();
  if (box.top >= 0 && box.bottom <= window.innerHeight) return;
  el.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

/** Everyone at the table as the stage draws them: the server's own seats, each by its name. */
function tableSeats(board: Board, me: number | null, name: (seat: number) => string): TableSeat[] {
  // a seat's card is whatever the server sent this viewer: null for their own until it comes off
  return board.seats.map((s) => ({ seat: s.seat, name: name(s.seat), card: s.card, own: s.seat === me, asked: s.asked, points: s.points, solved: s.solved, out: s.out, left: s.left }));
}

/**
 * The table's own staging, inside the room (play/MultiRoom.tsx):
 *
 * - whose turn it is and what the turn is waiting for, with the wait's
 *   countdown drawn from the server's clock;
 * - everyone's forehead, the reader's own card hidden until it comes off;
 * - then what the reader can do now: on their turn, their tiles and their
 *   questions; while a friend's question is on the table, that friend's card
 *   and the dialect's yes and no; once the card has answered, its verdict
 *   and how everyone answered, with the tiles again for whoever asked.
 *
 * The page draws only what the server's view holds. The reader's own card is
 * in it only once it is off their forehead, so nothing here could show it
 * sooner.
 *
 * A turn's waits are short, and on a phone the page is longer than the
 * screen. So when the table moves on to something that concerns the reader
 * (a question for them to answer, the card's verdict, their own turn), that
 * part is brought into view; nothing moves for a turn that is not theirs to
 * act on.
 */
function TableBoard({
  view,
  board,
  skew,
  move,
  refresh,
}: {
  view: View;
  board: Board;
  skew: number;
  move: (body: unknown) => Promise<ApiResult<MultiMoveAnswer<Board | null, WhoAmITableOutcome>>>;
  refresh: () => void;
}): React.JSX.Element {
  const t = useT();
  const now = useServerClock(skew, view.status === 'active');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the reader's last guess, to say what came of it
  const [guessed, setGuessed] = useState<{ tile: string; correct: boolean } | null>(null);

  const me = view.me?.seat ?? null;
  const mine = board.mine;
  const name = seatNamer(view, t);
  const turn = board.turn;
  const myTurn = turn !== null && turn === me;
  const guessing = !!mine && !mine.solved && !mine.out;
  const mayAnswer = board.phase === 'answer' && me !== null && (board.pending?.waiting.includes(me) ?? false);
  const mayGuess = myTurn && guessing && board.phase !== 'answer';
  const mayAsk = myTurn && guessing && board.phase === 'ask';
  const crossed = mine?.guesses.filter((g) => !g.correct).map((g) => g.tile) ?? [];
  const lines = turnLines(board, me, name, t);
  // A refusal explains a press that did nothing, and a wrong guess is news until the next thing is asked of the reader:
  // both stay while they wait, and go when the move is theirs again.
  const myMove = mayGuess || mayAnswer;
  useEffect(() => {
    if (!myMove) return;
    setError(null);
    setGuessed(null);
  }, [myMove]);

  const top = useRef<HTMLDivElement>(null);
  const news = useRef<HTMLDivElement>(null);
  const arrived = useRef(true);
  const wait = `${board.turns}:${board.phase}`;
  useEffect(() => {
    // the page opens at its top, wherever the table stands
    if (arrived.current) {
      arrived.current = false;
      return;
    }
    if (me === null) return;
    // a question or a verdict is everyone's at the table; a new turn only its own player's
    const part = board.phase === 'ask' ? (myTurn ? top.current : null) : news.current;
    if (part) bringIntoView(part);
    // only when the table moves on to another wait: `me`, `myTurn` and the phase are read as they stand then
  }, [wait]);

  const act = async (body: WhoAmITableMove): Promise<void> => {
    setBusy(true);
    setError(null);
    setGuessed(null);
    const res = await move(body);
    setBusy(false);
    if (!res.ok) {
      setError(moveError(res.error, t));
      // the table may have moved on without this page hearing of it: a refusal is the moment to look again
      refresh();
      return;
    }
    if (body.kind === 'guess') {
      const correct = res.data.outcome.correct === true;
      haptic(correct ? 'celebrate' : 'wrong');
      setGuessed({ tile: body.tile, correct });
    }
  };

  const phaseLeft = Math.max(0, Date.parse(board.phaseEndsAt) - now);
  const seconds = Math.ceil(phaseLeft / 1000);
  const share = Math.min(1, phaseLeft / (PHASE_SECONDS[board.phase] * 1000));
  const low = myMove && seconds <= 5;
  const wrongTile = guessed && !guessed.correct ? mine?.tiles.find((x) => x.id === guessed.tile) : undefined;

  return (
    <div className="wa-board" ref={top}>
      <div className={`wa-turn${myTurn || mayAnswer ? ' is-mine' : ''}`}>
        {/* the turn and what it waits for are said to a screen reader as they change; the clock beside them is not */}
        <div className="wa-turn-text" aria-live="polite" aria-atomic="true">
          {lines && (
            <>
              <p className="wa-turn-whose">{lines.whose}</p>
              <p className="wa-turn-wait">{lines.wait}</p>
              {board.phase === 'decide' && board.told && (
                <span className="sr-only">
                  {t('games.whoAmI.cardSays')} {yesNo(board.dialect, board.told.truth, t)}
                </span>
              )}
            </>
          )}
        </div>
        <div className={`wa-timer${low ? ' is-low' : ''}`} role="timer" aria-label={t('games.whoAmI.timeLeft', { count: seconds })}>
          <span className="wa-timer-left" aria-hidden="true">
            {seconds}
          </span>
          <span className="wa-timer-bar" aria-hidden="true">
            <span className="wa-timer-fill" style={{ transform: `scaleX(${share})` }} />
          </span>
        </div>
        <p className="wa-turn-game muted">{t('games.whoAmI.gameLeft', { time: clock(Date.parse(board.endsAt) - now) })}</p>
      </div>

      <Foreheads dialect={board.dialect} seats={tableSeats(board, me, name)} turn={turn} label={t('games.whoAmI.table')} />

      {/* what became of the reader's own card and of their last guess: always here, so a change in it is announced */}
      <div className="wa-mine" role="status">
        {mine?.identity && (mine.solved || mine.out) ? (
          <>
            {mine.out && <p className="wa-mine-line">{t('games.whoAmI.out')}</p>}
            <p className="wa-mine-line is-strong">
              <WithWord text={t(mine.solved ? 'games.whoAmI.youAre' : 'games.whoAmI.youWere')} word={mine.identity.word} dialect={board.dialect} />
            </p>
            <p className="wa-mine-line">{t('games.whoAmI.keepAnswering', { count: WHO_AM_I_HELP_POINTS })}</p>
          </>
        ) : wrongTile && mine ? (
          <p className="wa-mine-line is-strong">
            <WithWord text={t('games.whoAmI.notWord')} word={wrongTile.word} dialect={board.dialect} /> {t('games.whoAmI.guessesLeft', { count: mine.guessesLeft })}
          </p>
        ) : null}
      </div>

      {error && (
        <p className="msg msg-error" role="alert">
          {error}
        </p>
      )}

      {/* what the table is busy with now: a question being answered, or the card's verdict on it */}
      <div className="wa-news" ref={news}>
        {board.phase === 'answer' && board.pending && (
          <Pending board={board} pending={board.pending} me={me} name={name} busy={busy} onAnswer={(yes) => void act({ kind: 'answer', yes })} />
        )}
        {board.phase === 'decide' && board.told && <Told board={board} told={board.told} me={me} name={name} />}
      </div>

      {mine && guessing && (
        <div className="wa-hand">
          <p className="wa-worth">
            {`${t('games.whoAmI.worth', { count: whoAmIPoints(mine.asked.length, crossed.length, true) })} · ${t('games.whoAmI.guessesLeft', { count: mine.guessesLeft })}`}
          </p>
          <GuessTiles dialect={board.dialect} tiles={mine.tiles} crossed={crossed} canGuess={mayGuess} busy={busy} onGuess={(tile) => void act({ kind: 'guess', tile })}>
            {mine.mustGuess ? null : (
              <Button variant="secondary" disabled={busy} onClick={() => void act({ kind: 'pass' })}>
                {t('games.whoAmI.pass')}
              </Button>
            )}
          </GuessTiles>
          {mayGuess && mine.mustGuess && <p className="wa-must">{t('games.whoAmI.mustGuess')}</p>}
          <QuestionDeck dialect={board.dialect} questions={mine.questions} asked={mine.asked} canAsk={mayAsk} disabled={busy} onAsk={(question) => void act({ kind: 'ask', question })} />
        </div>
      )}

      {/* the last question stays on the table while the next player chooses theirs, for whoever had not read it yet */}
      {board.phase === 'ask' && board.told && <Told board={board} told={board.told} me={me} name={name} />}

      <ScoringNote />
    </div>
  );
}

/** Whose turn it is, and what the turn is waiting for, in the reader's words. */
function turnLines(board: Board, me: number | null, name: (seat: number) => string, t: Translate): { whose: string; wait: string } | null {
  const turn = board.turn;
  if (turn === null) return null;
  const mine = turn === me;
  const who = name(turn);
  const whose = mine ? t('games.lastLetter.yourTurn') : t('games.whoAmI.turn.theirs', { name: who });
  if (board.phase === 'answer') {
    const pending = board.pending;
    if (mine) return { whose, wait: t('games.whoAmI.wait.answer.asker') };
    if (me !== null && pending?.waiting.includes(me)) return { whose, wait: t('games.whoAmI.wait.answer.you', { name: who }) };
    if (me !== null && pending?.answered.includes(me)) return { whose, wait: t('games.whoAmI.wait.answer.done') };
    return { whose, wait: t('games.whoAmI.wait.answer.watch', { name: who }) };
  }
  if (!mine) return { whose, wait: t(board.phase === 'ask' ? 'games.whoAmI.wait.ask.theirs' : 'games.whoAmI.wait.decide.theirs', { name: who }) };
  // with every question asked there is nothing left to wait for: the turn says so wherever it stands
  if (board.mine?.mustGuess) return { whose, wait: t('games.whoAmI.mustGuess') };
  return { whose, wait: t(board.phase === 'ask' ? 'games.whoAmI.wait.ask.mine' : 'games.whoAmI.wait.decide.mine') };
}

/**
 * A question on the table: for whoever asked it, their question and who has
 * answered so far (never what); for everyone else, the asker's card beside
 * the question, and the dialect's yes and no until they have answered.
 */
function Pending({
  board,
  pending,
  me,
  name,
  busy,
  onAnswer,
}: {
  board: Board;
  pending: NonNullable<Board['pending']>;
  me: number | null;
  name: (seat: number) => string;
  busy: boolean;
  onAnswer: (yes: boolean) => void;
}): React.JSX.Element {
  const t = useT();
  const title = useId();
  const asker = pending.seat === me;
  const who = name(pending.seat);
  // the asker's card as this reader was sent it: there for everyone who answers, and never for the asker
  const card = asker ? null : (board.seats.find((s) => s.seat === pending.seat)?.card ?? null);
  const mayAnswer = me !== null && pending.waiting.includes(me);
  const heading = asker ? t('games.whoAmI.yourQuestion') : t('games.whoAmI.asks', { name: who });
  const answering = [...pending.answered.map((seat) => ({ seat, done: true })), ...pending.waiting.map((seat) => ({ seat, done: false }))].sort((a, b) => a.seat - b.seat);
  return (
    <section className="wa-pending" aria-labelledby={title}>
      <h2 id={title} className="wa-title">
        {heading}
      </h2>
      <QuestionCard key={pending.question.id} dialect={board.dialect} question={pending.question} large />
      {card && <ForeheadCard dialect={board.dialect} category={null} identity={card} label={t('games.couch.cardOf', { name: who })} />}
      {asker ? (
        <p className="wa-pending-note">{t('games.whoAmI.wait.answer.asker')}</p>
      ) : mayAnswer ? (
        <AnswerPanel dialect={board.dialect} label={heading} disabled={busy} onAnswer={onAnswer} />
      ) : pending.mine !== null ? (
        <p className="wa-pending-note">
          {t('games.whoAmI.wait.answer.done')} <Stamp dialect={board.dialect} answer={pending.mine} />
        </p>
      ) : null}
      <ul className="wa-who" aria-label={t('games.whoAmI.whoAnswered')}>
        {answering.map((a) => (
          <li key={a.seat} className={a.done ? 'is-done' : ''}>
            <span className="wa-who-name">{name(a.seat)}</span>{' '}
            <span className="wa-who-mark">{t(a.done ? 'games.whoAmI.answered' : 'games.whoAmI.thinking')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The card's verdict on the last question, for everyone: what it said, and who answered right. */
function Told({ board, told, me, name }: { board: Board; told: NonNullable<Board['told']>; me: number | null; name: (seat: number) => string }): React.JSX.Element {
  const t = useT();
  const own = told.answers.find((a) => a.seat === me);
  return (
    <VerdictCard dialect={board.dialect} by={told.seat === me ? t('games.whoAmI.youAsked') : t('games.whoAmI.theyAsked', { name: name(told.seat) })} question={told.question} truth={told.truth}>
      {own && (
        <p className="wa-verdict-you">
          {own.yes === null ? t('games.whoAmI.you.none') : own.right ? t('games.whoAmI.you.right', { count: WHO_AM_I_HELP_POINTS }) : t('games.whoAmI.you.wrong')}
        </p>
      )}
      {told.answers.length > 0 && (
        <ul className="wa-answers" aria-label={t('games.whoAmI.answers')}>
          {told.answers.map((a) => (
            <li key={a.seat} className={a.yes === null ? 'is-none' : a.right ? 'is-right' : 'is-wrong'}>
              <span className="wa-answers-name">{name(a.seat)}</span>{' '}
              <span className="wa-answers-mark">{a.yes === null ? t('games.whoAmI.noAnswer') : a.right ? t('games.whoAmI.right') : t('games.whoAmI.wrong')}</span>
            </li>
          ))}
        </ul>
      )}
    </VerdictCard>
  );
}

/** Once the game is over, above the places: why it ended, and who everyone was. */
function Ending({ view }: { view: View }): React.JSX.Element | null {
  const t = useT();
  const board = view.board;
  const reveal = board?.reveal ?? null;
  if (!board || !reveal || reveal.length === 0) return null;
  const name = seatNamer(view, t);
  const me = view.me?.seat ?? null;
  const seats = tableSeats(board, me, name).flatMap((s): TableSeat[] => {
    const card = reveal.find((r) => r.seat === s.seat);
    return card ? [{ ...s, card: { word: card.word, meanings: card.meanings } }] : [];
  });
  return (
    <section className="wa-reveal" aria-labelledby="wa-reveal-title">
      {board.endedBy && <p className="wa-ended">{t(WHO_AM_I_END_KEY[board.endedBy])}</p>}
      <h2 id="wa-reveal-title" className="wa-title">
        {t('games.whoAmI.reveal')}
      </h2>
      <Foreheads dialect={board.dialect} seats={seats} turn={null} label={t('games.whoAmI.table')} />
    </section>
  );
}
