import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  GAME_DIALECTS,
  GAME_DIFFICULTIES,
  WHO_AM_I_COUCH_MAX_PLAYERS,
  WHO_AM_I_COUCH_MIN_PLAYERS,
  WHO_AM_I_COUCH_NAME_MAX,
  WHO_AM_I_HELP_POINTS,
  couchName,
  roomAnswers,
  startCouchTable,
  whoAmIPoints,
  whoAmITableRules,
  type GameDialect,
  type GameDifficulty,
  type WhoAmICouchDeals,
  type WhoAmICouchOffer,
  type WhoAmITableBoard,
  type WhoAmITableMove,
  type WhoAmITableState,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { HelpIcon, PlusIcon } from '../components/icons';
import { Modal } from '../components/Modal';
import { Loading } from '../components/states';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { dialectName } from '../learn/map';
import { haptic } from '../lib/haptics';
import { ChipRadio } from '../play/ChipRadio';
import { GameHead } from '../games/GameHead';
import { DIFFICULTY_KEY } from '../games/partyChoices';
import { useGameDialect } from '../games/soloRounds';
import { RankList, RankRow } from '../ui/RankRow';
import {
  AnswerPanel,
  ForeheadCard,
  Foreheads,
  GuessTiles,
  QuestionCard,
  QuestionDeck,
  ScoringNote,
  VerdictCard,
  WHO_AM_I_END_KEY,
  WHO_AM_I_PATH,
  WithWord,
  yesNo,
  type TableSeat,
} from './WhoAmIStage';

/**
 * Who Am I? on one phone, passed round a room (/app/games/who-am-i?couch=1).
 *
 * The rules are the table's own (shared/src/games/who-am-i/rules.ts), run
 * here on the page from the cards the server deals for the room (couch.ts);
 * this is the phone's part in them. It asks who is playing, fetches a card
 * for each, shows every card once to the rest of the room while its wearer
 * looks away, and then goes from hand to hand: whoever holds it picks a
 * question and reads it out, taps what the room said, hears what the card
 * itself says, and guesses or passes the phone on.
 *
 * What it is careful about, because one screen is shared by people who must
 * not read their own card:
 * - a card is on the screen only while the button under it is held; letting
 *   go, switching away from the page or the screen locking hides it;
 * - between two players there is always a screen with nothing on it but the
 *   next player's name;
 * - the holder's own card is never drawn until it comes off, and the cards of
 *   the people sitting beside them stay hidden on the holder's screen too: a
 *   neighbour glancing over must not read their own;
 * - the cards stay in memory for the game and are never stored; the players'
 *   names are kept on this phone only, so the next game starts with them,
 *   and are never sent anywhere;
 * - leaving asks first, since the cards and the points go with the page.
 *
 * Nothing here keeps a clock: the phone waits for the room. A game played
 * this way earns nothing, because the phone holds every card.
 */

const KEPT = 'hevalo.whoami.couch';

/** A name as it is kept: one line, trimmed to what fits on the screen between two players. */
function cleanName(raw: string): string {
  return [...couchName(raw)].slice(0, WHO_AM_I_COUCH_NAME_MAX).join('').trim();
}

/** The names this phone remembers from the last game. Anything else it finds, it ignores. */
function readKept(): string[] | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEPT) ?? 'null');
    if (!Array.isArray(raw) || !raw.every((n): n is string => typeof n === 'string')) return null;
    const names = raw.slice(0, WHO_AM_I_COUCH_MAX_PLAYERS).map(cleanName);
    return names.length >= WHO_AM_I_COUCH_MIN_PLAYERS ? names : null;
  } catch {
    return null;
  }
}

/** A seed for one game's table, from the browser's own random numbers. */
function freshSeed(): string {
  const words = new Uint32Array(4);
  crypto.getRandomValues(words);
  return [...words].map((w) => w.toString(16).padStart(8, '0')).join('');
}

