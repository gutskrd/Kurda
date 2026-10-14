import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BACKTICK_WAIT_MS,
  compareTyping,
  displayTarget,
  specialKeys,
  type AccentMode,
  type RaceGameView,
  type RaceLength,
  type RaceResultView,
  type TypingDialect,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ArrowIcon, GearIcon } from '../components/icons';
import { useTypeOnly } from '../components/typeOnly';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { KeyBar } from '../keyboard/KeyBar';
import { KeyboardGuide } from '../keyboard/KeyboardGuide';
import { KeyboardSettings } from '../keyboard/KeyboardSettings';
import { guideNudgeDue } from '../keyboard/guide';
import { getKeyboardPrefs, useKeyboardPrefs } from '../keyboard/prefs';
import { RaceText } from '../race/RaceText';
import { capTyping } from '../race/input';
import { useRaceCapture } from '../race/useRaceCapture';
import { reportGameFinished, reportGameStarted } from '../feedback/gameFinished';

/**
 * Typing race: reproduce a Kurdish text as fast and as accurately as you can.
 *
 * The clock shown here is for the racer's benefit only. The score comes from
 * the server, which timed the race from when it handed the text over — so what
 * this page displays can never be what counts.
 *
 * What is typed is read the way the server scores it (@kurda/shared
 * `compareTyping`): normalised, aligned word by word so a missed letter spoils
 * only its own word, in the accent mode the race was started in. The field
 * only ever takes typing at its end (race/useRaceCapture) — a click, an arrow
 * key or select-all can no longer put the next letter in the middle.
 */

const LENGTHS: Array<{ value: RaceLength; labelKey: MessageKey }> = [
  { value: 1, labelKey: 'games.race.short' },
  { value: 2, labelKey: 'games.race.medium' },
  { value: 3, labelKey: 'games.race.long' },
];

const DIALECTS: Array<{ value: TypingDialect; labelKey: MessageKey }> = [
  { value: 'kurmanci', labelKey: 'games.race.kurmanci' },
  { value: 'sorani', labelKey: 'games.race.sorani' },
];

const MODE_LABEL: Record<AccentMode, MessageKey> = {
  strict: 'keyboard.accent.strict',
  forgiving: 'keyboard.accent.forgiving',
  hidden: 'keyboard.accent.hidden',
};

/** A refusal from the server, in the racer's language. */
function raceError(err: ApiError, t: (key: MessageKey) => string): string {
  switch (err.code) {
    case 'EMPTY_RACE_POOL':
      return t('games.race.emptyPool');
    case 'ALREADY_FINISHED':
      return t('games.race.alreadyOver');
    default:
      return describeError(err, t);
  }
}

