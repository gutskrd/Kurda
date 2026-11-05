import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CHARACTER_NAMES,
  MEMORY_ROUND_PASSAGES,
  dialectDirection,
  insertAtSelection,
  learnGame,
  meaningIn,
  memoryStudyLines,
  typingKeys,
  type GameDialect,
  type MemoryThiefCorrection,
  type MemoryThiefHint,
  type MemoryThiefItemView,
  type MemoryWhy,
} from '@kurda/shared';
import { Button } from '../components/Button';
import { CheckIcon } from '../components/icons';
import { KeyBar } from '../keyboard/KeyBar';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { prefersReducedMotion } from '../lib/motion';
import { Tile } from '../learn/Tile';
import { SoloGameShell, type SoloRound } from './SoloGameShell';
import { useAvailability, useGameDialect, useOpenRound } from './learnGames';
import './memory-thief.css';

/**
 * The Memory Thief (/app/games/memory-thief).
 *
 * The stage is a page on a desk. While the passage is studied a thin ribbon
 * along the page's top edge runs down with the time; then the thief comes:
 * the words that will vanish lift off the paper like wet ink, one after
 * another, and where they stood soft glowing gaps are left. The player gives
 * the words back — from tiles in a tray below the page (a gap is chosen, then
 * a word; a filled gap empties when tapped) or, at the advanced difficulty,
 * typed into numbered fields with the key bar — and the words appear in the
 * gaps as they are given.
 *
 * A wrong first try dims the gaps that are right and lets the wrong ones
 * glow again, emptied. Once a passage is done the words settle back into the
 * page in the reveal, each with what it means, and anything given wrongly
 * beside it.
 *
 * Soranî pages read right to left. Under reduced motion nothing lifts or
 * glows: the words are simply gone, and the gaps are plain.
 */

type Round = SoloRound<MemoryThiefItemView, MemoryThiefHint, MemoryThiefCorrection>;
type Phase = 'study' | 'vanish' | 'restore';

const TONE = learnGame('memory-thief').tone;

/** How long the ink takes to lift, and the stagger between one word and the next. */
const VANISH_MS = 900;
const VANISH_STEP_MS = 160;

const WHY_KEY: Record<MemoryWhy, MessageKey> = {
  glossary: 'games.memory.why.glossary',
  vocabulary: 'games.memory.why.vocabulary',
};