/** Where the game can be played on one phone: each dialect with a difficulty its approved cards fill; null until both have answered. */
export function useCouchOffers(): WhoAmICouchOffer[] | null {
  const { client } = useAuth();
  const [offers, setOffers] = useState<WhoAmICouchOffer[] | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all(GAME_DIALECTS.map((d) => client.get<WhoAmICouchOffer>(`/games/who-am-i/couch?dialect=${d}`))).then((all) => {
      if (alive) setOffers(all.flatMap((r) => (r.ok && Array.isArray(r.data?.difficulties) && r.data.difficulties.length > 0 ? [r.data] : [])));
    });
    return () => {
      alive = false;
    };
  }, [client]);
  return offers;
}

/** Where the phone is in a game, on top of what the rules' own state says. */
type Step =
  /** before the first turn: this player's card, shown to everyone else */
  | { at: 'look'; seat: number }
  /** between two players: the name of whoever is on turn, and nothing else */
  | { at: 'pass' }
  /** the holder's turn: their board, their question read out, the card's verdict */
  | { at: 'play' }
  /** what came of a guess, before the phone moves on */
  | { at: 'guessed'; seat: number; tile: string; correct: boolean }
  | { at: 'end' };

interface Game {
  /** by seat, in the order they were entered */
  names: string[];
  dialect: GameDialect;
  difficulty: GameDifficulty;
  state: WhoAmITableState;
  step: Step;
}

/** The table as one seat reads it: the rules' own view, the only thing a screen here is drawn from. */
function viewOf(game: Game, seat: number): WhoAmITableBoard {
  return whoAmITableRules.viewFor(game.state, seat);
}

/** After a turn has ended: the hand-over to whoever is next, or the end. */
function onward(state: WhoAmITableState): Step {
  return whoAmITableRules.finished(state) ? { at: 'end' } : { at: 'pass' };
}