export function Race(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const { locale } = useI18n();
  const [prefs, setPrefs] = useKeyboardPrefs();
  const ids = useId();

  // the variety the last race was in; a Soranî interface starts in Soranî
  const [dialect, setDialect] = useState<TypingDialect>(
    () => prefs.raceDialect ?? (locale === 'ckb' ? 'sorani' : 'kurmanci'),
  );
  const [length, setLength] = useState<RaceLength>(1);
  const [game, setGame] = useState<RaceGameView | null>(null);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<RaceResultView | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  // a finish that failed; `closed` when the server has already ended that race
  const [finishError, setFinishError] = useState<{ message: string; closed: boolean } | null>(null);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [focused, setFocused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // the keyboard guide as a dialog; `thenStart` when it stands before a first race
  const [guide, setGuide] = useState<{ thenStart: boolean } | null>(null);
  const [nudgeHidden, setNudgeHidden] = useState(false);
  // the guide stood before this very race: its result does not offer it again
  const [guided, setGuided] = useState(false);
  // the text to copy is on this very screen, so the box takes keystrokes only
  const { handlers: typeOnly, notice, refuse: refusePaste } = useTypeOnly(t('games.race.noPasting'));
  const startedAt = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  // one finish at a time, whichever of the ways to finish gets there first
  const finishingRef = useRef(false);
  const startingRef = useRef(false);

  const raceDialect = game?.dialect ?? dialect;
  const sorani = raceDialect === 'sorani';
  const target = game?.text.body ?? '';
  const shown = useMemo(
    () => (game ? displayTarget(game.text.body, game.accentMode, game.dialect) : ''),
    [game],
  );
  const total = useMemo(() => [...shown].length, [shown]);

  const comparison = useMemo(
    () =>
      game
        ? compareTyping(target, typed, game.accentMode, { dialect: game.dialect, backtickShortcut: prefs.backtick })
        : null,
    [game, target, typed, prefs.backtick],
  );

  const begin = useCallback(async (afterGuide = false) => {
    if (startingRef.current) return;
    startingRef.current = true;
    reportGameStarted();
    // a new race starts from nothing: the old text is gone before the new one
    // is asked for, so nothing typed in between lands in either
    setStarting(true);
    setGame(null);
    setResult(null);
    setTyped('');
    setStartError(null);
    setFinishError(null);
    setNudgeHidden(false);
    setGuided(afterGuide);
    setElapsed(0);
    startedAt.current = null;
    finishingRef.current = false;
    // read at the moment of asking: "Make accents forgiving" in the guide
    // changes it in the same click that starts the race
    const { accentMode } = getKeyboardPrefs();
    const res = await client.post<RaceGameView>('/race', { length, dialect, accentMode });
    startingRef.current = false;
    setStarting(false);
    if (res.ok) {
      setGame(res.data);
      startedAt.current = Date.now();
    } else {
      setStartError(raceError(res.error, t));
    }
  }, [client, length, dialect, t]);

  const start = useCallback(() => {
    setPrefs({ raceDialect: dialect });
    // the first Kurmancî race on this device begins with the keyboard guide,
    // and closing it starts the race
    if (dialect === 'kurmanci' && !prefs.guideOffered) {
      setPrefs({ guideOffered: true });
      setGuide({ thenStart: true });
      return;
    }
    void begin();
  }, [begin, dialect, prefs.guideOffered, setPrefs]);

  const closeGuide = useCallback(() => {
    const thenStart = guide?.thenStart ?? false;
    setGuide(null);
    if (thenStart) void begin(true);
  }, [guide, begin]);

  const finish = useCallback(
    async (gaveUp: boolean) => {
      if (!game || finishingRef.current) return;
      finishingRef.current = true;
      setFinishing(true);
      setFinishError(null);
      const res = await client.post<RaceResultView>(`/race/${game.id}/finish`, { typed });
      setFinishing(false);
      if (res.ok) {
        setResult(res.data);
        // a run the server would not score is no happy ending either; and a
        // result that offers the keyboard guide asks enough for one race
        reportGameFinished({
          game: 'race',
          gaveUp: gaveUp || res.data.implausible,
          deferred: guideNudgeDue(res.data, {
            guidedThisRace: guided,
            dismissedAt: getKeyboardPrefs().guideNudgeDismissedAt,
          }),
        });
        return;
      }
      // a race the server has already closed cannot be finished again; any
      // other failure can be tried again from the same typing
      const closed = res.error.code === 'ALREADY_FINISHED';
      setFinishError({ message: raceError(res.error, t), closed });
      finishingRef.current = closed;
    },
    [client, game, typed, t, guided],
  );

  const { composing } = useRaceCapture({
    field: inputRef,
    round: game?.id ?? null,
    value: typed,
    onChange: (next) => setTyped(capTyping(next, total)),
    onPaste: refusePaste,
    backtick: prefs.backtick,
  });

  /**
   * Typing begins the moment the text appears, and the clock is already running.
   *
   * An effect rather than a timer after the fetch: the box does not exist yet
   * when the response lands. On a phone this is also what opens the keyboard.
   */
  useEffect(() => {
    if (game && !result) inputRef.current?.focus();
  }, [game, result]);

  /*
   * The result takes the focus from the field, which is read-only now: a
   * screen reader hears the heading (and, reading on, the figures) instead of
   * silence, and on a phone the soft keyboard goes down off the results.
   */
  useEffect(() => {
    if (!result) return;
    inputRef.current?.blur();
    resultHeadingRef.current?.focus();
  }, [result]);

  // a running clock, for the racer — the score is timed server-side
  useEffect(() => {
    if (!game || result) return;
    const timer = setInterval(() => {
      if (startedAt.current) setElapsed(Date.now() - startedAt.current);
    }, 100);
    return () => clearInterval(timer);
  }, [game, result]);

  /*
   * Reaching the end of the text ends the race on its own — but never on half
   * a letter: not while an input method is still composing one (a dead key
   * waiting for its vowel), and not straight after the e of a final ê that a
   * backtick may still finish, which waits a moment first. After a failed
   * finish it waits for "Try again", rather than trying on every key.
   */
  useEffect(() => {
    if (!game || result || finishing || composing || finishError || !comparison) return;
    if (comparison.done) {
      void finish(false);
      return;
    }
    if (comparison.awaitingBacktick && comparison.caret >= total) {
      const timer = setTimeout(() => void finish(false), BACKTICK_WAIT_MS);
      return () => clearTimeout(timer);
    }
  }, [comparison, game, result, finishing, composing, finishError, finish, total]);

  const typeKey = useCallback(
    (letter: string) => {
      setTyped((prev) => capTyping(prev + letter, total));
      // a key reached with Tab hands the focus back, so typing carries on
      if (document.activeElement !== inputRef.current) inputRef.current?.focus();
    },
    [total],
  );

  const progress = total === 0 ? 0 : Math.min((comparison?.caret ?? 0) / total, 1);
  const shownChars = useMemo(() => [...shown], [shown]);
  const nextChar = shownChars[comparison?.caret ?? 0] ?? '';
  const upper = !sorani && nextChar !== nextChar.toLowerCase();
  const showKeyBar = prefs.keyBar && !(game?.accentMode === 'hidden' && !sorani);
  const running = game !== null && result === null;

  const showNudge =
    result !== null &&
    !nudgeHidden &&
    guideNudgeDue(result, { guidedThisRace: guided, dismissedAt: prefs.guideNudgeDismissedAt });

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
        {!running && (
          <button
            type="button"
            className="btn btn-ghost btn-sm race-settings-toggle"
            aria-expanded={settingsOpen}
            aria-controls={`${ids}-settings`}
            onClick={() => setSettingsOpen((o) => !o)}
          >
            <GearIcon size={18} />
            <span className="race-settings-label">{t('keyboard.settings.title')}</span>
          </button>
        )}
      </div>

      {!running && settingsOpen && (
        <section className="card race-settings" id={`${ids}-settings`} aria-label={t('keyboard.settings.title')}>
          <KeyboardSettings context="race" onHelp={() => setGuide({ thenStart: false })} />
        </section>
      )}

      {!game && (
        <div className="race-lobby">
          <p className="page-sub">{t('games.race.intro')}</p>
          <div className="race-choice">
            <span className="race-choice-label" id={`${ids}-dialect`}>
              {t('games.race.textIn')}
            </span>
            <div className="chat-tabs" role="radiogroup" aria-labelledby={`${ids}-dialect`}>
              {DIALECTS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  role="radio"
                  aria-checked={dialect === d.value}
                  className={`chip${dialect === d.value ? ' active' : ''}`}
                  onClick={() => setDialect(d.value)}
                >
                  {t(d.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div className="race-choice">
            <span className="race-choice-label" id={`${ids}-length`}>
              {t('games.race.length')}
            </span>
            <div className="chat-tabs" role="radiogroup" aria-labelledby={`${ids}-length`}>
              {LENGTHS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  role="radio"
                  aria-checked={length === d.value}
                  className={`chip${length === d.value ? ' active' : ''}`}
                  onClick={() => setLength(d.value)}
                >
                  {t(d.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <p className="field-hint race-mode-note">
            {t('games.race.modeNote', { mode: t(MODE_LABEL[prefs.accentMode]) })}
          </p>
          <Button onClick={start} disabled={starting} aria-busy={starting}>
            {starting ? t('games.starting') : t('games.race.start')}
          </Button>
          {startError && (
            <div className="msg msg-error race-error" role="alert">
              {startError}
            </div>
          )}
        </div>
      )}

      {game && (
        <>
          <div className="race-stats">
            <span className="race-timer">{(elapsed / 1000).toFixed(1)}s</span>
            <div
              className="race-progress"
              role="progressbar"
              aria-label={t('games.race.progress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <div className="race-progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="muted race-title" lang={sorani ? 'ckb' : 'ku'} dir={sorani ? 'rtl' : 'ltr'}>
              {game.text.title}
            </span>
          </div>

          {showKeyBar && running && (
            <KeyBar
              keys={specialKeys(game.dialect)}
              onKey={typeKey}
              disabled={finishing}
              upper={upper}
              lang={sorani ? 'ckb' : 'ku'}
              dir={sorani ? 'rtl' : 'ltr'}
            />
          )}

          {/*
            The text and the box you type in are the same thing: the
            characters colour themselves as you go, the caret is drawn on the
            character you are on, and the field that takes the keys is an
            invisible layer over the top whose own caret is kept at its end.
          */}
          <div
            className={`race-type${focused ? ' is-focused' : ''}${result ? ' is-done' : ''}`}
            onPointerDown={() => inputRef.current?.focus()}
          >
            <RaceText
              id="race-target"
              text={shown}
              comparison={comparison}
              rtl={sorani}
              lang={sorani ? 'ckb' : 'ku'}
              finished={result !== null}
            />

            <textarea
              key={game.id}
              ref={inputRef}
              className="race-capture"
              value={typed}
              readOnly={result !== null}
              onChange={(e) => setTyped(capTyping(e.target.value, total))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              {...typeOnly}
              lang={sorani ? 'ckb' : 'ku'}
              dir={sorani ? 'rtl' : 'ltr'}
              aria-label={t('games.race.typeTheText')}
              aria-describedby="race-target"
            />

            {!focused && running && <span className="race-tap">{t('games.race.tapToType')}</span>}
          </div>

          {notice && (
            <div className="wordle-notice" role="status">
              {notice}
            </div>
          )}

          {finishError && (
            <div className="msg msg-error race-error" role="alert">
              <span>{finishError.message}</span>
              {finishError.closed ? (
                <Button size="sm" variant="secondary" onClick={() => void begin()} disabled={starting}>
                  {t('games.race.newRace')}
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => void finish(false)} disabled={finishing}>
                  {t('common.retry')}
                </Button>
              )}
            </div>
          )}

          {running && (
            <div className="race-actions">
              <Button variant="ghost" onClick={() => void finish(true)} disabled={finishing} aria-busy={finishing}>
                {finishing ? t('games.race.scoring') : t('games.race.giveUp')}
              </Button>
            </div>
          )}

          {result && (
            <div className="race-result">
              <div className="race-result-head">
                <h2 className="section-heading race-result-title" tabIndex={-1} ref={resultHeadingRef}>
                  {result.implausible
                    ? t('games.race.notScored')
                    : result.perfect
                      ? t('games.race.perfect')
                      : t('games.race.finished')}
                </h2>
                {result.personalBest && !result.implausible && (
                  <span className="race-badge">{t('games.race.personalBest')}</span>
                )}
              </div>
              {/*
                Said out loud rather than shown as a silent zero. Somebody who
                hits this has almost certainly found a way around the typing box,
                and a result that just reads 0 looks like the game is broken.
              */}
              {result.implausible && <p className="race-refused">{t('games.race.refused')}</p>}
              <div className="race-figures">
                <Figure value={result.wpm.toFixed(1)} label={t('games.race.wpm')} />
                <Figure value={`${Math.round(result.accuracy * 100)}%`} label={t('games.race.accuracy')} />
                <Figure value={(result.elapsedMs / 1000).toFixed(1) + 's'} label={t('games.race.time')} />
                <Figure value={`+${result.xpAwarded}`} label="XP" />
              </div>
              {result.accentMode !== 'hidden' && result.accented > 0 && (
                <p className="race-accents">
                  {t('games.race.accents', { right: result.accented - result.accentMisses, total: result.accented })}
                  <span className="race-mode-tag">{t(MODE_LABEL[result.accentMode])}</span>
                </p>
              )}

              <div className="race-result-actions">
                <Button onClick={() => void begin()} disabled={starting} aria-busy={starting}>
                  {starting ? t('games.starting') : t('games.race.again')}
                </Button>
                {!showNudge && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGuide({ thenStart: false })}>
                    {t('keyboard.help')}
                  </button>
                )}
              </div>

              {/* after the result and "Race again", so neither waits behind it */}
              {showNudge && (
                <div className="race-nudge">
                  <KeyboardGuide
                    dialect={game.dialect}
                    headingLevel={3}
                    quietClose
                    closeLabel={t('games.race.nudgeLater')}
                    onClose={() => {
                      setNudgeHidden(true);
                      setPrefs({ guideNudgeDismissedAt: Date.now() });
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/*
        Escape, the backdrop and the X only close it: somebody backing out of
        the guide has not asked for the clock to start. Its own buttons
        ("Start race", the two ways out) are what go on into the race.
      */}
      <Modal
        open={guide !== null}
        onClose={() => setGuide(null)}
        label={sorani ? t('keyboard.guide.titleSorani') : t('keyboard.guide.title')}
      >
        <KeyboardGuide
          dialect={raceDialect}
          onClose={closeGuide}
          closeLabel={guide?.thenStart ? t('games.race.start') : undefined}
        />
      </Modal>
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