function MemoryBoard({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { item, result, busy, submit, state } = round;
  const script = dialectDirection(dialect);
  const typed = item.tiles === null;
  const lines = useMemo(() => memoryStudyLines(item.text, item.parts), [item.text, item.parts]);
  // an item already tried (a round come back to) starts with its gaps
  const [phase, setPhase] = useState<Phase>(state.attempts > 0 ? 'restore' : 'study');
  const [left, setLeft] = useState(item.studySeconds);
  const [given, setGiven] = useState<string[]>(() => Array.from({ length: item.gaps }, () => ''));
  // which tile fills which gap (tiles only), so a tile is used once and can go home
  const [used, setUsed] = useState<Array<number | null>>(() => Array.from({ length: item.gaps }, () => null));
  const [selected, setSelected] = useState(0);
  const [tried, setTried] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const fields = useRef<Array<HTMLInputElement | null>>([]);
  const gapButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const caret = useRef<{ gap: number; at: number } | null>(null);
  const done = result?.done === true;
  const locked = done || busy || phase !== 'restore';
  const wrong = useMemo(() => new Set(!done && result && !result.correct ? (result.hint?.wrong ?? []) : []), [done, result]);

  // a new passage starts with the study
  useEffect(() => {
    setPhase(state.attempts > 0 ? 'restore' : 'study');
    setLeft(item.studySeconds);
    setGiven(Array.from({ length: item.gaps }, () => ''));
    setUsed(Array.from({ length: item.gaps }, () => null));
    setSelected(0);
    setTried(null);
    // only when the passage changes, not when its tries do
  }, [item.index]);

  // the study runs down a second at a time; at nought the thief comes
  useEffect(() => {
    if (phase !== 'study') return;
    if (left <= 0) {
      setPhase('vanish');
      return;
    }
    const tick = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(tick);
  }, [phase, left]);

  // the ink lifts, then the gaps are there to fill
  useEffect(() => {
    if (phase !== 'vanish') return;
    setSaid(t('games.memory.vanished', { n: item.gaps }));
    const ms = prefersReducedMotion() ? 0 : VANISH_MS + VANISH_STEP_MS * Math.max(0, item.gaps - 1);
    const next = setTimeout(() => setPhase('restore'), ms);
    return () => clearTimeout(next);
  }, [phase, item.gaps, t]);

  // the first gap (or field) takes the focus when the gaps appear
  useEffect(() => {
    if (phase !== 'restore' || done) return;
    if (typed) fields.current[0]?.focus();
    else gapButtons.current[0]?.focus();
    // when the gaps appear, not on every try
  }, [phase]);

  // after a wrong try the wrong gaps are emptied for another go, the right ones kept
  useEffect(() => {
    if (!result || result.done || result.correct) return;
    const bad = result.hint?.wrong ?? [];
    setGiven((g) => g.map((w, i) => (bad.includes(i) ? '' : w)));
    setUsed((u) => u.map((tile, i) => (bad.includes(i) ? null : tile)));
    setSelected(bad[0] ?? 0);
  }, [result]);

  // put the caret after a letter the key bar added, once the field has it
  useEffect(() => {
    const at = caret.current;
    if (!at) return;
    caret.current = null;
    const el = fields.current[at.gap];
    el?.focus();
    el?.setSelectionRange(at.at, at.at);
  }, [given]);

  const nextEmpty = (from: number, g: readonly string[]): number => {
    for (let k = 1; k <= g.length; k++) {
      const i = (from + k) % g.length;
      if (g[i] === '') return i;
    }
    return from;
  };

  const pickTile = (tile: number): void => {
    if (locked || used.includes(tile)) return;
    const gap = selected;
    const word = item.tiles![tile]!;
    const nextUsed = used.map((u, i) => (i === gap ? tile : u));
    const nextGiven = given.map((w, i) => (i === gap ? word : w));
    setUsed(nextUsed);
    setGiven(nextGiven);
    setSelected(nextEmpty(gap, nextGiven));
    setSaid(t('games.memory.gapFilled', { n: gap + 1, word }));
  };

  const pressGap = (gap: number): void => {
    if (locked) return;
    if (typed) {
      fields.current[gap]?.focus();
      return;
    }
    if (given[gap] !== '') {
      setGiven(given.map((w, i) => (i === gap ? '' : w)));
      setUsed(used.map((u, i) => (i === gap ? null : u)));
      setSaid(t('games.memory.gapEmptied', { n: gap + 1 }));
    }
    setSelected(gap);
  };

  const type = (gap: number, text: string): void => setGiven((g) => g.map((w, i) => (i === gap ? text : w)));
  const insert = (letter: string): void => {
    const gap = selected;
    const el = fields.current[gap];
    const text = given[gap] ?? '';
    const at = el ? { start: el.selectionStart ?? text.length, end: el.selectionEnd ?? text.length } : { start: text.length, end: text.length };
    const next = insertAtSelection(text, at, letter);
    caret.current = { gap, at: next.caret };
    type(gap, next.text);
  };

  const complete = given.every((w) => w.trim() !== '');
  const unchanged = tried === JSON.stringify(given);
  const check = useCallback(() => {
    if (locked || !complete || unchanged) return;
    setTried(JSON.stringify(given));
    void submit({ gaps: given.map((w) => w.trim()) });
  }, [locked, complete, unchanged, given, submit]);

  const correction = done ? result?.correction : null;
  const words = correction?.words ?? null;

  // `key` is the piece's place: a word that vanished from two places is the same gap twice
  const gap = (n: number, word: string, key: string): React.JSX.Element => {
    if (phase !== 'restore') {
      return (
        <span key={key} className="mt-word" style={{ ['--ink-i' as string]: n }}>
          {word}
        </span>
      );
    }
    const back = words?.[n];
    const shown = back ? back.term : given[n];
    const look = back ? back.verdict : wrong.has(n) ? 'again' : result && !result.correct && !done ? 'kept' : given[n] ? 'filled' : 'empty';
    const label = shown ? t('games.memory.gapFilled', { n: n + 1, word: shown }) : t('games.memory.gapEmpty', { n: n + 1 });
    return (
      <button
        key={key}
        type="button"
        ref={(el) => {
          if (el) gapButtons.current[n] ??= el;
        }}
        style={{ ['--ink-i' as string]: n }}
        className={`mt-gap is-${look}${!done && selected === n && !typed ? ' is-selected' : ''}`}
        onClick={() => pressGap(n)}
        disabled={done}
        aria-pressed={!typed && !done ? selected === n : undefined}
        aria-label={label}
      >
        <span className="mt-gap-n" aria-hidden>
          {n + 1}
        </span>
        <span className="mt-gap-word" aria-hidden>
          {shown || ' '}
        </span>
      </button>
    );
  };

  // filled again as the gaps render (the first place each gap stands)
  gapButtons.current = [];
  return (
    <div className={`mt-board lp-tone-${TONE}`}>
      <div className={`mt-desk is-${phase}${done ? ' is-revealed' : ''}`}>
        <article className="mt-page" aria-label={t('games.memory.page')} lang={script.lang} dir={script.dir}>
          {phase === 'study' && (
            <div
              className="mt-ribbon"
              role="timer"
              aria-label={t('games.memory.timeLeft', { n: left })}
              style={{ ['--study-ms' as string]: `${item.studySeconds * 1000}ms` }}
            />
          )}
          <p className="mt-kicker" lang={locale} dir="auto">
            {t(item.kind === 'conversation' ? 'games.memory.kind.conversation' : 'games.memory.kind.story')}
          </p>
          {item.title && <h2 className="mt-title">{item.title}</h2>}
          {lines.map((pieces, li) => {
            const speaker = item.speakers[li] ?? null;
            return (
              <p key={li} className={`mt-line${speaker ? ' is-spoken' : ''}`}>
                {speaker && (
                  <span className="mt-speaker" lang="ku" dir="ltr">
                    {CHARACTER_NAMES[speaker]}
                  </span>
                )}
                {pieces.map((p, pi) => ('gap' in p ? gap(p.gap, p.word, `${li}-${pi}`) : <span key={`${li}-${pi}`}>{p.text}</span>))}
              </p>
            );
          })}
        </article>
      </div>

      <p className="sr-only" aria-live="polite">
        {said}
      </p>

      {phase === 'study' && (
        <div className="mt-study">
          <p className="mt-study-time" aria-hidden>
            {t('games.memory.timeLeft', { n: left })}
          </p>
          <Button onClick={() => setPhase('vanish')}>{t('games.memory.ready')}</Button>
        </div>
      )}

      {phase === 'vanish' && <p className="mt-study-time">{t('games.memory.vanishing')}</p>}

      {phase === 'restore' && !done && (
        <>
          {wrong.size > 0 && <p className="mt-hint">{t('games.memory.hint')}</p>}
          {typed ? (
            <div className="mt-fields">
              <p className="solo-muted">{t('games.memory.typeHint')}</p>
              {given.map((w, i) => (
                <label key={i} className={`mt-field${wrong.has(i) ? ' is-again' : ''}`}>
                  <span className="mt-field-n">{t('games.memory.gapLabel', { n: i + 1 })}</span>
                  <input
                    ref={(el) => {
                      fields.current[i] = el;
                    }}
                    className="input"
                    value={w}
                    onChange={(e) => type(i, e.target.value)}
                    onFocus={() => setSelected(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (complete) check();
                        else fields.current[nextEmpty(i, given)]?.focus();
                      }
                    }}
                    disabled={busy}
                    lang={script.lang}
                    dir={script.dir}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </label>
              ))}
              <KeyBar keys={typingKeys(dialect)} onKey={insert} disabled={busy} lang={script.lang} dir={script.dir} />
            </div>
          ) : (
            <div className="mt-tray" role="group" aria-label={t('games.memory.tiles')} lang={script.lang} dir={script.dir}>
              {item.tiles!.map((word, i) =>
                used.includes(i) ? (
                  <span key={i} className="tile-ghost mt-ghost" aria-hidden="true">
                    {word}
                  </span>
                ) : (
                  <Tile key={i} className="mt-tile" disabled={locked} onClick={() => pickTile(i)}>
                    {word}
                  </Tile>
                ),
              )}
            </div>
          )}
          <div className="mt-actions">
            <Button onClick={check} disabled={locked || !complete || unchanged}>
              {result && !result.correct ? t('games.solo.tryAgain') : t('games.solo.check')}
            </Button>
            {!typed && <p className="mt-keys solo-muted">{t('games.memory.tilesHint')}</p>}
          </div>
        </>
      )}

      {words && (
        <section className="mt-reveal" aria-labelledby={`mt-reveal-${item.index}`}>
          <h3 id={`mt-reveal-${item.index}`} className="mt-reveal-title">
            {t('games.memory.reveal')}
          </h3>
          <ol className="mt-words">
            {words.map((w) => {
              const meaning = meaningIn(w.meanings, locale);
              return (
                <li key={w.gap} className={`mt-reveal-word is-${w.verdict}`}>
                  <span className="mt-reveal-n" aria-hidden>
                    {w.gap + 1}
                  </span>
                  <span className="mt-reveal-term" lang={script.lang} dir={script.dir}>
                    {w.term}
                  </span>
                  <span className="mt-reveal-meaning" lang={locale} dir="auto">
                    {meaning ?? t('games.memory.noMeaning')}
                  </span>
                  {w.verdict === 'right' && (
                    <span className="mt-reveal-mark">
                      <CheckIcon size={16} />
                      <span className="sr-only">{t('games.solo.right')}</span>
                    </span>
                  )}
                  {w.verdict === 'typo' && <span className="mt-reveal-note">{t('games.memory.typo')}</span>}
                  {w.verdict === 'wrong' && w.given && (
                    <span className="mt-reveal-note">
                      {t('games.memory.youGave')}{' '}
                      <span lang={script.lang} dir={script.dir}>
                        {w.given}
                      </span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

/** The game in three steps, for the intro: study, the words vanish, give them back. */
function MemorySteps(): React.JSX.Element {
  const t = useT();
  return (
    <ol className={`mt-steps lp-tone-${TONE}`}>
      {(['games.memory.step.study', 'games.memory.step.vanish', 'games.memory.step.restore'] as const).map((key, i) => (
        <li key={key} className="mt-step">
          <span className="mt-step-n" aria-hidden>
            {i + 1}
          </span>
          {t(key)}
        </li>
      ))}
    </ol>
  );
}

export function MemoryThief(): React.JSX.Element {
  const t = useT();
  const dialect = useGameDialect();
  const availability = useAvailability(dialect);
  const open = useOpenRound('memory-thief', dialect);
  const game = availability?.games.find((g) => g.id === 'memory-thief');
  const difficulties = availability ? (game?.difficulties ?? []) : null;
  return (
    <div className="container solo-page">
      <SoloGameShell<MemoryThiefItemView, MemoryThiefHint, MemoryThiefCorrection>
        game="memory-thief"
        dialect={dialect}
        title={t('games.memory.name')}
        blurb={t('games.memory.intro')}
        intro={<MemorySteps />}
        difficulties={difficulties}
        open={open}
        roundItems={MEMORY_ROUND_PASSAGES}
        renderRound={(round) => <MemoryBoard round={round} dialect={dialect} />}
        explain={(why) => (why in WHY_KEY ? t(WHY_KEY[why as MemoryWhy]) : null)}
      />
    </div>
  );
}