export function Couch(): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const navigate = useNavigate();
  const offers = useCouchOffers();
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<MessageKey | null>(null);
  // where leaving would go, while the room is being asked whether it means it
  const [leaving, setLeaving] = useState<string | null>(null);

  /** A card for everyone in the room, fetched, and the table begun; says why when it could not be. */
  const deal = useCallback(
    async (names: string[], dialect: GameDialect, difficulty: GameDifficulty): Promise<void> => {
      setBusy(true);
      setFailed(null);
      // the room's size is all the server is told: the names stay on this phone
      const res = await client.post<WhoAmICouchDeals>('/games/who-am-i/couch/deal', { dialect, difficulty, players: names.length });
      setBusy(false);
      if (!res.ok || !Array.isArray(res.data?.deals) || res.data.deals.length !== names.length) {
        setFailed(!res.ok && res.error.status === 409 ? 'games.whoAmI.couch.noCards' : 'games.couch.failed');
        return;
      }
      try {
        localStorage.setItem(KEPT, JSON.stringify(names));
      } catch {
        // a phone that will not keep them only asks for the names again next time
      }
      setGame({ names, dialect, difficulty, state: startCouchTable(res.data, Date.now(), freshSeed()), step: { at: 'look', seat: 0 } });
    },
    [client],
  );

  const under = game !== null && game.step.at !== 'end';
  const head = <GameHead game="who-am-i" title={t('games.whoAmI.name')} onBack={under ? () => setLeaving('/app/games') : undefined} />;

  if (offers === null) {
    return (
      <>
        {head}
        <Loading />
      </>
    );
  }
  if (offers.length === 0) {
    return (
      <>
        {head}
        <div className="state wa-not-offered">
          <HelpIcon size={32} />
          <p>{t('games.whoAmI.notOffered')}</p>
          <Link to={WHO_AM_I_PATH} className="btn btn-secondary">
            {t('games.back')}
          </Link>
        </div>
      </>
    );
  }

  /** The game as it now stands; none is the way back to the setup, which opens without an old failure on it. */
  const update = (next: Game | null): void => {
    if (next === null) setFailed(null);
    setGame(next);
  };

  /** A move by whoever holds the phone, judged by the rules; one they refuse changes nothing. */
  const move = (m: WhoAmITableMove): void => {
    const seat = game?.state.turn ?? null;
    if (!game || seat === null) return;
    const res = whoAmITableRules.apply(game.state, seat, m, Date.now());
    if (!res.ok) return;
    if (m.kind === 'guess') {
      const correct = res.outcome.correct === true;
      haptic(correct ? 'celebrate' : 'wrong');
      setGame({ ...game, state: res.state, step: { at: 'guessed', seat, tile: m.tile, correct } });
    } else if (m.kind === 'pass') {
      setGame({ ...game, state: res.state, step: onward(res.state) });
    } else {
      setGame({ ...game, state: res.state });
    }
  };

  return (
    <>
      {head}
      <div className="wa-couch">
        <p className="wa-mode">{t('games.couch.title')}</p>
        {/* one line that is here from the start, so what the phone moves on to is said to a screen reader as well as shown */}
        <p className="sr-only" aria-live="polite">
          {game ? announcement(game, t) : ''}
        </p>
        {game ? (
          <Play game={game} busy={busy} failed={failed} setGame={update} onMove={move} onAgain={() => void deal(game.names, game.dialect, game.difficulty)} onLeave={() => setLeaving(WHO_AM_I_PATH)} />
        ) : (
          <Setup offers={offers} busy={busy} failed={failed} onStart={(names, dialect, difficulty) => void deal(names, dialect, difficulty)} />
        )}
      </div>
      <Modal open={leaving !== null} onClose={() => setLeaving(null)} label={t('games.whoAmI.couch.leave.title')}>
        <div className="wa-leave">
          <h2 className="wa-leave-title">{t('games.whoAmI.couch.leave.title')}</h2>
          <p className="wa-leave-body">{t('games.whoAmI.couch.leave.body')}</p>
          <div className="wa-leave-actions">
            <Button variant="secondary" onClick={() => navigate(leaving ?? WHO_AM_I_PATH)}>
              {t('play.room.leaveGame')}
            </Button>
            <Button onClick={() => setLeaving(null)}>{t('games.whoAmI.couch.leave.stay')}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/**
 * A game under way, by where the phone is in it: a card held up, the phone
 * between two players, the holder's turn, what came of a guess, the end. While
 * there is still something to lose, the way out is under every one of them.
 */
function Play({
  game,
  busy,
  failed,
  setGame,
  onMove,
  onAgain,
  onLeave,
}: {
  game: Game;
  busy: boolean;
  failed: MessageKey | null;
  setGame: (next: Game | null) => void;
  onMove: (move: WhoAmITableMove) => void;
  onAgain: () => void;
  onLeave: () => void;
}): React.JSX.Element {
  const t = useT();
  const { step } = game;
  const turn = game.state.turn;
  const screen = useRef<HTMLDivElement>(null);
  // which screen this is: it changes whenever what the room is looking at is replaced
  const shown = `${step.at}:${step.at === 'look' || step.at === 'guessed' ? step.seat : ''}:${game.state.turns}:${game.state.phase}`;
  // A new screen starts at its top with the focus on it: the button just pressed is gone with the old one, and a long
  // board may have been scrolled to its end.
  useEffect(() => {
    const el = screen.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.closest('.wa-page')?.scrollIntoView?.({ block: 'start' });
  }, [shown]);
  return (
    <div className="wa-couch-screen" ref={screen} tabIndex={-1}>
      {step.at === 'look' && (
        <Look key={step.seat} game={game} seat={step.seat} onNext={() => setGame({ ...game, step: step.seat + 1 < game.names.length ? { at: 'look', seat: step.seat + 1 } : { at: 'pass' } })} />
      )}
      {step.at === 'pass' && turn !== null && <HandOver name={game.names[turn]!} onMine={() => setGame({ ...game, step: { at: 'play' } })} />}
      {step.at === 'play' && turn !== null && <Turn game={game} seat={turn} onMove={onMove} onRoom={(yes) => setGame({ ...game, state: roomAnswers(game.state, yes, Date.now()) })} />}
      {step.at === 'guessed' && <Guessed game={game} seat={step.seat} tile={step.tile} correct={step.correct} onNext={() => setGame({ ...game, step: onward(game.state) })} />}
      {step.at === 'end' ? (
        <End game={game} busy={busy} failed={failed} onAgain={onAgain} onChange={() => setGame(null)} />
      ) : (
        <div className="wa-couch-leave">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLeave}>
            {t('play.room.leaveGame')}
          </button>
        </div>
      )}
    </div>
  );
}

