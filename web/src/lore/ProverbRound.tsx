import { useCallback, useEffect, useRef, useState } from 'react';
// Soranî proverbs in a typeface made for Arabic script.
import { Link } from 'react-router-dom';
import {
  PROVERB_ROUND_MODES,
  dialectDirection,
  type GameDialect,
  type ProverbRoundCorrection,
  type ProverbRoundHint,
  type ProverbRoundItemView,
  type ProverbRoundMode,
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
import { PROVERBS, inVariety, proverbPath, useLoreDialect } from './api';
// The round uses the solo games' shell: the same stones, verdicts and results.
import '../games/games.css';
import './lore.css';

type Session = SoloSessionView<ProverbRoundItemView>;
type Result = SoloAnswerResult<ProverbRoundHint, ProverbRoundCorrection>;
type Phase = 'intro' | 'round' | 'results';

const MODE_KEY: Record<ProverbRoundMode, { name: MessageKey; line: MessageKey; ask: MessageKey }> = {
  meaning: { name: 'lore.round.mode.meaning', line: 'lore.round.mode.meaningLine', ask: 'lore.round.ask.meaning' },
  situation: { name: 'lore.round.mode.situation', line: 'lore.round.mode.situationLine', ask: 'lore.round.ask.situation' },
  complete: { name: 'lore.round.mode.complete', line: 'lore.round.mode.completeLine', ask: 'lore.round.ask.complete' },
};

/** The first item still to answer, or the length when every one is done. */
function nextOpen(states: readonly SoloItemState[]): number {
  const at = states.findIndex((s) => !s.done);
  return at < 0 ? states.length : at;
}

/**
 * The proverb round (/app/learn/proverbs/play), styled like the solo games: five proverbs, three choices, two tries,
 * asking either what a proverb means or which proverb fits a scene. The server (api/src/lore/proverb-round.ts) builds
 * and scores it and keeps the answers. It pays no XP, which the results say once; at least half right on the first
 * try counts for the streak and daily goal. An unfinished round is offered again until it expires.
 */
export function ProverbRound(): React.JSX.Element {
  const [dialect] = useLoreDialect();
  return (
    <div className="container solo-page lore-round-page">
      <Round key={dialect} dialect={dialect} />
    </div>
  );
}

function Round({ dialect }: { dialect: GameDialect }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [mode, setMode] = useState<ProverbRoundMode>('meaning');
  const [open, setOpen] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [corrections, setCorrections] = useState<ProverbRoundCorrection[]>([]);
  const [results, setResults] = useState<SoloResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // An unfinished round of this mode, offered first.
  useEffect(() => {
    let live = true;
    setOpen(null);
    void client.get<{ id: string | null }>(`/proverbs/rounds/open?dialect=${dialect}&mode=${mode}`).then((res) => {
      if (live && res.ok) setOpen(res.data.id ?? null);
    });
    return () => {
      live = false;
    };
  }, [client, dialect, mode]);

  const fail = useCallback(
    (code: string | undefined, fallback: string) => {
      if (code === 'GAME_SESSION_EXPIRED') {
        setError(t('games.solo.expired'));
        setPhase('intro');
        setSession(null);
      } else if (code === 'NOT_ENOUGH_CONTENT') setError(t('lore.round.notEnough'));
      else setError(fallback);
    },
    [t],
  );

  const begin = (view: Session): void => {
    setSession(view);
    setIndex(nextOpen(view.states));
    setResult(null);
    setResults(null);
    setCorrections([]);
    setError(null);
    setPhase('round');
  };

  const finish = async (id: string): Promise<void> => {
    setBusy(true);
    const res = await client.post<SoloResults>(`/proverbs/rounds/${id}/finish`);
    setBusy(false);
    if (!res.ok) return fail(res.error.code, describeError(res.error, t));
    setResults(res.data);
    setOpen(null);
    setPhase('results');
    if (res.data.learningCounted) haptic('celebrate');
  };

  const start = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await client.post<Session>('/proverbs/rounds', { dialect, mode });
    setBusy(false);
    if (!res.ok) return fail(res.error.code, describeError(res.error, t));
    begin(res.data);
  };

  const resume = async (): Promise<void> => {
    if (!open) return;
    setBusy(true);
    const res = await client.get<Session & { expired: boolean }>(`/proverbs/rounds/${open}`);
    setBusy(false);
    if (!res.ok) return fail(res.error.code, describeError(res.error, t));
    if (res.data.expired) return fail('GAME_SESSION_EXPIRED', '');
    begin(res.data);
    // Every item answered and only the finish missing, so finish it now.
    if (nextOpen(res.data.states) >= res.data.items.length) await finish(res.data.id);
  };

  const answer = async (choice: number): Promise<void> => {
    if (!session || busy) return;
    const state = session.states[index]!;
    setBusy(true);
    const res = await client.post<Result>(`/proverbs/rounds/${session.id}/answers`, { index, answer: { choice }, attempt: state.attempts + 1 });
    setBusy(false);
    if (!res.ok) return fail(res.error.code, describeError(res.error, t));
    const r = res.data;
    setResult(r);
    haptic(r.correct ? 'correct' : 'wrong');
    if (r.correction) setCorrections((c) => [...c.filter((x) => x.slug !== r.correction!.slug), r.correction!]);
    setSession((s) =>
      s ? { ...s, states: s.states.map((st) => (st.index === index ? { index, attempts: r.attempt, correct: r.correct, firstTry: r.firstTry, done: r.done } : st)) } : s,
    );
  };

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

  // The heading takes focus on each new phase, so screen readers announce it.
  useEffect(() => {
    heading.current?.focus();
  }, [phase]);

  if (phase === 'results' && results) {
    return (
      <section className="solo solo--results lore-round" aria-labelledby="solo-title">
        <h1 id="solo-title" ref={heading} tabIndex={-1} className="solo-title">
          {t('games.solo.results.title')}
        </h1>
        <p className="solo-score">{t('games.solo.results.score', { correct: results.correct, total: results.total })}</p>
        <ol className="solo-stones solo-stones--results" aria-hidden="true">
          {results.items.map((i) => (
            <li key={i.index} className={`solo-stone ${i.correct ? (i.firstTry ? 'is-first' : 'is-right') : 'is-missed'}`} />
          ))}
        </ol>
        <ul className="solo-facts">
          <li>{t('games.solo.results.firstTry', { n: results.firstTry })}</li>
          {results.learningCounted ? (
            <li>{t('games.solo.results.streak')}</li>
          ) : (
            <li className="solo-honest">{t('games.solo.results.notCounted', { needed: results.needed, correct: results.firstTry })}</li>
          )}
          <li className="solo-muted">{t('lore.round.noXp')}</li>
        </ul>
        {corrections.length > 0 && <MetInRound corrections={corrections} dialect={dialect} />}
        {error && <p className="field-error">{error}</p>}
        <div className="solo-actions">
          <Button onClick={() => void start()} disabled={busy}>
            {t('games.solo.playAgain')}
          </Button>
          <Link to={inVariety(PROVERBS, dialect)} className="btn btn-secondary">
            {t('lore.round.backToProverbs')}
          </Link>
        </div>
      </section>
    );
  }

  if (phase === 'round' && session) {
    const item = session.items[Math.min(index, session.items.length - 1)]!;
    const state = session.states[Math.min(index, session.states.length - 1)]!;
    const last = session.states.every((s) => s.done || s.index === index);
    return (
      <section className="solo solo--round lore-round" aria-labelledby="solo-title">
        <header className="solo-bar">
          <Link to={inVariety(PROVERBS, dialect)} className="solo-exit" aria-label={t('games.solo.exit')}>
            <CloseIcon size={20} />
          </Link>
          <h1 id="solo-title" ref={heading} tabIndex={-1} className="sr-only">
            {t('lore.round.title')}
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

        <RoundItem key={item.index} item={item} state={state} result={result} busy={busy} onChoose={(c) => void answer(c)} />

        <div className={`solo-feedback${result ? ` is-${result.correct ? 'right' : result.done ? 'missed' : 'again'}` : ''}`} aria-live="polite">
          {result && (
            <>
              <p className="solo-verdict">
                {result.correct ? <CheckIcon size={18} /> : null}
                {result.correct ? t(result.firstTry ? 'games.solo.rightFirstTry' : 'games.solo.right') : result.done ? t('games.solo.answerWas') : t('games.solo.notYet')}
              </p>
              {result.done && result.correction && <Correction correction={result.correction} dialect={item.dialect} />}
              {result.done && (
                <Button onClick={next} disabled={busy} autoFocus>
                  {last ? t('games.solo.seeResults') : t('games.solo.next')}
                </Button>
              )}
            </>
          )}
          {error && <p className="field-error">{error}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="solo solo--intro lore-round" aria-labelledby="solo-title">
      <p className="lore-eyebrow" lang="ku">
        {t('lore.shelf.proverbs.name')}
      </p>
      <h1 id="solo-title" ref={heading} tabIndex={-1} className="solo-title">
        {t('lore.round.title')}
      </h1>
      <p className="solo-blurb">{t('lore.round.blurb')}</p>
      <p className="solo-variety">{t('games.solo.variety', { variety: dialectName(dialect) })}</p>
      <fieldset className="solo-difficulty">
        <legend>{t('lore.round.mode')}</legend>
        <div className="lore-modes">
          {PROVERB_ROUND_MODES.map((m) => (
            <label key={m} className={`lore-mode${mode === m ? ' is-on' : ''}`}>
              <input type="radio" name="lore-round-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              <span className="lore-mode-name">{t(MODE_KEY[m].name)}</span>
              <span className="lore-mode-line">{t(MODE_KEY[m].line)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {open && (
        <Button variant="secondary" onClick={() => void resume()} disabled={busy} className="solo-continue">
          {t('games.solo.continue')}
        </Button>
      )}
      <Button size="lg" onClick={() => void start()} disabled={busy}>
        {t('games.solo.start')}
      </Button>
      {error && <p className="field-error">{error}</p>}
    </section>
  );
}

/** One item and its three choices; a wrong choice is struck out, and once done the right one is marked. */
function RoundItem({
  item,
  state,
  result,
  busy,
  onChoose,
}: {
  item: ProverbRoundItemView;
  state: SoloItemState;
  result: Result | null;
  busy: boolean;
  onChoose: (choice: number) => void;
}): React.JSX.Element {
  const t = useT();
  const kurdish = dialectDirection(item.dialect);
  const [struck, setStruck] = useState<number[]>([]);
  useEffect(() => {
    if (result && !result.correct && result.hint) setStruck((s) => (s.includes(result.hint!.struck) ? s : [...s, result.hint!.struck]));
  }, [result]);
  const done = state.done || result?.done === true;
  const right = result?.done ? (result.correction?.choice ?? null) : null;
  // A meaning is in the round's language; a proverb is in Kurdish.
  const optionLang = item.mode === 'meaning' ? { lang: item.locale, dir: 'auto' as const } : kurdish;

  return (
    <div className={`lore-round-item is-${item.mode}`}>
      <p className="lore-eyebrow">{t(MODE_KEY[item.mode].ask)}</p>
      {item.mode === 'meaning' ? (
        <p className="lore-round-prompt lore-display lore-verse" lang={kurdish.lang} dir={kurdish.dir}>
          {item.proverb}
        </p>
      ) : item.mode === 'complete' ? (
        // The missing word is its own element, so it reads as a blank to fill, for screen readers too.
        <p className="lore-round-prompt lore-display lore-verse" lang={kurdish.lang} dir={kurdish.dir}>
          {item.before}{' '}
          <span className="lore-gap" role="img" aria-label={t('lore.round.ask.complete')}>
            {right !== null ? item.options[right] : '…'}
          </span>
          {item.after}
        </p>
      ) : (
        <p className="lore-round-scene" lang={item.locale} dir="auto">
          {item.scene}
        </p>
      )}
      <ul className="lore-options" role="list">
        {item.options.map((o, i) => {
          const isStruck = struck.includes(i) && right !== i;
          const isRight = right === i;
          return (
            <li key={i}>
              <button
                type="button"
                className={`lore-option${isStruck ? ' is-struck' : ''}${isRight ? ' is-right' : ''}${item.mode !== 'meaning' ? ' lore-display' : ''}`}
                disabled={busy || done || isStruck}
                onClick={() => onChoose(i)}
                lang={optionLang.lang}
                dir={optionLang.dir}
              >
                {o}
                {isRight && <span className="sr-only">{t('games.solo.right')}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Once an item is done: its proverb, translation and meaning. */
function Correction({ correction, dialect }: { correction: ProverbRoundCorrection; dialect: GameDialect }): React.JSX.Element {
  const { lang, dir } = dialectDirection(dialect);
  return (
    <div className="lore-correction">
      <p className="lore-correction-text lore-display" lang={lang} dir={dir}>
        {correction.text}
      </p>
      <p className="lore-translated" lang={correction.locale} dir="auto">
        {correction.translation}
      </p>
      <p className="solo-why" lang={correction.locale} dir="auto">
        {correction.meaning}
      </p>
    </div>
  );
}

/** The round's proverbs, each linking to its page. */
function MetInRound({ corrections, dialect }: { corrections: ProverbRoundCorrection[]; dialect: GameDialect }): React.JSX.Element {
  const t = useT();
  const { lang, dir } = dialectDirection(dialect);
  return (
    <section className="lore-met" aria-labelledby="lore-met-title">
      <h2 id="lore-met-title" className="story-section-title">
        {t('lore.round.met')}
      </h2>
      <ul className="lore-list">
        {corrections.map((c) => (
          <li key={c.slug}>
            <Link to={proverbPath(c.slug)} className="lore-row">
              <span className="lore-row-text">
                <span className="lore-row-question lore-display" lang={lang} dir={dir}>
                  {c.text}
                </span>
                <span className="lore-row-translation" lang={c.locale} dir="auto">
                  {c.translation}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
