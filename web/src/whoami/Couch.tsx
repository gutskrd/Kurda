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
  type WhoAmISays,
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
import { useAsksBeforeLeaving } from '../layouts/BackButton';
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
  AnswerKeys,
  ForeheadCard,
  Foreheads,
  JudgeKeys,
  QuestionCard,
  QuestionList,
  ReportAnswer,
  ScoringNote,
  SuggestedQuestions,
  VerdictCard,
  WHO_AM_I_END_KEY,
  WHO_AM_I_PATH,
  WithWord,
  WithWords,
  answerWord,
  askedFirst,
  categoryName,
  type Judged,
  type TableSeat,
} from './WhoAmIStage';

/**
 * Who Am I? on one phone passed round a room (/app/games/who-am-i?couch=1), running the shared rules
 * (shared/src/games/who-am-i/rules.ts) on cards the server deals (couch.ts). The holder picks a question (suggested or
 * from the list) and reads it out, then turns the phone to the friends, who see the card and tap yes, could be, no or
 * not sure; the phone hides the card and shows its verdict. A question of their own is answered out loud and only
 * counted. A guess is said out loud and judged by the friends: right, close (no guess spent, turn passes) or not yet.
 *
 * Because one screen is shared by people who must not read their own card:
 * - a card is drawn only on the friends' screen, hidden by their tap, by leaving the page or by the screen locking;
 * - the holder's screen never lists words to guess from, and shows nobody's card;
 * - the button to the friends' screen ignores taps briefly, so a double tap cannot reveal the card;
 * - a screen with only the next player's name sits between players;
 * - a question or guess costs nothing until the friends answer it;
 * - cards live in memory only; player names stay on this phone for the next game and are never sent;
 * - leaving asks first, since the cards and points go with the page.
 *
 * No turn has a clock. A game played this way earns nothing, since the phone holds every card.
 */

const KEPT = 'hevalo.whoami.couch';

/**
 * How long the button to the friends' screen ignores taps after appearing, longer than a double tap's gap, so a second
 * tap cannot reveal the card to its wearer.
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
  | { at: 'guessed'; seat: number; judged: Judged }
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

/** The dialect's own four answers, for a line that tells the friends what to say out loud. */
function sayAnswers(dialect: GameDialect, t: Translate): Record<WhoAmISays, string> {
  return { yes: answerWord(dialect, 'yes', t), sometimes: answerWord(dialect, 'sometimes', t), no: answerWord(dialect, 'no', t), unsure: answerWord(dialect, 'unsure', t) };
}

/** What the room's judgement of a guess said out loud is, as a move of the rules: close spends no guess and passes the turn. */
const SAID: Record<Judged, { kind: 'said'; right: boolean; close?: true }> = {
  right: { kind: 'said', right: true },
  close: { kind: 'said', right: false, close: true },
  wrong: { kind: 'said', right: false },
};

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
      // the room's size is all the server is told: the names stay on this phone. The friends are offered all four
      // answers, so the cards come with their "sometimes" rows.
      const res = await client.post<WhoAmICouchDeals>('/games/who-am-i/couch/deal', { dialect, difficulty, players: names.length, answers: 4 });
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
  // the way back in a phone's top bar is asked the same question as the game's own
  useAsksBeforeLeaving(under ? () => setLeaving('/app/games') : null);

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

  /** Applies the friends' judgement of a spoken guess; the card leaves the screen at once. */
  const judged = (judgement: Judged): void => {
    const seat = game?.state.turn ?? null;
    if (!game || seat === null) return;
    const res = whoAmITableRules.apply(game.state, seat, SAID[judgement], Date.now());
    if (!res.ok) return setGame({ ...game, step: { at: 'board' } });
    // A miss is felt at once; a card found is felt as it lands, in its celebration. Close is no miss: like "could be"
    // and "not sure", it never buzzes.
    if (judgement === 'wrong') haptic('wrong');
    setGame({ ...game, state: res.state, step: { at: 'guessed', seat, judged: judgement } });
  };

  /** The turn passed on without a guess. */
  const pass = (): void => {
    const seat = game?.state.turn ?? null;
    if (!game || seat === null) return;
    const res = whoAmITableRules.apply(game.state, seat, { kind: 'pass' }, Date.now());
    if (res.ok) setGame({ ...game, state: res.state, step: onward(res.state) });
  };

  /**
   * Applies the friends' answer, asking and answering the question in one step so it costs nothing before; the card
   * leaves the screen at once and the phone returns to the holder's board.
   */
  const answer = (question: string, says: WhoAmISays): void => {
    const seat = game?.state.turn ?? null;
    if (!game || seat === null) return;
    const now = Date.now();
    const asked = whoAmITableRules.apply(game.state, seat, { kind: 'ask', question }, now);
    setGame({ ...game, state: asked.ok ? roomAnswers(asked.state, says, now) : game.state, step: { at: 'board' } });
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
 * A game under way, by phase: between players, the holder's board, a question or guess being said, the friends'
 * screen, a guess's result, and the end. While there is something to lose, every phase offers the way out.
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
  onJudged: (judged: Judged) => void;
  onPass: () => void;
  onAnswer: (question: string, says: WhoAmISays) => void;
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
          onAnswer={(says) => {
            if (step.said.what === 'question') onAnswer(step.said.id, says);
          }}
          onSpoken={onSpoken}
          onJudged={onJudged}
          onHide={() => go({ at: 'say', said: step.said })}
        />
      )}
      {step.at === 'guessed' && <Guessed game={game} seat={step.seat} judged={step.judged} onNext={() => go(onward(game.state))} />}
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
    if (step.judged === 'right') return t('games.whoAmI.solved');
    if (step.judged === 'close') return t('games.whoAmI.said.close');
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
          ? t('games.whoAmI.couch.ownAnswer', { name, ...sayAnswers(state.dialect, t) })
          : t('games.whoAmI.couch.isItTrue');
    return `${t('games.whoAmI.couch.is', { name })} ${asks}`;
  }
  // back on the holder's board: the card's verdict, or that the friends have answered
  if (state.phase === 'decide') return state.told ? `${t('games.whoAmI.cardSays')} ${answerWord(state.dialect, state.told.verdict, t)}` : t('games.whoAmI.couch.ownAnswered');
  // or whose board it is, with what the board says when the turn is not simply a question to pick
  const mine = viewOf(game, state.turn).mine;
  return [t('games.whoAmI.couch.whoAreYou', { name }), mine ? boardNote(mine, t) : null].filter(Boolean).join(' ');
}