/** What the phone is showing now, in a line: whose card, whose turn, what the card said, how a guess went. */
function announcement(game: Game, t: (key: MessageKey, vars?: Record<string, string | number>) => string): string {
  const { step, state, names } = game;
  if (step.at === 'look') return `${t('games.whoAmI.couch.look.title', { name: names[step.seat]! })} ${t('games.whoAmI.couch.look.away', { name: names[step.seat]! })}`;
  if (step.at === 'end') return t('play.room.over');
  if (step.at === 'guessed') return step.correct ? t('games.whoAmI.solved') : t('games.whoAmI.guessesLeft', { count: viewOf(game, step.seat).mine?.guessesLeft ?? 0 });
  if (state.turn === null) return '';
  const name = names[state.turn]!;
  if (step.at === 'pass') return t('games.whoAmI.couch.handover', { name });
  if (state.phase === 'answer') return `${t('games.whoAmI.couch.readAloud')}. ${t('games.whoAmI.couch.roomSaid')}`;
  if (state.phase === 'decide' && state.told) return `${t('games.whoAmI.cardSays')} ${yesNo(state.dialect, state.told.truth, t)}`;
  return t('games.whoAmI.turn.theirs', { name });
}

// ---------- who is playing ----------

function Setup({
  offers,
  busy,
  failed,
  onStart,
}: {
  offers: readonly WhoAmICouchOffer[];
  busy: boolean;
  failed: MessageKey | null;
  onStart: (names: string[], dialect: GameDialect, difficulty: GameDifficulty) => void;
}): React.JSX.Element {
  const t = useT();
  const preferred = useGameDialect();
  const [names, setNames] = useState<string[]>(() => readKept() ?? Array.from({ length: WHO_AM_I_COUCH_MIN_PLAYERS }, () => ''));
  const [dialect, setDialect] = useState<GameDialect>(() => (offers.some((o) => o.dialect === preferred) ? preferred : offers[0]!.dialect));
  const [difficulty, setDifficulty] = useState<GameDifficulty | null>(null);
  const [slip, setSlip] = useState<MessageKey | null>(null);

  const offer = offers.find((o) => o.dialect === dialect) ?? offers[0]!;
  const levels = GAME_DIFFICULTIES.filter((d) => offer.difficulties.includes(d));
  const level = difficulty !== null && levels.includes(difficulty) ? difficulty : levels[0]!;
  const canRemove = names.length > WHO_AM_I_COUCH_MIN_PLAYERS;
  const canAdd = names.length < WHO_AM_I_COUCH_MAX_PLAYERS;
  // an empty box takes the name on its placeholder: "Player 2"
  const named = names.map((n, i) => (n.trim() === '' ? t('games.couch.playerName', { n: i + 1 }) : n));

  function start(): void {
    const clean = named.map(cleanName);
    if (clean.some((n) => n === '')) return setSlip('games.couch.names.empty');
    // two players of one name could not be told apart on the screen that says whose turn it is
    if (new Set(clean.map((n) => n.toLocaleLowerCase())).size !== clean.length) return setSlip('games.couch.names.same');
    setSlip(null);
    onStart(clean, offer.dialect, level);
  }

  return (
    <form
      className="wa-setup"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) start();
      }}
    >
      <p className="wa-setup-lead">{t('games.whoAmI.couch.blurb')}</p>
      <fieldset className="wa-setup-card">
        <legend className="wa-setup-title">{t('games.couch.players')}</legend>
        <ol className="wa-names">
          {names.map((name, i) => (
            <li key={i} className="wa-name">
              <span className="wa-name-n" aria-hidden="true">
                {name.trim() === '' ? i + 1 : name.trim().slice(0, 1).toUpperCase()}
              </span>
              <input
                className="input"
                value={name}
                maxLength={WHO_AM_I_COUCH_NAME_MAX}
                placeholder={t('games.couch.playerName', { n: i + 1 })}
                aria-label={t('games.couch.playerName', { n: i + 1 })}
                autoComplete="off"
                enterKeyHint="next"
                onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
              />
              {canRemove && (
                <button type="button" className="wa-name-remove" aria-label={t('games.couch.removePlayer', { name: named[i]! })} onClick={() => setNames(names.filter((_, j) => j !== i))}>
                  <span aria-hidden="true">×</span>
                </button>
              )}
            </li>
          ))}
        </ol>
        {canAdd && (
          <Button type="button" variant="secondary" size="sm" className="wa-add" onClick={() => setNames([...names, ''])}>
            <PlusIcon size={16} />
            {t('games.couch.addPlayer')}
          </Button>
        )}
        {slip && (
          <p className="msg msg-error" role="alert">
            {t(slip)}
          </p>
        )}
      </fieldset>
      {(offers.length > 1 || levels.length > 1) && (
        <div className="wa-setup-card">
          {offers.length > 1 && <ChipRadio label={t('games.dialect')} value={offer.dialect} onChange={setDialect} options={offers.map((o) => ({ value: o.dialect, label: dialectName(o.dialect) }))} />}
          {levels.length > 1 && <ChipRadio label={t('games.solo.difficulty')} value={level} onChange={setDifficulty} options={levels.map((d) => ({ value: d, label: t(DIFFICULTY_KEY[d]) }))} />}
        </div>
      )}
      <div className="wa-setup-go">
        {failed && (
          <p className="msg msg-error" role="alert">
            {t(failed)}
          </p>
        )}
        <Button type="submit" size="lg" block disabled={busy}>
          {busy ? t('games.couch.dealing') : t('games.couch.start')}
        </Button>
        <p className="wa-setup-note muted">{t('games.couch.noPay')}</p>
      </div>
      <ScoringNote />
    </form>
  );
}

