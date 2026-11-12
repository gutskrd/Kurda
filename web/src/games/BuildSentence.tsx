import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  DIFFICULTY_RUNGS,
  GAME_DIFFICULTIES,
  dialectDirection,
  learnGame,
  meaningIn,
  rungAt,
  type GameDialect,
  type GameDifficulty,
  type SentenceCorrection,
  type SentenceHint,
  type SentenceItemView,
  type SentenceLadderView,
  type SentenceRung,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { LockIcon } from '../components/icons';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { prefersReducedMotion } from '../lib/motion';
import { Tile } from '../learn/Tile';
import { SoloGameShell, type SoloRound } from './SoloGameShell';
import { useAvailability, useGameDialect } from './soloRounds';

/**
 * Build a Kurdish Sentence (/app/learn/practice/build-sentence), an exercise
 * of the lessons' practice. It is a round of the solo kit like the games
 * played alone, which is why it lives beside them; Learn's Lessons half is
 * where a learner finds it (learn/practiceTools.tsx).
 *
 * The stage: the meaning on a card, a ruled line the sentence is laid on,
 * and a tray of word tiles under it — the sentence's own words and a few that
 * are not. A tile lifts off the tray under the finger and snaps onto the end
 * of the line; one tapped on the line flies home to its place in the tray,
 * which keeps a ghost of it so nothing shuffles. When the line is right it
 * settles: the tiles close up and the rule fills with the exercise's colour.
 *
 * A wrong first try marks the first word out of place on the player's own
 * line and leaves the rest to them; once an item is done the sentence is laid
 * out the right way round, every word with what it means where the approved
 * lessons and stories say so. Before a round, the ladder: six rungs from
 * short sentences to two clauses, the ones opened, and where the learner is.
 *
 * Soranî reads right to left, the line filling from the right. Under reduced
 * motion nothing travels or bounces: a tile that moved fades in where it lands.
 */

type Round = SoloRound<SentenceItemView, SentenceHint, SentenceCorrection>;

/** The exercise's colour, from the registry: one of the path's tones. */
const TONE = learnGame('build-sentence').tone;

export const RUNG_KEY: Record<SentenceRung, MessageKey> = {
  short: 'games.sentence.rung.short',
  question: 'games.sentence.rung.question',
  negation: 'games.sentence.rung.negation',
  ezafe: 'games.sentence.rung.ezafe',
  'verb-final': 'games.sentence.rung.verb-final',
  'two-clauses': 'games.sentence.rung.two-clauses',
};

const WHY_KEY: Record<SentenceRung, MessageKey> = {
  short: 'games.sentence.why.short',
  question: 'games.sentence.why.question',
  negation: 'games.sentence.why.negation',
  ezafe: 'games.sentence.why.ezafe',
  'verb-final': 'games.sentence.why.verb-final',
  'two-clauses': 'games.sentence.why.two-clauses',
};

/** The difficulty whose rungs hold the learner's own rung. */
export function difficultyForStep(step: number): GameDifficulty {
  const rung = rungAt(step);
  return GAME_DIFFICULTIES.find((d) => DIFFICULTY_RUNGS[d].includes(rung)) ?? 'beginner';
}

/** How long a tile takes to fly to the line or home, and the overshoot it snaps in with. */
const FLY_MS = 300;
const SNAP_EASE = 'cubic-bezier(0.34, 1.4, 0.64, 1)';

/**
 * Each tile from where it was to where it is now (first, last, invert, play):
 * the one that moved flies and snaps in with a hair of overshoot, the others
 * close up behind it. Under reduced motion only the one that moved fades in.
 */
