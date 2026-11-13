import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BURST,
  GAME_DIALECTS,
  GAME_DIFFICULTIES,
  WHO_AM_I_COUCH_MAX_PLAYERS,
  WHO_AM_I_COUCH_MIN_PLAYERS,
  WHO_AM_I_COUCH_NAME_MAX,
  WHO_AM_I_HELP_POINTS,
  WHO_AM_I_QUESTION_COST,
  WHO_AM_I_ROOM_GUESSES,
  couchName,
  roomAnswers,
  startCouchTable,
  whoAmIPoints,
  whoAmITableRules,
  type GameDialect,
  type GameDifficulty,
  type WhoAmICouchDeals,
  type WhoAmICouchOffer,
  type WhoAmIQuestion,
  type WhoAmITableBoard,
  type WhoAmITableCard,
  type WhoAmITableState,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { CloseIcon, HelpIcon, PlusIcon } from '../components/icons';
import { Modal } from '../components/Modal';
import { Loading } from '../components/states';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { dialectName } from '../learn/map';
import { haptic } from '../lib/haptics';
import { useCelebrationMoment } from '../lib/motion';
import { ChipRadio } from '../play/ChipRadio';
import { GameHead } from '../games/GameHead';
import { DIFFICULTY_KEY } from '../games/partyChoices';
import { useGameDialect } from '../games/soloRounds';
import { CelebrationArt } from '../ranks/Celebration';
import { RankList, RankRow } from '../ui/RankRow';
import {
  AnswerPanel,
  ForeheadCard,
  Foreheads,
  QuestionCard,
  QuestionList,
  ScoringNote,
  SuggestedQuestions,
  VerdictCard,
  WHO_AM_I_END_KEY,
  WHO_AM_I_PATH,
  WithWord,
  WithWords,
  askedFirst,
  categoryName,
  yesNo,
  type TableSeat,
} from './WhoAmIStage';

/**
 * Who Am I? on one phone, passed round a room (/app/games/who-am-i?couch=1).
 *
 * The rules are the table's own (shared/src/games/who-am-i/rules.ts), run
 * here on the page from the cards the server deals for the room (couch.ts);
 * this is the phone's part in them. It asks who is playing, fetches a card
 * for each, and then goes from hand to hand, with nothing for anyone to
 * remember. Whoever holds it picks a question, one of the few the rules
 * suggest or any on their list, and reads it out; they turn the phone to
 * their friends, who see the card and the question together and tap yes or
 * no themselves; the phone hides the card and comes back with what the card
 * itself says; and the holder passes the phone on, or says they know who they
 * are. A player may also ask the room a question of their own: the friends
 * answer that one out loud, looking at the card, and the phone only counts
 * it. There is nothing to pick a guess from: a player who knows says who they
 * are out loud and turns the phone round once more, and the friends, reading
 * the card, tap whether that is it.
 *
 * What it is careful about, because one screen is shared by people who must
 * not read their own card:
 * - a card is drawn on the friends' screen alone, which the holder opens
 *   with the phone already turned away from them: the friends' one tap
 *   answers and hides it, and switching away from the page or the screen
 *   locking hides it too;
 * - nothing on the holder's own screen says who they could be: no list of
 *   words to choose from, only what the card has answered so far;
 * - the way to that screen takes no tap in its first moment, so a double
 *   tap on the board cannot run on into it and turn the card up;
 * - between two players there is always a screen with nothing on it but the
 *   next player's name;
 * - the holder's own card is never drawn until it comes off, and nobody
 *   else's card is on the holder's board either: a neighbour glancing over
 *   must not read their own;
 * - a question or a guess costs nothing until the friends have answered it:
 *   until then the way back leaves the rules as they were;
 * - the cards stay in memory for the game and are never stored; the players'
 *   names are kept on this phone only, so the next game starts with them,
 *   and are never sent anywhere;
 * - leaving asks first, since the cards and the points go with the page.
 *
 * No turn has a clock: the phone waits for the room. A game played this way
 * earns nothing, because the phone holds every card.
 */

const KEPT = 'hevalo.whoami.couch';

/**
 * How long the way to the friends' screen takes no tap after it appears: longer than the gap inside a double tap.
 * A hurried second tap on the board can land where that button has just appeared, and would turn the card up in
 * front of its own wearer.
 */