// ---------- looking round, before the first turn ----------

/**
 * One player's card, for everybody else: on the screen only while the button
 * is held, so the wearer can be told to look away first and the phone can be
 * turned to the room.
 */
function Look({ game, seat, onNext }: { game: Game; seat: number; onNext: () => void }): React.JSX.Element {
  const t = useT();
  const name = game.names[seat]!;
  const [shown, setShown] = useState(false);
  const [seen, setSeen] = useState(false);
  // the card as the others read it: any seat's view but the wearer's own holds it
  const card = viewOf(game, (seat + 1) % game.names.length).seats.find((s) => s.seat === seat)?.card ?? null;

  // the card goes face down the moment the page is not the one in front: another app, the lock screen, another tab
  useEffect(() => {
    const hide = (): void => setShown(false);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('blur', hide);
    };
  }, []);

  const show = (): void => {
    setShown(true);
    setSeen(true);
  };
  const hide = (): void => setShown(false);
  return (
    <div className="wa-look">
      <p className="wa-couch-count">{t('games.whoAmI.couch.look.step', { n: seat + 1, total: game.names.length })}</p>
      <div className="wa-night">
        <h2 className="wa-night-title">{t('games.whoAmI.couch.look.title', { name })}</h2>
        <p className="wa-night-shout">{t('games.whoAmI.couch.look.away', { name })}</p>
        <ForeheadCard dialect={game.dialect} category={null} identity={shown ? card : null} label={t('games.couch.cardOf', { name })} hidden={t('games.whoAmI.cardHidden')} />
      </div>
      <button
        type="button"
        className={`wa-hold${shown ? ' is-held' : ''}`}
        aria-pressed={shown}
        onPointerDown={(e) => {
          e.preventDefault();
          show();
        }}
        onPointerUp={hide}
        onPointerCancel={hide}
        onPointerLeave={hide}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) show();
        }}
        onKeyUp={hide}
        onBlur={hide}
        onContextMenu={(e) => e.preventDefault()}
      >
        {t('games.whoAmI.couch.look.hold', { name })}
      </button>
      <p className="wa-couch-note muted">{t('games.whoAmI.couch.look.note')}</p>
      <Button size="lg" block variant="secondary" disabled={!seen || shown} onClick={onNext}>
        {t('games.couch.next')}
      </Button>
    </div>
  );
}

// ---------- a turn ----------