function flyAndSnap(tiles: ReadonlyMap<number, HTMLElement>, was: ReadonlyMap<number, DOMRect>, moved: number): void {
  const still = prefersReducedMotion();
  tiles.forEach((el, i) => {
    const from = was.get(i);
    if (!from || typeof el.animate !== 'function') return;
    el.getAnimations?.().forEach((a) => a.cancel());
    if (still) {
      if (i === moved) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
      return;
    }
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const lifted = i === moved ? ' scale(1.06)' : '';
    el.animate([{ transform: `translate(${dx}px, ${dy}px)${lifted}` }, { transform: 'translate(0, 0)' }], {
      duration: FLY_MS,
      easing: i === moved ? SNAP_EASE : 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
  });
}

function SentenceBoard({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { item, result, busy, submit } = round;
  const script = dialectDirection(dialect);
  const [placed, setPlaced] = useState<number[]>([]);
  const [marked, setMarked] = useState<number | null>(null);
  // the line last sent: the same line again would spend the second try on what was already wrong
  const [tried, setTried] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const tiles = useRef(new Map<number, HTMLButtonElement>());
  const before = useRef<{ rects: Map<number, DOMRect>; moved: number } | null>(null);
  const done = result?.done === true;
  const locked = done || busy;

  // a new sentence starts with an empty line
  useEffect(() => {
    setPlaced([]);
    setMarked(null);
    setTried(null);
  }, [item.index]);

  // what came back marks the line: the first word astray after a wrong try, the same once the item is spent
  useEffect(() => {
    if (!result || result.correct) setMarked(null);
    else setMarked(result.done ? (result.correction?.firstWrong ?? null) : (result.hint?.firstWrong ?? null));
  }, [result]);

  const move = (next: number[], i: number, added: boolean): void => {
    before.current = { rects: new Map([...tiles.current].map(([k, el]) => [k, el.getBoundingClientRect()])), moved: i };
    setPlaced(next);
    setMarked(null);
    setSaid(t(added ? 'lesson.tiles.added' : 'lesson.tiles.removed', { word: item.tiles[i] ?? '' }));
  };
  const place = (i: number): void => {
    if (!locked && !placed.includes(i)) move([...placed, i], i, true);
  };
  const lift = (i: number): void => {
    if (!locked && placed.includes(i)) move(placed.filter((p) => p !== i), i, false);
  };
  const unchanged = tried === placed.join(',');
  const check = useCallback(() => {
    if (locked || placed.length === 0 || unchanged) return;
    setTried(placed.join(','));
    void submit({ order: placed });
  }, [locked, placed, submit, unchanged]);

  useLayoutEffect(() => {
    const was = before.current;
    before.current = null;
    if (was) flyAndSnap(tiles.current, was.rects, was.moved);
  }, [placed]);

  // the keys read the line as it is now, not as it was when the listener was set
  const keys = useRef({ place, lift, placed, check });
  keys.current = { place, lift, placed, check };
  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      const now = keys.current;
      const n = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1];
      if (n && !e.shiftKey) {
        const i = Number(n) - 1;
        if (i >= item.tiles.length) return;
        e.preventDefault();
        if (now.placed.includes(i)) now.lift(i);
        else now.place(i);
      } else if (e.key === 'Backspace') {
        const lastTile = now.placed.at(-1);
        if (lastTile === undefined) return;
        e.preventDefault();
        now.lift(lastTile);
      } else if (e.key === 'Enter' && (e.target as HTMLElement | null)?.tagName !== 'BUTTON') {
        e.preventDefault();
        now.check();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, item.tiles.length]);

  const hold = (i: number) => (el: HTMLButtonElement | null) => {
    if (el) tiles.current.set(i, el);
    else tiles.current.delete(i);
  };

  const meaning = meaningIn(item.meaning, locale) ?? item.meaning.en;
  const correction = done ? result?.correction : null;
  const lineState = result?.correct ? 'right' : done ? 'wrong' : 'idle';
  const hint = !done && marked !== null ? (marked >= placed.length ? t('games.sentence.hintMissing') : t('games.sentence.hint')) : null;

  return (
    <div className={`bs-board lp-tone-${TONE}`}>
      <div className="bs-meaning">
        <span className="bs-kicker">
          {t('games.sentence.prompt')} · {t(RUNG_KEY[item.rung])}
        </span>
        <p className="bs-meaning-text">{meaning}</p>
      </div>

      <p className="sr-only" aria-live="polite">
        {said}
      </p>

      <div
        className={`bs-line${result?.correct ? ' is-settled' : ''}${done && !result?.correct ? ' is-spent' : ''}`}
        role="group"
        aria-label={t('games.sentence.line')}
        lang={script.lang}
        dir={script.dir}
      >
        {placed.map((i, at) => {
          const astray = marked === at;
          return (
            <Tile
              key={i}
              ref={hold(i)}
              className={`bs-tile${astray ? ' is-astray' : ''}`}
              state={lineState === 'idle' ? (astray ? 'wrong' : 'idle') : lineState === 'right' ? 'right' : astray ? 'wrong' : 'dim'}
              disabled={locked}
              onClick={() => lift(i)}
              aria-label={astray ? `${item.tiles[i]}, ${t('games.sentence.misplaced')}` : undefined}
              style={{ ['--settle-i' as string]: at }}
            >
              {item.tiles[i]}
            </Tile>
          );
        })}
        {!done && marked !== null && marked >= placed.length && <span className="bs-gap-mark" aria-hidden />}
      </div>
      {hint && <p className="bs-hint">{hint}</p>}

      {correction ? (
        <ol className="bs-answer" lang={script.lang} dir={script.dir} aria-label={t('games.solo.answerWas')}>
          {correction.words.map((w, i) => {
            const m = meaningIn(w.meanings, locale);
            return (
              <li key={i} className="bs-gloss">
                <span className="bs-gloss-word">{w.word}</span>
                <span className="bs-gloss-meaning" lang={locale} dir="auto">
                  {m ?? <span aria-label={t('games.sentence.noGloss')}>—</span>}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="bs-tray" role="group" aria-label={t('games.sentence.tray')} lang={script.lang} dir={script.dir}>
          {item.tiles.map((word, i) =>
            placed.includes(i) ? (
              <span key={i} className="tile-ghost bs-ghost" aria-hidden="true">
                {word}
              </span>
            ) : (
              <Tile key={i} ref={hold(i)} className="bs-tile bs-tile--tray" disabled={locked} onClick={() => place(i)}>
                {word}
              </Tile>
            ),
          )}
        </div>
      )}

      {!done && (
        <div className="bs-actions">
          <Button onClick={check} disabled={locked || placed.length === 0 || unchanged}>
            {result && !result.correct ? t('games.solo.tryAgain') : t('games.solo.check')}
          </Button>
          <p className="bs-keys" aria-hidden>
            {t('games.sentence.keys', { n: Math.min(9, item.tiles.length) })}
          </p>
        </div>
      )}
    </div>
  );
}

/** The ladder as a path: six rungs bottom to top, the opened ones in colour, the learner's own marked. */
export function SentenceLadder({ ladder }: { ladder: SentenceLadderView }): React.JSX.Element {
  const t = useT();
  return (
    <section className={`bs-ladder lp-tone-${TONE}`} aria-labelledby="bs-ladder-title">
      <h2 id="bs-ladder-title" className="bs-ladder-title">
        {t('games.sentence.ladder')}
      </h2>
      <ol className="bs-rungs">
        {ladder.rungs.map((r, i) => {
          const here = i + 1 === ladder.step;
          return (
            <li key={r.rung} className={`bs-rung${r.open ? ' is-open' : ' is-locked'}${here ? ' is-here' : ''}`} aria-current={here ? 'step' : undefined}>
              <span className="bs-rung-step" aria-hidden>
                {r.open ? i + 1 : <LockIcon size={14} />}
              </span>
              <span className="bs-rung-text">
                <span className="bs-rung-name">{t(RUNG_KEY[r.rung])}</span>
                <span className="bs-rung-meta">
                  {here ? t('games.sentence.ladder.here') : r.open ? t('games.sentence.ladder.count', { n: r.sentences }) : t('games.sentence.ladder.locked')}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function BuildSentence(): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const dialect = useGameDialect();
  const availability = useAvailability(dialect);
  const [ladder, setLadder] = useState<(SentenceLadderView & { open: string | null }) | null>(null);
  const [opened, setOpened] = useState<SentenceRung | null>(null);

  const load = useCallback(async () => {
    const res = await client.get<SentenceLadderView & { open: string | null }>(`/games/build-sentence/ladder?dialect=${dialect}`);
    if (res.ok) setLadder(res.data);
    return res.ok ? res.data : null;
  }, [client, dialect]);

  useEffect(() => {
    void load();
  }, [load]);

  const game = availability?.games.find((g) => g.id === 'build-sentence');
  const difficulties = availability ? (game?.difficulties ?? []) : null;

  return (
    <div className="container solo-page">
      <SoloGameShell<SentenceItemView, SentenceHint, SentenceCorrection>
        game="build-sentence"
        dialect={dialect}
        title={t('games.sentence.name')}
        blurb={t('games.sentence.intro')}
        intro={ladder ? <SentenceLadder ladder={ladder} /> : null}
        difficulties={difficulties}
        suggested={ladder ? difficultyForStep(ladder.step) : undefined}
        open={ladder?.open ?? null}
        renderRound={(round) => <SentenceBoard round={round} dialect={dialect} />}
        explain={(why) => (why in WHY_KEY ? t(WHY_KEY[why as SentenceRung]) : null)}
        onFinished={() => {
          const was = ladder?.step ?? 1;
          void load().then((now) => setOpened(now && now.step > was ? (now.rungs[now.step - 1]?.rung ?? null) : null));
        }}
        resultsExtra={opened ? <p className="bs-opened">{t('games.sentence.ladder.opened', { rung: t(RUNG_KEY[opened]) })}</p> : null}
      />
    </div>
  );
}