const TURN_ROUND_MS = 400;

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

/** What the holder says out loud before the phone is turned to the friends. */
type Said =
  /** a question from their list, read out */
  | { what: 'question'; id: string }
  /** a question of their own */
  | { what: 'own' }
  /** who they are */
  | { what: 'guess' };

/** Where the phone is in a game, on top of what the rules' own state says. */
type Step =
  /** between two players: the name of whoever is on turn, and nothing else */
  | { at: 'pass' }
  /** the holder's own screen: what they may ask and what they know, with the card's verdict once a question is answered */
  | { at: 'board' }
  /** the holder says something out loud and turns the phone round; nothing is asked of the rules yet */
  | { at: 'say'; said: Said }
  /** the phone is turned to the friends: the holder's card, and what they answer */
  | { at: 'friends'; said: Said }
  /** what came of a guess, before the phone moves on */
  | { at: 'guessed'; seat: number; correct: boolean }
  | { at: 'end' };

interface Game {
  /** by seat, in the order they were entered */
  names: string[];
  dialect: GameDialect;
  difficulty: GameDifficulty;
  state: WhoAmITableState;
  step: Step;
}

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** The table as one seat reads it: the rules' own view, the only thing a screen here is drawn from. */
function viewOf(game: Game, seat: number): WhoAmITableBoard {
  return whoAmITableRules.viewFor(game.state, seat);
}

/** A player's card as their friends read it: any seat's view but the wearer's own holds it, so the rules stay the judge of who reads what. */
function cardOf(game: Game, seat: number): WhoAmITableCard | null {
  return viewOf(game, (seat + 1) % game.names.length).seats.find((s) => s.seat === seat)?.card ?? null;
}

/** A question on a player's list that is still theirs to ask; none for any other id. */
function askable(board: WhoAmITableBoard, id: string): WhoAmIQuestion | null {
  const mine = board.mine;
  if (!mine || mine.asked.some((a) => a.question === id)) return null;
  return mine.questions.find((q) => q.id === id) ?? null;
}