/** The screen between two players: nothing on it but whose turn it is to hold the phone. */
function HandOver({ name, onMine }: { name: string; onMine: () => void }): React.JSX.Element {
  const t = useT();
  return (
    <div className="wa-night wa-pass">
      <span className="wa-pass-disc" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <h2 className="wa-night-title">{t('games.whoAmI.couch.handover', { name })}</h2>
      <Button size="lg" block onClick={onMine}>
        {t('games.couch.iAm', { name })}
      </Button>
    </div>
  );
}

/** Everyone at the table as the holder's screen may show them: points and questions for all, a card only once it is off. */
function couchSeats(game: Game, board: WhoAmITableBoard, holder: number | null): TableSeat[] {
  return board.seats.map((s) => ({
    seat: s.seat,
    name: game.names[s.seat]!,
    // a neighbour may glance at the holder's screen: a card still being worn is on nobody's
    card: s.solved || s.out ? s.card : null,
    own: s.seat === holder,
    asked: s.asked,
    points: s.points,
    solved: s.solved,
    out: s.out,
    left: s.left,
  }));
}

/**
 * The holder's turn, read from where the rules say it stands: their board to
 * ask or guess from; their question large, to read out, with what the room
 * said; then the card's own verdict, and a guess or the phone passed on.
 */
function Turn({ game, seat, onMove, onRoom }: { game: Game; seat: number; onMove: (move: WhoAmITableMove) => void; onRoom: (yes: boolean) => void }): React.JSX.Element | null {
  const t = useT();
  const board = viewOf(game, seat);
  const mine = board.mine;
  if (!mine) return null;
  const name = game.names[seat]!;
  const crossed = mine.guesses.filter((g) => !g.correct).map((g) => g.tile);

  if (board.phase === 'answer' && board.pending) {
    return (
      <div className="wa-read">
        <div className="wa-night">
          <p className="wa-night-kicker">{t('games.whoAmI.couch.readAloud')}</p>
          <QuestionCard key={board.pending.question.id} dialect={board.dialect} question={board.pending.question} large />
        </div>
        <h2 className="wa-title wa-centre">
          {t('games.whoAmI.couch.roomSaid')}
        </h2>
        <AnswerPanel dialect={board.dialect} label={t('games.whoAmI.couch.roomSaid')} disabled={false} onAnswer={onRoom} />
      </div>
    );
  }

  const told = board.phase === 'decide' ? board.told : null;
  // the room answers with one voice, so every answer on the table is the same one: right or wrong together
  const roomRight = told && told.answers.length > 0 ? told.answers.every((a) => a.right) : null;
  return (
    <div className="wa-board">
      <div className="wa-turn is-mine">
        <div className="wa-turn-text">
          <p className="wa-turn-whose">{t('games.whoAmI.turn.theirs', { name })}</p>
          <p className="wa-turn-wait">{mine.mustGuess ? t('games.whoAmI.mustGuess') : t(told ? 'games.whoAmI.wait.decide.mine' : 'games.whoAmI.wait.ask.mine')}</p>
        </div>
      </div>
      {told ? (
        <VerdictCard dialect={board.dialect} by={t('games.whoAmI.theyAsked', { name })} question={told.question} truth={told.truth}>
          {roomRight !== null && <p className="wa-verdict-you">{roomRight ? t('games.whoAmI.couch.roomRight', { count: WHO_AM_I_HELP_POINTS }) : t('games.whoAmI.couch.roomWrong')}</p>}
        </VerdictCard>
      ) : (
        // the holder's own card: a question mark, and its kind when the tiles do not give it away
        <ForeheadCard dialect={board.dialect} category={mine.category} identity={null} />
      )}
      <div className="wa-hand">
        <p className="wa-worth">
          {`${t('games.whoAmI.worth', { count: whoAmIPoints(mine.asked.length, crossed.length, true) })} · ${t('games.whoAmI.guessesLeft', { count: mine.guessesLeft })}`}
        </p>
        <GuessTiles dialect={board.dialect} tiles={mine.tiles} crossed={crossed} canGuess busy={false} onGuess={(tile) => onMove({ kind: 'guess', tile })}>
          {mine.mustGuess ? null : (
            <Button variant="secondary" onClick={() => onMove({ kind: 'pass' })}>
              {t('games.whoAmI.pass')}
            </Button>
          )}
        </GuessTiles>
        <QuestionDeck dialect={board.dialect} questions={mine.questions} asked={mine.asked} canAsk={!told} disabled={false} onAsk={(question) => onMove({ kind: 'ask', question })} />
      </div>
      <Foreheads dialect={board.dialect} seats={couchSeats(game, board, seat)} turn={seat} label={t('games.whoAmI.table')} />
    </div>
  );
}