/**
 * The note on a board when there is no suggested question: the list is used up, or nothing is suggested. Neither is
 * a dead end, since a question of the holder's own is always possible.
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
 * The holder's screen, in a beginner's order: say who they are, suggested questions with meanings, the full list
 * folded away, their own question, and what they know so far. After an answer, the verdict is on top and the turn is
 * to guess or pass. Nothing on it reveals any card, so the friends can hand the phone straight back.
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
  const friends = told?.answers.find((a) => a.says !== null) ?? null;
  // the card the verdict came from, by its id on this phone's deal, for a friend who saw it to say its answer looks wrong
  const card = game.state.seats.find((s) => s.seat === seat)?.deal?.identity.id ?? null;
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
        <VerdictCard dialect={board.dialect} by={t('games.whoAmI.theyAsked', { name })} question={told.question} verdict={told.verdict} shown>
          {friends?.says && (
            <p className="wa-verdict-you">
              {friends.mark === 'right' ? (
                t('games.whoAmI.couch.friendsRight', { count: WHO_AM_I_HELP_POINTS })
              ) : (
                <WithWords
                  // close and not sure are no mistake: only yes against no is called wrong
                  text={t(friends.mark === 'close' ? 'games.whoAmI.couch.friendsClose' : friends.mark === 'unsure' ? 'games.whoAmI.couch.friendsUnsure' : 'games.whoAmI.couch.friendsWrong')}
                  words={{ said: answerWord(board.dialect, friends.says, t), truth: answerWord(board.dialect, told.verdict, t) }}
                  dialect={board.dialect}
                />
              )}
            </p>
          )}
          {card && <ReportAnswer key={`${seat}:${told.question.id}`} body={{ identity: card, question: told.question.id }} />}
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
 * Before turning the phone: a picked question shown large with its meaning to read out, or an instruction to say
 * their own question or guess. Nothing has reached the rules yet, so going back costs nothing.
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
 * The friends' screen with the holder's card large on the deer's forehead. For a listed question they tap the
 * answer; for the holder's own question they answer aloud and tap done; for a guess they judge it right, close (such
 * as a regional word) or not yet. Any tap, or the page being hidden, takes the card off screen.
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
  onAnswer: (says: WhoAmISays) => void;
  onSpoken: () => void;
  onJudged: (judged: Judged) => void;
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
            <WithWords text={t('games.whoAmI.couch.ownAnswer', { name })} words={sayAnswers(board.dialect, t)} dialect={board.dialect} />
          </p>
        )}
      </div>
      {picked ? (
        <AnswerKeys dialect={board.dialect} label={t('games.whoAmI.couch.isItTrue')} answers={board.answers} disabled={false} onAnswer={onAnswer} />
      ) : said.what === 'guess' ? (
        <JudgeKeys
          label={t('games.whoAmI.couch.gotIt', { name })}
          onJudge={onJudged}
          words={{ right: t('games.whoAmI.couch.thatsIt'), close: t('games.whoAmI.judge.close'), wrong: t('games.whoAmI.notYet') }}
        />
      ) : (
        <Button size="lg" block onClick={onSpoken}>
          {t('games.whoAmI.couch.ownDone')}
        </Button>
      )}
    </div>
  );
}

/** A found card comes off inside the app's celebration (ranks/Celebration.tsx); a tap skips to the end. */
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
 * A spoken guess's result: the card comes off for a right guess or the last wrong one; another miss shows the guesses
 * left; a close guess spends none and passes the turn with the card still hidden. The guess itself is never named,
 * since the phone never heard it.
 */
function Guessed({ game, seat, judged, onNext }: { game: Game; seat: number; judged: Judged; onNext: () => void }): React.JSX.Element | null {
  const t = useT();
  const board = viewOf(game, seat);
  const mine = board.mine;
  if (!mine) return null;
  const name = game.names[seat]!;
  const correct = judged === 'right';
  // the card is in the holder's view only once it is off: found, or out of guesses
  const identity = mine.identity;
  const card = identity && <ForeheadCard dialect={board.dialect} category={null} identity={identity} label={t('games.couch.cardOf', { name })} />;
  return (
    <div className="wa-night">
      {judged === 'close' && !identity ? (
        <>
          <h2 className="wa-night-lead">{t('games.whoAmI.said.close')}</h2>
          <p className="wa-night-points">{t('games.whoAmI.guessesLeft', { count: mine.guessesLeft })}</p>
        </>
      ) : identity ? (
        <>
          {/* a card off without being found is off because its player is out, or because the game is over */}
          {!correct && mine.out && <p className="wa-night-kicker">{t('games.whoAmI.out')}</p>}
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
