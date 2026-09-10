import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { ErrorState } from '../components/states';
import { ArrowIcon } from '../components/icons';
import { useTypeOnly } from '../components/typeOnly';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/**
 * Typing race: reproduce a Kurdish text as fast and as accurately as you can.
 *
 * The clock shown here is for the racer's benefit only. The score comes from
 * the server, which timed the race from when it handed the text over — so what
 * this page displays can never be what counts.
 */

interface RaceGame {
  id: string;
  text: { id: string; title: string; body: string; difficulty: number };
  startedAt: string;
}

interface RaceResult {
  wpm: number;
  accuracy: number;
  score: number;
  correctChars: number;
  perfect: boolean;
  elapsedMs: number;
  xpAwarded: number;
  /** the server saw a speed no person types at, and scored the run at nothing */
  implausible?: boolean;
}


const DIFFICULTY: Array<{ value: number; labelKey: MessageKey }> = [
  { value: 1, labelKey: 'games.race.short' },
  { value: 2, labelKey: 'games.race.medium' },
  { value: 3, labelKey: 'games.race.long' },
];

export function Race(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [game, setGame] = useState<RaceGame | null>(null);
  const [difficulty, setDifficulty] = useState(1);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<RaceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [focused, setFocused] = useState(false);
  // the text to copy is on this very screen, so the box takes keystrokes only
  const { handlers: typeOnly, notice } = useTypeOnly(t('games.race.noPasting'));
  const startedAt = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);

  const target = game?.text.body ?? '';

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setTyped('');
    const res = await client.post<RaceGame>('/race', { difficulty });
    setBusy(false);
    if (res.ok) {
      setGame(res.data);
      startedAt.current = Date.now();
      setElapsed(0);
    } else {
      setGame(null);
      setError(describeError(res.error, t));
    }
  }, [client, difficulty]);

  /**
   * Typing begins the moment the text appears, and the clock is already running.
   *
   * An effect rather than a timer after the fetch: the box does not exist yet
   * when the response lands, so `setTimeout(…, 0)` was racing React's commit and
   * usually losing — the race would start with nothing focused and the timer
   * ticking. On a phone this is also what opens the keyboard.
   */
  useEffect(() => {
    if (game && !result) inputRef.current?.focus();
  }, [game, result]);

  // a running clock, for the racer — the score is timed server-side
  useEffect(() => {
    if (!game || result) return;
    const timer = setInterval(() => {
      if (startedAt.current) setElapsed(Date.now() - startedAt.current);
    }, 100);
    return () => clearInterval(timer);
  }, [game, result]);

  const finish = useCallback(async () => {
    if (!game) return;
    setBusy(true);
    const res = await client.post<RaceResult>(`/race/${game.id}/finish`, { typed });
    setBusy(false);
    if (res.ok) setResult(res.data);
    else setError(describeError(res.error, t));
  }, [client, game, typed]);

  // finishing the text ends the race on its own; nobody should have to notice
  // they are done and reach for a button
  useEffect(() => {
    if (game && !result && typed.length >= target.length && target.length > 0) void finish();
  }, [typed, target.length, game, result, finish]);

  const chars = useMemo(() => [...target], [target]);
  const typedChars = useMemo(() => [...typed], [typed]);
  const progress = chars.length === 0 ? 0 : Math.min(typedChars.length / chars.length, 1);

  /**
   * Keep the character you are on in view.
   *
   * A long text runs past the fold, and on a phone the keyboard takes half of
   * what is left — without this you end up typing at a line you cannot see.
   * `nearest` does nothing while the caret is already visible, so this is not a
   * scroll on every keystroke.
   */
  useEffect(() => {
    cursorRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [typed]);


  return (
    <div className="container container-narrow">
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label={t('games.back')}>
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">{t('nav.games')}</span>
          <h1 className="page-title">{t('games.race.name')}</h1>
        </div>
      </div>

      {!game && (
        <div className="race-lobby">
          <p className="page-sub">{t('games.race.intro')}</p>
          <div className="chat-tabs" role="tablist" aria-label={t('games.race.length')}>
            {DIFFICULTY.map((d) => (
              <button
                key={d.value}
                role="tab"
                aria-selected={difficulty === d.value}
                className={`chip${difficulty === d.value ? ' active' : ''}`}
                onClick={() => setDifficulty(d.value)}
              >
                {t(d.labelKey)}
              </button>
            ))}
          </div>
          <Button onClick={() => void start()} disabled={busy}>
            {busy ? t('games.starting') : t('games.race.start')}
          </Button>
          {error && <ErrorState message={error} onRetry={() => void start()} />}
        </div>
      )}

      {game && (
        <>
          <div className="race-stats">
            <span className="race-timer">{(elapsed / 1000).toFixed(1)}s</span>
            <div className="race-progress" aria-hidden>
              <div className="race-progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="muted">{game.text.title}</span>
          </div>

          {/*
            The text and the box you type in are the same thing.
            Two boxes meant the text sat there as ordinary selectable prose with
            an input underneath it — an invitation to select it, copy it and win
            the race with two keystrokes. There is nothing to select now: the
            characters colour themselves as you go, the caret is drawn on the
            character you are on, and the field that takes the keys is an
            invisible layer over the top.
          */}
          <div
            className={`race-type${focused ? ' is-focused' : ''}${result ? ' is-done' : ''}`}
            onPointerDown={() => inputRef.current?.focus()}
          >
            <p className="race-text" id="race-target">
              {chars.map((ch, i) => {
                const t = typedChars[i];
                const state = t === undefined ? '' : t === ch ? ' race-ok' : ' race-bad';
                const here = i === typedChars.length;
                return (
                  <span key={i} ref={here ? cursorRef : undefined} className={`race-char${state}${here ? ' race-cursor' : ''}`}>
                    {ch}
                  </span>
                );
              })}
            </p>

            <textarea
              ref={inputRef}
              className="race-capture"
              value={typed}
              disabled={!!result}
              onChange={(e) => setTyped([...e.target.value].slice(0, chars.length).join(''))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              {...typeOnly}
              aria-label={t('games.race.typeTheText')}
              aria-describedby="race-target"
            />

            {!focused && !result && <span className="race-tap">{t('games.race.tapToType')}</span>}
          </div>

          {notice && (
            <div className="wordle-notice" role="status">
              {notice}
            </div>
          )}

          {!result && (
            <div className="race-actions">
              <Button variant="ghost" onClick={() => void finish()} disabled={busy}>
                {busy ? t('games.race.scoring') : t('games.race.giveUp')}
              </Button>
            </div>
          )}

          {result && (
            <div className="race-result">
              <h2 className="section-heading">
                {result.implausible
                  ? t('games.race.notScored')
                  : result.perfect
                    ? t('games.race.perfect')
                    : t('games.race.finished')}
              </h2>
              {/*
                Said out loud rather than shown as a silent zero. Somebody who
                hits this has almost certainly found a way around the typing box,
                and a result that just reads 0 looks like the game is broken.
              */}
              {result.implausible && (
                <p className="race-refused">{t('games.race.refused')}</p>
              )}
              <div className="race-figures">
                <Figure value={result.wpm.toFixed(1)} label={t('games.race.wpm')} />
                <Figure value={`${Math.round(result.accuracy * 100)}%`} label={t('games.race.accuracy')} />
                <Figure value={(result.elapsedMs / 1000).toFixed(1) + 's'} label={t('games.race.time')} />
                <Figure value={`+${result.xpAwarded}`} label="XP" />
              </div>
              <Button onClick={() => void start()} disabled={busy}>
                {t('games.race.again')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <div className="race-figure">
      <span className="race-figure-value">{value}</span>
      <span className="race-figure-label">{label}</span>
    </div>
  );
}
