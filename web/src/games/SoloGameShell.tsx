import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DIFFICULTY_LEVELS,
  GAME_DIFFICULTIES,
  gameEmblemTone,
  isGameEmblem,
  learnGame,
  roundXpCeiling,
  type GameDialect,
  type GameDifficulty,
  type LearnGameId,
  type LearnGamePlace,
  type SoloAnswerResult,
  type SoloItemState,
  type SoloResults,
  type SoloSessionView,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { CheckIcon, CloseIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { describeError } from '../lib/api';
import { haptic } from '../lib/haptics';
import { dialectName } from '../learn/map';
import { GameArt } from './GameArt';
// a round wears one of the path's tones (`lp-tone-*`), and the shell's own look is the games' stylesheet
import '../learn/path.css';
import './games.css';
// a game's round is played on the games' stage; a lesson's exercise keeps the lessons' plain page
import './game-stage.css';

/**
 * What every learning game played alone has around its own staging: the
 * intro (what the game is, the game's own picture of it, the difficulty), the
 * round (where you are in it, the feedback after each answer with its
 * explanation), and results that say exactly what happened — how many right,
 * how many on the first try, what it paid, and when it paid nothing, why.
 *
 * The round is the server's (api/src/games/solo.ts): it is made there, every
 * try is checked there, and the finish pays there, once. This shell only
 * carries the tries and shows what comes back. A round left open is offered
 * again ("Continue your round") until it expires.
 *
 * The game draws the item itself (`renderRound`): its board, its Check
 * button, its nudge after a wrong try and its correction once an item is
 * done. The shell draws the verdict, the explanation and the way on.
 *
 * Two of the rounds it carries are not games: Build a Kurdish Sentence and
 * Hear It, Find It are exercises of the lessons' practice (the registry's
 * `place`). For them the way out leads back to Learn and is worded as a
 * lesson's is, and another go is another round, not another game.
 *
 * A game is played on the games' stage (game-stage.css): it opens on its
 * emblem acting out the game, and its result is given on the same night, so
 * the start and the end of a round are plainly one place. An exercise of the
 * lessons has no emblem and keeps the lessons' plain page.
 */

/** What a game's board is handed for the item in front of the player. */
export interface SoloRound<Item, H, C, B = unknown> {
  /** the round's id: what a game's clips are played from (`hearItClipPath`), and what it asks more of than answers (Kurdish Detective's hints, Who Am I?'s questions) */
  sessionId: string;
  /** what the whole round shares, as the round was sent (Kurdish Detective's case board); null for a game without */
  board: B | null;
  item: Item;
  index: number;
  total: number;
  state: SoloItemState;
  /**
   * The verdict, the explanation and the way on, for a game that places them
   * itself (`feedbackInRound`): beside its question rather than under a tall
   * board. Null for every other game, whose round has them underneath.
   */
  feedback: React.ReactNode;
  /** the last answer to this item, while it is on screen */
  result: SoloAnswerResult<H, C> | null;
  busy: boolean;
  /** send one try; the result comes back through `result` */
  submit: (answer: unknown) => Promise<void>;
  /**
   * For an item studied before it is answered (The Memory Thief): ask for
   * what it is answered with. The item comes back changed for good, through
   * `item`; false when the server could not be reached (the error is shown).
   */
  begin: () => Promise<boolean>;
}

interface Props<Item, H, C, B> {
  game: LearnGameId;
  dialect: GameDialect;
  title: string;
  /** one line on what the game is */
  blurb: string;
  /** the game's own introduction above the difficulty: Build a Kurdish Sentence's ladder */
  intro?: React.ReactNode;
  /** the difficulties with enough approved content; null while they are being counted */
  difficulties: GameDifficulty[] | null;
  /** the one to offer first (the learner's own, when the game knows it) */
  suggested?: GameDifficulty;
  /** a round left unfinished, to offer first */
  open: string | null;
  renderRound: (round: SoloRound<Item, H, C, B>) => React.ReactNode;
  /** the explanation for an item's `why`, in the reader's words */
  explain: (why: string) => string | null;
  /** after a round is paid: the game refreshes what it shows (the ladder) */
  onFinished?: (results: SoloResults) => void;
  /** more for the results screen: a rung opened */
  resultsExtra?: React.ReactNode;
  /** items in one of its rounds, when it is not SOLO_ROUND_ITEMS: what "up to N XP" counts */
  roundItems?: number;
  /** the game puts the verdict and the way on in its own round (`SoloRound.feedback`), next to what was answered */
  feedbackInRound?: boolean;
}

const DIFFICULTY_KEY: Record<GameDifficulty, MessageKey> = {
  beginner: 'games.solo.difficulty.beginner',
  intermediate: 'games.solo.difficulty.intermediate',
  advanced: 'games.solo.difficulty.advanced',
};

/** Where a round leaves to and how its results word the way back and another go, by where the registry puts it. */
const HOME: Record<LearnGamePlace, { to: string; back: MessageKey; again: MessageKey }> = {
  games: { to: '/app/games', back: 'games.solo.backToGames', again: 'games.solo.playAgain' },
  lessons: { to: '/app/learn', back: 'lesson.backToLearn', again: 'learn.exercise.again' },
};

type Phase = 'intro' | 'round' | 'results';

/** The first item still to answer, or the length when every one is done. */
function nextOpen(states: readonly SoloItemState[]): number {
  const at = states.findIndex((s) => !s.done);
  return at < 0 ? states.length : at;
}

export function SoloGameShell<Item, H, C, B = unknown>({
  game,
  dialect,
  title,
  blurb,
  intro,
  difficulties,
  suggested,
  open,
  renderRound,
  explain,
  onFinished,
  resultsExtra,
  roundItems,
  feedbackInRound = false,
}: Props<Item, H, C, B>): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const place = learnGame(game).place;
  const home = HOME[place];
  // the games' stage, in the game's own colour; an exercise of the lessons is not on it
  const staged = place === 'games';
  const stage = staged ? ' gs' : '';
  // the game's own picture (shared/src/art/games.ts), for its start and its result
  const emblem = staged && isGameEmblem(game) ? game : null;
  const tone = emblem ? ({ '--gs-tone': gameEmblemTone(emblem) } as React.CSSProperties) : undefined;
  const [phase, setPhase] = useState<Phase>('intro');
  const [difficulty, setDifficulty] = useState<GameDifficulty | null>(null);
  const [session, setSession] = useState<SoloSessionView<Item, B> | null>(null);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<SoloAnswerResult<H, C> | null>(null);
  const [results, setResults] = useState<SoloResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // the difficulty offered first: the suggested one when it can be played, else the first that can
  const offered = difficulties ?? [];
  const chosen = difficulty && offered.includes(difficulty) ? difficulty : suggested && offered.includes(suggested) ? suggested : (offered[0] ?? null);

  const fail = useCallback(
    (code: string | undefined, fallback: string) => {
      if (code === 'GAME_SESSION_EXPIRED') {
        setError(t('games.solo.expired'));
        setPhase('intro');
        setSession(null);
      } else if (code === 'NOT_ENOUGH_CONTENT') setError(t('games.solo.notEnough'));
      else setError(fallback);
    },
    [t],
  );

  const begin = useCallback((view: SoloSessionView<Item, B>) => {
    setSession(view);
    setIndex(nextOpen(view.states));
    setResult(null);
    setResults(null);
    setError(null);
    setPhase('round');
  }, []);

  const finish = useCallback(
    async (id: string) => {
      setBusy(true);
      const res = await client.post<SoloResults>(`/games/solo/sessions/${id}/finish`);
      setBusy(false);
      if (!res.ok) return fail(res.error.code, describeError(res.error, t));
      setResults(res.data);
      setPhase('results');
      if (res.data.learningCounted) haptic('celebrate');
      onFinished?.(res.data);
    },
    [client, fail, onFinished, t],
  );

  const start = async (): Promise<void> => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const res = await client.post<SoloSessionView<Item, B>>('/games/solo/sessions', { game, dialect, difficulty: chosen });
    setBusy(false);
    if (!res.ok) return fail(res.error.code, describeError(res.error, t));
    begin(res.data);
  };

  const resume = async (): Promise<void> => {
    if (!open) return;
    setBusy(true);
    const res = await client.get<SoloSessionView<Item, B> & { expired: boolean }>(`/games/solo/sessions/${open}`);
    setBusy(false);
    if (!res.ok) return fail(res.error.code, describeError(res.error, t));
    if (res.data.expired) return fail('GAME_SESSION_EXPIRED', '');
    begin(res.data);
    // every item answered and only the finish missing: finish it now
    if (nextOpen(res.data.states) >= res.data.items.length) await finish(res.data.id);
  };

  const submit = useCallback(
    async (answer: unknown) => {
      if (!session || busy) return;
      const state = session.states[index]!;
      setBusy(true);
      const res = await client.post<SoloAnswerResult<H, C>>(`/games/solo/sessions/${session.id}/answers`, { index, answer, attempt: state.attempts + 1 });
      setBusy(false);
      if (!res.ok) return fail(res.error.code, describeError(res.error, t));
      const r = res.data;
      setResult(r);
      haptic(r.correct ? 'correct' : 'wrong');
      setSession((s) =>
        s ? { ...s, states: s.states.map((st) => (st.index === index ? { index, attempts: r.attempt, correct: r.correct, firstTry: r.firstTry, done: r.done } : st)) } : s,
      );
    },
    [busy, client, fail, index, session, t],
  );

  const beginItem = useCallback(async (): Promise<boolean> => {
    if (!session) return false;
    const res = await client.post<{ item: Item }>(`/games/solo/sessions/${session.id}/begin`, { index });
    if (!res.ok) {
      fail(res.error.code, describeError(res.error, t));
      return false;
    }
    setSession((s) => (s ? { ...s, items: s.items.map((it, i) => (i === index ? res.data.item : it)) } : s));
    return true;
  }, [client, fail, index, session, t]);

  const next = (): void => {
    if (!session) return;
    const at = nextOpen(session.states);
    if (at >= session.items.length) {
      void finish(session.id);
      return;
    }
    setIndex(at);
    setResult(null);
  };

  // the heading takes the focus on each new phase, so a screen reader hears where it is
  useEffect(() => {
    heading.current?.focus();
  }, [phase]);

  if (phase === 'results' && results && session) {
    const right = results.items.filter((i) => i.correct).length;
    const outcome = (
      <>
        <h1 id="solo-title" ref={heading} tabIndex={-1} className={staged ? 'gs-hero-meta' : 'solo-title'}>
          {t('games.solo.results.title')}
        </h1>
        <p className="solo-score">{t('games.solo.results.score', { correct: results.correct, total: results.total })}</p>
        <ol className="solo-stones solo-stones--results" aria-label={t('games.solo.results.score', { correct: right, total: results.total })}>
          {results.items.map((i) => (
            <li key={i.index} className={`solo-stone ${i.correct ? (i.firstTry ? 'is-first' : 'is-right') : 'is-missed'}`} aria-hidden />
          ))}
        </ol>
      </>
    );
    return (
      <section className={`solo solo--results${stage}`} style={tone} aria-labelledby="solo-title">
        {staged ? (
          <div className="gs-hero gs-hero--result">
            {emblem && <GameArt game={emblem} size={104} />}
            {outcome}
          </div>
        ) : (
          outcome
        )}
        <ul className="solo-facts">
          <li>{t('games.solo.results.firstTry', { n: results.firstTry })}</li>
          {results.learningCounted ? (
            <>
              <li className="solo-xp">{t('games.solo.results.xp', { xp: results.xp })}</li>
              <li>{t('games.solo.results.streak')}</li>
            </>
          ) : (
            <li className="solo-honest">{t('games.solo.results.noXp', { needed: results.needed, correct: results.firstTry })}</li>
          )}
          {results.learningCounted && results.items.some((i) => i.correct && i.repeat) && <li className="solo-muted">{t('games.solo.results.repeat')}</li>}
        </ul>
        {resultsExtra}
        {error && <p className="field-error">{error}</p>}
        <div className="solo-actions">
          <Button onClick={() => void start()} disabled={busy || !chosen}>
            {t(home.again)}
          </Button>
          <Link to={home.to} className="btn btn-secondary">
            {t(home.back)}
          </Link>
        </div>
      </section>
    );
  }

  if (phase === 'round' && session) {
    const item = session.items[Math.min(index, session.items.length - 1)]!;
    const state = session.states[Math.min(index, session.states.length - 1)]!;
    // once this item is done, is anything left?
    const last = session.states.every((s) => s.done || s.index === index);
    const why = result?.done && result.why ? explain(result.why) : null;
    const feedback = (
      <div className={`solo-feedback${result ? ` is-${result.correct ? 'right' : result.done ? 'missed' : 'again'}` : ''}`} aria-live="polite">
        {result && (
          <>
            <p className="solo-verdict">
              {result.correct ? <CheckIcon size={18} /> : null}
              {result.correct ? t(result.firstTry ? 'games.solo.rightFirstTry' : 'games.solo.right') : result.done ? t('games.solo.answerWas') : t('games.solo.notYet')}
            </p>
            {why && (
              <p className="solo-why">
                <strong>{t('games.solo.why')}</strong> {why}
              </p>
            )}
            {result.done && (
              <Button onClick={next} disabled={busy} autoFocus>
                {last ? t('games.solo.seeResults') : t('games.solo.next')}
              </Button>
            )}
          </>
        )}
        {error && <p className="field-error">{error}</p>}
      </div>
    );
    const round = { sessionId: session.id, board: session.board ?? null, item, index, total: session.items.length, state, result, busy, submit, begin: beginItem };
    return (
      <section className={`solo solo--round${stage}`} style={tone} aria-labelledby="solo-title">
        <header className="solo-bar">
          <Link to={home.to} className="solo-exit" aria-label={t('games.solo.exit')}>
            <CloseIcon size={20} />
          </Link>
          <h1 id="solo-title" ref={heading} tabIndex={-1} className="sr-only">
            {title}
          </h1>
          <ol className="solo-stones" aria-label={t('games.solo.progress', { n: index + 1, total: session.items.length })}>
            {session.states.map((s) => (
              <li
                key={s.index}
                aria-hidden
                className={`solo-stone${s.index === index ? ' is-here' : ''}${s.done ? (s.correct ? (s.firstTry ? ' is-first' : ' is-right') : ' is-missed') : ''}`}
              />
            ))}
          </ol>
          <span className="solo-count" aria-hidden>
            {t('games.solo.progress', { n: index + 1, total: session.items.length })}
          </span>
        </header>

        {renderRound({ ...round, feedback: feedbackInRound ? feedback : null })}

        {!feedbackInRound && feedback}
      </section>
    );
  }

  return (
    <section className={`solo solo--intro${stage}`} style={tone} aria-labelledby="solo-title">
      {staged ? (
        <div className="gs-hero">
          {emblem && <GameArt game={emblem} size={148} moving />}
          <p className="gs-hero-meta">{t('games.solo.variety', { variety: dialectName(dialect) })}</p>
          <h1 id="solo-title" ref={heading} tabIndex={-1} className="gs-hero-title">
            {title}
          </h1>
          <p className="gs-hero-line">{blurb}</p>
        </div>
      ) : (
        <>
          <h1 id="solo-title" ref={heading} tabIndex={-1} className="solo-title">
            {title}
          </h1>
          <p className="solo-blurb">{blurb}</p>
          <p className="solo-variety">{t('games.solo.variety', { variety: dialectName(dialect) })}</p>
        </>
      )}
      {intro}
      {open && (
        <Button variant="secondary" onClick={() => void resume()} disabled={busy} className="solo-continue">
          {t('games.solo.continue')}
        </Button>
      )}
      <fieldset className="solo-difficulty">
        <legend>{t('games.solo.difficulty')}</legend>
        <div className="solo-chips" role="radiogroup">
          {GAME_DIFFICULTIES.map((d) => {
            const can = offered.includes(d);
            return (
              <label key={d} className={`solo-chip${chosen === d ? ' is-on' : ''}${can ? '' : ' is-off'}`}>
                <input type="radio" name="difficulty" value={d} checked={chosen === d} disabled={!can} onChange={() => setDifficulty(d)} />
                <span>{t(DIFFICULTY_KEY[d])}</span>
              </label>
            );
          })}
        </div>
        {chosen && <p className="solo-muted">{t('games.solo.upToXp', { xp: roundXpCeiling(DIFFICULTY_LEVELS[chosen], roundItems) })}</p>}
      </fieldset>
      <Button size="lg" className={staged ? 'gs-go' : undefined} onClick={() => void start()} disabled={busy || !chosen}>
        {t('games.solo.start')}
      </Button>
      {difficulties !== null && offered.length === 0 && <p className="solo-muted">{t('games.solo.notEnough')}</p>}
      {error && <p className="field-error">{error}</p>}
    </section>
  );
}