/** The dialect's own yes and no, for a line that tells the friends what to say out loud. */
function sayYesNo(dialect: GameDialect, t: Translate): { yes: string; no: string } {
  return { yes: yesNo(dialect, true, t), no: yesNo(dialect, false, t) };
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
      // straight to the first player: nobody looks at a card until there is a question to answer about it
      setGame({ names, dialect, difficulty, state: startCouchTable(res.data, Date.now(), freshSeed()), step: { at: 'pass' } });
    },
    [client],
  );

  const under = game !== null && game.step.at !== 'end';
  const head = <GameHead game="who-am-i" title={t('games.whoAmI.name')} meaning={t('games.whoAmI.meaning')} onBack={under ? () => setLeaving('/app/games') : undefined} />;

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

  /**
   * What the friends said to a guess spoken out loud: they are its judge, with the card in front of them. Whatever
   * the rules make of the move, the card is off the screen at once.
   */
  const judged = (right: boolean): void => {
    const seat = game?.state.turn ?? null;
    if (!game || seat === null) return;
    const res = whoAmITableRules.apply(game.state, seat, { kind: 'said', right }, Date.now());
    if (!res.ok) return setGame({ ...game, step: { at: 'board' } });
    // a miss is felt at once; a card found is felt as it lands, in its celebration
    if (!right) haptic('wrong');
    setGame({ ...game, state: res.state, step: { at: 'guessed', seat, correct: right } });
  };

  /** The turn passed on without a guess. */
  const pass = (): void => {
    const seat = game?.state.turn ?? null;
    if (!game || seat === null) return;
    const res = whoAmITableRules.apply(game.state, seat, { kind: 'pass' }, Date.now());
    if (res.ok) setGame({ ...game, state: res.state, step: onward(res.state) });
  };

  /**
   * What the friends tapped. The question is asked for the holder and answered
   * for the room in one step, so it costs nothing before this and the card is
   * off the screen the moment it is answered: whatever the rules say, the
   * phone is back on the holder's board.
   */
  const answer = (question: string, yes: boolean): void => {
    const seat = game?.state.turn ?? null;
    if (!game || seat === null) return;
    const now = Date.now();
    const asked = whoAmITableRules.apply(game.state, seat, { kind: 'ask', question }, now);
    setGame({ ...game, state: asked.ok ? roomAnswers(asked.state, yes, now) : game.state, step: { at: 'board' } });
  };

  /** A question of the holder's own, asked and answered out loud: the rules only count it, and the card is hidden again. */
  const spoken = (): void => {
    const seat = game?.state.turn ?? null;
    if (!game || seat === null) return;
    const res = whoAmITableRules.apply(game.state, seat, { kind: 'aloud' }, Date.now());
    setGame({ ...game, state: res.ok ? res.state : game.state, step: { at: 'board' } });
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
          <Play
            game={game}
            busy={busy}
            failed={failed}
            setGame={update}
            onJudged={judged}
            onPass={pass}
            onAnswer={answer}
            onSpoken={spoken}
            onAgain={() => void deal(game.names, game.dialect, game.difficulty)}
            onLeave={() => setLeaving(WHO_AM_I_PATH)}
          />
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
 * A game under way, by where the phone is in it: between two players, on the
 * holder's board, a question or a guess being said, the phone turned to the
 * friends, what came of a guess, the end. While there is still something to
 * lose, the way out is under every one of them.
 */
function Play({
  game,
  busy,
  failed,
  setGame,
  onJudged,
  onPass,
  onAnswer,
  onSpoken,
  onAgain,
  onLeave,
}: {
  game: Game;
  busy: boolean;
  failed: MessageKey | null;
  setGame: (next: Game | null) => void;
  onJudged: (right: boolean) => void;
  onPass: () => void;
  onAnswer: (question: string, yes: boolean) => void;
  onSpoken: () => void;
  onAgain: () => void;
  onLeave: () => void;
}): React.JSX.Element {
  const t = useT();
  const { step } = game;
  const turn = game.state.turn;
  const screen = useRef<HTMLDivElement>(null);
  const go = (next: Step): void => setGame({ ...game, step: next });
  // which screen this is: it changes whenever what the room is looking at is replaced
  const said = step.at === 'say' || step.at === 'friends' ? step.said : null;
  const about = step.at === 'guessed' ? step.seat : said ? `${said.what}:${said.what === 'question' ? said.id : ''}` : '';
  const shown = `${step.at}:${about}:${game.state.turns}:${game.state.phase}`;
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
      {step.at === 'pass' && turn !== null && <HandOver name={game.names[turn]!} onMine={() => go({ at: 'board' })} />}
      {step.at === 'board' && turn !== null && (
        <Board
          game={game}
          seat={turn}
          onPass={onPass}
          // only a question still theirs to ask is taken to be said: the steps after it can then trust what they carry
          onPick={(id) => {
            if (askable(viewOf(game, turn), id)) go({ at: 'say', said: { what: 'question', id } });
          }}
          onOwn={() => go({ at: 'say', said: { what: 'own' } })}
          onKnow={() => go({ at: 'say', said: { what: 'guess' } })}
        />
      )}
      {step.at === 'say' && turn !== null && (
        <Say game={game} seat={turn} said={step.said} onFriends={() => go({ at: 'friends', said: step.said })} onBack={() => go({ at: 'board' })} />
      )}
      {step.at === 'friends' && turn !== null && (
        <Friends
          game={game}
          seat={turn}
          said={step.said}
          onAnswer={(yes) => {
            if (step.said.what === 'question') onAnswer(step.said.id, yes);
          }}
          onSpoken={onSpoken}
          onJudged={onJudged}
          onHide={() => go({ at: 'say', said: step.said })}
        />
      )}
      {step.at === 'guessed' && <Guessed game={game} seat={step.seat} correct={step.correct} onNext={() => go(onward(game.state))} />}
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

/** What the phone is showing now, in a line: whose turn, what to do with the phone, what the card said, how a guess went. */
function announcement(game: Game, t: Translate): string {
  const { step, state, names } = game;
  if (step.at === 'end') return t('play.room.over');
  if (step.at === 'guessed') {
    const mine = viewOf(game, step.seat).mine;
    if (step.correct) return t('games.whoAmI.solved');
    return mine?.out ? t('games.whoAmI.out') : `${t('games.whoAmI.couch.missed')} ${t('games.whoAmI.guessesLeft', { count: mine?.guessesLeft ?? 0 })}`;
  }
  if (state.turn === null) return '';
  const name = names[state.turn]!;
  if (step.at === 'pass') return t('games.whoAmI.couch.handover', { name });
  if (step.at === 'say') {
    if (step.said.what === 'guess') return `${t('games.whoAmI.couch.sayWho')} ${t('games.whoAmI.couch.turnPhone')}`;
    if (step.said.what === 'own') return `${t('games.whoAmI.couch.ownAsk')} ${t('games.whoAmI.couch.ownTurn')}`;
    return `${t('games.whoAmI.couch.readAloud')}. ${t('games.whoAmI.couch.turnPhone')}`;
  }
  if (step.at === 'friends') {
    const asks =
      step.said.what === 'guess'
        ? t('games.whoAmI.couch.gotIt', { name })
        : step.said.what === 'own'
          ? t('games.whoAmI.couch.ownAnswer', { name, ...sayYesNo(state.dialect, t) })
          : t('games.whoAmI.couch.isItTrue');
    return `${t('games.whoAmI.couch.is', { name })} ${asks}`;
  }
  // back on the holder's board: the card's verdict, or that the friends have answered
  if (state.phase === 'decide') return state.told ? `${t('games.whoAmI.cardSays')} ${yesNo(state.dialect, state.told.truth, t)}` : t('games.whoAmI.couch.ownAnswered');
  // or whose board it is, with what the board says when the turn is not simply a question to pick
  const mine = viewOf(game, state.turn).mine;
  return [t('games.whoAmI.couch.whoAreYou', { name }), mine ? boardNote(mine, t) : null].filter(Boolean).join(' ');
}

/**
 * What a board with nothing answered on it tells its holder, when the turn is not simply a suggested question to
 * pick: that the list is used up, or that nothing on it is suggested any more. In one room a turn is never forced to
 * be a guess, so neither is a dead end: a question of their own is always there.
 */
function boardNote(mine: NonNullable<WhoAmITableBoard['mine']>, t: Translate): string | null {
  if (mine.asked.length >= mine.questions.length) return t('games.whoAmI.couch.listDone');
  return mine.suggested.length === 0 ? t('games.whoAmI.couch.noSuggestions') : null;
}

// ---------- who is playing ----------

/** How a turn goes, as the setup tells it. */
const STEPS: readonly MessageKey[] = ['games.whoAmI.couch.step.pick', 'games.whoAmI.couch.step.turn', 'games.whoAmI.couch.step.guess'];

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
      {/* how a turn goes, in three lines a beginner reads at a glance; everything else is shown as it happens */}
      <ol className="wa-steps">
        {STEPS.map((step) => (
          <li key={step}>{t(step)}</li>
        ))}
      </ol>
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
                  <CloseIcon size={18} />
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
      <ScoringNote guesses={WHO_AM_I_ROOM_GUESSES} />
    </form>
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

/**
 * The holder's own screen, read from where the rules say the turn stands,
 * with everything a beginner needs in the order they need it: the way to say
 * they know who they are, a few questions worth asking with what each means,
 * the whole list folded away, a question of their own, and last what they
 * know so far. Once a question is answered the card's verdict is on top, and
 * the turn is to say who they are or to pass the phone on.
 *
 * Nothing on it says who the holder could be: there are no words to choose
 * from, and nobody's card can be read on it, their own or anybody else's. So
 * the friends can hand the phone straight back to it.
 */
function Board({
  game,
  seat,
  onPass,
  onPick,
  onOwn,
  onKnow,
}: {
  game: Game;
  seat: number;
  onPass: () => void;
  /** a question from the list, to read out: nothing is asked of the rules yet */
  onPick: (question: string) => void;
  /** a question of the holder's own, to ask the room */
  onOwn: () => void;
  /** the holder knows who they are, and will say so to the room */
  onKnow: () => void;
}): React.JSX.Element | null {
  const t = useT();
  const asking = useId();
  const knowing = useId();
  // the whole list, folded away until it is asked for; null while the board decides for itself
  const [unfolded, setUnfolded] = useState<boolean | null>(null);
  const board = viewOf(game, seat);
  const mine = board.mine;
  if (!mine) return null;
  const name = game.names[seat]!;
  const deciding = board.phase === 'decide';
  // While the holder decides, the last answer on the table is to their own question. One from the list left the card's
  // verdict there; one asked out loud left nothing, since the card said nothing to it.
  const told = deciding && board.told?.seat === seat ? board.told : null;
  // the friends answer with one tap for all of them, so every answer on the table is the same one
  const friends = told?.answers.find((a) => a.yes !== null) ?? null;
  const beginner = board.difficulty === 'beginner';
  const suggested = mine.suggested.flatMap((id) => mine.questions.filter((q) => q.id === id));
  // With nothing suggested the list is the only place left to pick from, so it opens by itself; with everything on it
  // asked there is nothing in it to pick, and it stays folded.
  const all = unfolded ?? (suggested.length === 0 && mine.asked.length < mine.questions.length);
  // the questions asked, in the order they were asked: what the holder has learnt so far
  const answered = askedFirst(mine.questions, mine.asked).slice(0, mine.asked.length);
  const kind = categoryName(mine.category, t);
  // what a right guess is worth now: every question costs, one of the holder's own as much as one from the list
  const worth = whoAmIPoints(mine.asked.length + mine.aloud, mine.guesses.filter((g) => !g.correct).length, true);
  // what the turn asks of the holder, when that is not simply to pick a question
  const note = deciding ? t(told ? 'games.whoAmI.wait.decide.mine' : 'games.whoAmI.couch.ownAnswered') : boardNote(mine, t);
  return (
    <div className="wa-board">
      {told && (
        <VerdictCard dialect={board.dialect} by={t('games.whoAmI.theyAsked', { name })} question={told.question} truth={told.truth} shown>
          {friends && (
            <p className="wa-verdict-you">
              {friends.right ? (
                t('games.whoAmI.couch.friendsRight', { count: WHO_AM_I_HELP_POINTS })
              ) : (
                <WithWords
                  text={t('games.whoAmI.couch.friendsWrong')}
                  words={{ said: yesNo(board.dialect, friends.yes === true, t), truth: yesNo(board.dialect, told.truth, t) }}
                  dialect={board.dialect}
                />
              )}
            </p>
          )}
        </VerdictCard>
      )}
      <div className="wa-turn is-mine is-couch">
        {/* the holder's own card, small beside the headline: a reminder that it is hidden, not the picture of the screen */}
        <ForeheadCard dialect={board.dialect} category={null} identity={null} />
        <div className="wa-turn-text">
          <h2 className="wa-turn-whose">{t('games.whoAmI.couch.whoAreYou', { name })}</h2>
          {kind && <p className="wa-turn-kind">{kind}</p>}
        </div>
        {note && <p className="wa-turn-wait">{note}</p>}
        <p className="wa-turn-worth">
          {`${t('games.whoAmI.worth', { count: worth })} · ${t('games.whoAmI.guessesLeft', { count: mine.guessesLeft })}`}
        </p>
      </div>
      {/* With an answer in hand, to say who they are is what the turn is for, and the gold is its. While there is
          still a question to ask it is there to be found, and leaves the first thing to do to the questions. */}
      <div className="wa-acts">
        <Button variant={deciding ? 'primary' : 'secondary'} size="lg" onClick={onKnow}>
          {t('games.whoAmI.know')}
        </Button>
        {deciding && (
          <Button variant="secondary" size="lg" onClick={onPass}>
            {t('games.whoAmI.couch.nextPlayer')}
          </Button>
        )}
      </div>
      {!deciding && (
        <section className="wa-deck" aria-labelledby={asking}>
          <h2 id={asking} className="wa-title">
            {t('games.whoAmI.questions')}
          </h2>
          {suggested.length > 0 && <SuggestedQuestions dialect={board.dialect} questions={suggested} onPick={onPick} />}
          <button type="button" className="wa-more" aria-expanded={all} onClick={() => setUnfolded(!all)}>
            {t('games.whoAmI.couch.all', { count: mine.questions.length })}
          </button>
          {all && (
            <>
              {!beginner && <p className="muted wa-hint">{t('games.whoAmI.tapToSee')}</p>}
              <QuestionList dialect={board.dialect} questions={askedFirst(mine.questions, mine.asked)} asked={mine.asked} meanings={beginner} onAsk={onPick} />
            </>
          )}
          {board.open && (
            <Button variant="secondary" block onClick={onOwn}>
              {t('games.whoAmI.couch.own')}
            </Button>
          )}
        </section>
      )}
      {!deciding && (
        <Button variant="ghost" block onClick={onPass}>
          {t('games.whoAmI.couch.skip')}
        </Button>
      )}
      {/* The whole list is folded away, so its stamps are not in sight when the holder makes up their mind: what they
          have learnt stands here on its own, under everything there is to press. */}
      {(mine.asked.length > 0 || mine.aloud > 0) && (
        <section className="wa-known" aria-labelledby={knowing}>
          <h2 id={knowing} className="wa-title">
            {t('games.whoAmI.couch.soFar')}
          </h2>
          {answered.length > 0 && <QuestionList dialect={board.dialect} questions={answered} asked={mine.asked} meanings={beginner} />}
          {mine.aloud > 0 && <p className="wa-known-own">{t('games.whoAmI.couch.ownCount', { count: mine.aloud, cost: WHO_AM_I_QUESTION_COST })}</p>}
        </section>
      )}
    </div>
  );
}

/**
 * The holder is about to turn the phone round. A question picked from the
 * list is here large, to read out, with what it means; for one of their own,
 * or for who they are, they are told to say it. Nothing has been asked of the
 * rules yet, so the way back costs nothing.
 */
function Say({ game, seat, said, onFriends, onBack }: { game: Game; seat: number; said: Said; onFriends: () => void; onBack: () => void }): React.JSX.Element | null {
  const t = useT();
  // when this screen appeared: the way on to the friends is not taken at once (TURN_ROUND_MS)
  const [since] = useState(() => Date.now());
  const board = viewOf(game, seat);
  const picked = said.what === 'question' ? askable(board, said.id) : null;
  if (said.what === 'question' && !picked) return null;
  return (
    <div className="wa-read">
      <div className="wa-night">
        {picked ? (
          <>
            <h2 className="wa-night-kicker">{t('games.whoAmI.couch.readAloud')}</h2>
            <QuestionCard key={picked.id} dialect={board.dialect} question={picked} large shown />
            <p className="wa-night-shout">{t('games.whoAmI.couch.turnPhone')}</p>
          </>
        ) : said.what === 'guess' ? (
          <>
            <h2 className="wa-night-kicker">{t('games.whoAmI.know')}</h2>
            <p className="wa-night-lead">{t('games.whoAmI.couch.sayWho')}</p>
            <p className="wa-night-shout">{t('games.whoAmI.couch.turnPhone')}</p>
          </>
        ) : (
          <>
            <h2 className="wa-night-kicker">{t('games.whoAmI.couch.own')}</h2>
            <p className="wa-night-lead">{t('games.whoAmI.couch.ownAsk')}</p>
            <p className="wa-night-shout">{t('games.whoAmI.couch.ownTurn')}</p>
          </>
        )}
      </div>
      <Button
        size="lg"
        block
        onClick={() => {
          if (Date.now() - since >= TURN_ROUND_MS) onFriends();
        }}
      >
        {t('games.whoAmI.couch.friendsTap')}
      </Button>
      <Button variant="ghost" block onClick={onBack}>
        {t('games.whoAmI.couch.back')}
      </Button>
    </div>
  );
}

/**
 * The friends' screen, with the phone turned away from its holder: the
 * holder's card on the deer's forehead, large, so nobody has to remember a
 * card. For a question from the list it stands beside the question, and the
 * friends tap the dialect's yes or no themselves. For one the holder asked
 * out loud they answer out loud, in the same two words if they can, and tap
 * that they are done. For a guess said out loud they are its judge, and tap
 * whether that is who the holder is. Any of those taps takes the card off the
 * screen, and so does the page being hidden.
 */
function Friends({
  game,
  seat,
  said,
  onAnswer,
  onSpoken,
  onJudged,
  onHide,
}: {
  game: Game;
  seat: number;
  said: Said;
  onAnswer: (yes: boolean) => void;
  onSpoken: () => void;
  onJudged: (right: boolean) => void;
  /** the page is no longer the one in front: back to the screen before, where no card is */
  onHide: () => void;
}): React.JSX.Element | null {
  const t = useT();
  const name = game.names[seat]!;
  const board = viewOf(game, seat);
  const picked = said.what === 'question' ? askable(board, said.id) : null;

  // the card goes away the moment the page is not the one in front: another app, the lock screen, another tab
  useEffect(() => {
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('blur', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', onHide);
    };
  }, [onHide]);

  if (said.what === 'question' && !picked) return null;
  return (
    <div className="wa-friends">
      <div className="wa-night">
        <h2 className="wa-night-title">{t('games.whoAmI.couch.is', { name })}</h2>
        <ForeheadCard dialect={board.dialect} category={null} identity={cardOf(game, seat)} label={t('games.couch.cardOf', { name })} hidden={t('games.whoAmI.cardHidden')} />
        {picked ? (
          <>
            <QuestionCard key={picked.id} dialect={board.dialect} question={picked} shown />
            <p className="wa-night-shout">{t('games.whoAmI.couch.isItTrue')}</p>
          </>
        ) : said.what === 'guess' ? (
          <p className="wa-night-shout">{t('games.whoAmI.couch.gotIt', { name })}</p>
        ) : (
          <p className="wa-night-shout">
            <WithWords text={t('games.whoAmI.couch.ownAnswer', { name })} words={sayYesNo(board.dialect, t)} dialect={board.dialect} />
          </p>
        )}
      </div>
      {picked ? (
        <AnswerPanel dialect={board.dialect} label={t('games.whoAmI.couch.isItTrue')} disabled={false} onAnswer={onAnswer} />
      ) : said.what === 'guess' ? (
        <AnswerPanel
          dialect={board.dialect}
          label={t('games.whoAmI.couch.gotIt', { name })}
          disabled={false}
          onAnswer={onJudged}
          words={{ yes: t('games.whoAmI.couch.thatsIt'), no: t('games.whoAmI.notYet') }}
        />
      ) : (
        <Button size="lg" block onClick={onSpoken}>
          {t('games.whoAmI.couch.ownDone')}
        </Button>
      )}
    </div>
  );
}

/**
 * A card found is the game's happiest moment: it comes off inside the app's
 * own celebration (ranks/Celebration.tsx), the light and the flecks round it,
 * felt once as it lands. A tap on it skips to the end.
 */
function Cheer({ seed, children }: { seed: number; children: React.ReactNode }): React.JSX.Element {
  const moment = useCelebrationMoment();
  return (
    <div className={`celebrate celebrate-inline tone-zer wa-cheer ${moment.playing ? 'is-playing' : 'is-done'}`} onClick={moment.playing ? moment.skip : undefined}>
      <CelebrationArt flecks={BURST.lesson} seed={seed} reach={150}>
        {children}
      </CelebrationArt>
    </div>
  );
}

/**
 * What came of a guess said out loud: the card coming off for a right one or
 * for the last wrong one, and for any other miss only that it was one and how
 * many guesses are left. There is no word to name in a miss: it was said, not
 * picked, and the phone never heard it.
 */
function Guessed({ game, seat, correct, onNext }: { game: Game; seat: number; correct: boolean; onNext: () => void }): React.JSX.Element | null {
  const t = useT();
  const board = viewOf(game, seat);
  const mine = board.mine;
  if (!mine) return null;
  const name = game.names[seat]!;
  // the card is in the holder's view only once it is off: found, or out of guesses
  const identity = mine.identity;
  const card = identity && <ForeheadCard dialect={board.dialect} category={null} identity={identity} label={t('games.couch.cardOf', { name })} />;
  return (
    <div className="wa-night">
      {identity ? (
        <>
          {!correct && <p className="wa-night-kicker">{t('games.whoAmI.out')}</p>}
          {correct ? <Cheer seed={seat * 31 + mine.points}>{card}</Cheer> : card}
          <h2 className="wa-night-title">
            <WithWord text={t(correct ? 'games.whoAmI.youAre' : 'games.whoAmI.youWere')} word={identity.word} dialect={board.dialect} />
          </h2>
          <p className="wa-night-points">{t('games.whoAmI.points', { count: mine.points })}</p>
        </>
      ) : (
        <>
          <p className="wa-night-shout">{t('games.whoAmI.couch.missed')}</p>
          <h2 className="wa-night-title">{t('games.whoAmI.guessesLeft', { count: mine.guessesLeft })}</h2>
        </>
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
  // everyone at the table with the card they wore, now that every card may be read
  const seats = board.seats.flatMap((s): TableSeat[] => {
    const card = reveal.find((r) => r.seat === s.seat);
    if (!card) return [];
    const worn = { word: card.word, meanings: card.meanings };
    return [{ seat: s.seat, name: game.names[s.seat]!, card: worn, own: false, asked: s.asked, points: s.points, solved: s.solved, out: s.out, left: s.left }];
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