/** What came of a guess: the card coming off for a right one or a last wrong one, and how many guesses are left after any other. */
function Guessed({ game, seat, tile, correct, onNext }: { game: Game; seat: number; tile: string; correct: boolean; onNext: () => void }): React.JSX.Element | null {
  const t = useT();
  const board = viewOf(game, seat);
  const mine = board.mine;
  if (!mine) return null;
  const name = game.names[seat]!;
  const guess = mine.tiles.find((x) => x.id === tile);
  // the card is in the holder's view only once it is off: found, or out of guesses
  const identity = mine.identity;
  return (
    <div className="wa-night">
      {!correct && guess && (
        <p className="wa-night-shout">
          <WithWord text={t('games.whoAmI.notWord')} word={guess.word} dialect={board.dialect} />
        </p>
      )}
      {identity ? (
        <>
          {!correct && <p className="wa-night-kicker">{t('games.whoAmI.out')}</p>}
          <ForeheadCard dialect={board.dialect} category={null} identity={identity} label={t('games.couch.cardOf', { name })} />
          <h2 className="wa-night-title">
            <WithWord text={t(correct ? 'games.whoAmI.youAre' : 'games.whoAmI.youWere')} word={identity.word} dialect={board.dialect} />
          </h2>
          <p className="wa-night-points">{t('games.whoAmI.points', { count: mine.points })}</p>
        </>
      ) : (
        <h2 className="wa-night-title">{t('games.whoAmI.guessesLeft', { count: mine.guessesLeft })}</h2>
      )}
      <Button size="lg" block onClick={onNext}>
        {t('games.couch.next')}
      </Button>
    </div>
  );
}

// ---------- the end ----------

function End({ game, busy, failed, onAgain, onChange }: { game: Game; busy: boolean; failed: MessageKey | null; onAgain: () => void; onChange: () => void }): React.JSX.Element {
  const t = useT();
  const board = viewOf(game, 0);
  const reveal = board.reveal ?? [];
  const seats = couchSeats(game, board, null).flatMap((s): TableSeat[] => {
    const card = reveal.find((r) => r.seat === s.seat);
    return card ? [{ ...s, card: { word: card.word, meanings: card.meanings } }] : [];
  });
  const places = [...whoAmITableRules.places(game.state)].sort((a, b) => a.place - b.place || a.seat - b.seat);
  return (
    <div className="wa-end">
      <h2 className="wa-end-title">{t('play.room.over')}</h2>
      {board.endedBy && <p className="wa-ended">{t(WHO_AM_I_END_KEY[board.endedBy])}</p>}
      <section className="wa-reveal" aria-labelledby="wa-reveal-title">
        <h3 id="wa-reveal-title" className="wa-title">
          {t('games.whoAmI.reveal')}
        </h3>
        <Foreheads dialect={board.dialect} seats={seats} turn={null} label={t('games.whoAmI.table')} />
      </section>
      <RankList label={t('play.room.results')}>
        {places.map((p) => (
          <RankRow key={p.seat} rank={p.place} name={game.names[p.seat]!} score={t('games.whoAmI.points', { count: p.score })} />
        ))}
      </RankList>
      {failed && (
        <p className="msg msg-error" role="alert">
          {t(failed)}
        </p>
      )}
      <Button size="lg" block disabled={busy} onClick={onAgain}>
        {busy ? t('games.couch.dealing') : t('games.playAgain')}
      </Button>
      <Button variant="secondary" block onClick={onChange}>
        {t('games.couch.change')}
      </Button>
      <Link to={WHO_AM_I_PATH} className="btn btn-ghost btn-block">
        {t('games.couch.finish')}
      </Link>
    </div>
  );
}
