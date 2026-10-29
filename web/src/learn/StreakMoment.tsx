import { useEffect, useRef, useState } from 'react';
import {
  BURST,
  FIRE_VIEW,
  FLAME_IGNITE,
  celebrationPlan,
  fireBesideWindow,
  fireFrame,
  fireLevel,
  fireSizeToFit,
  flameMoment,
  freezeLine,
  nextFireStage,
  streakMood,
  streakWeek,
  weekStartsOn,
  wordIn,
  wordSet,
  type StreakMood,
  type WeekDay,
  type WeekDayState,
} from '@kurda/shared';
import { HevaloWindow } from '../characters/HevaloWindow';
import { Fire } from '../components/Fire';
import { CheckIcon } from '../components/icons';
import { CelebrationArt } from '../ranks/Celebration';
import { prefersReducedMotion, useCelebrationMoment } from '../lib/motion';
import { playLessonSound } from '../lib/sounds';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { FIRE_GREW, FIRE_NEXT, FIRE_STAGE_NAME } from './fireWords';
import type { Streak } from './types';

/**
 * The streak kept today, in two moments after the results — only when
 * today's first lesson is what kept it, and only once the learner taps on.
 *
 * First the flame (`StreakFlame`): it opens dim and cool on yesterday, the
 * fire faint and yesterday's number, and then the fire lights (shared
 * `FLAME_IGNITE`): it squashes and pops up, a ring of gold bursts out of it,
 * the warm light floods out from it over the whole screen, sparks fly off it,
 * and the day number rolls on to today's, heard and felt as it lights. It
 * moves on by itself after the app's one celebration (about a second and a
 * half after it lights), or at once on a click, Enter, Space or Escape. On
 * the day the fire grew (shared `flameMoment`) it opens on the fire as it was
 * yesterday, and the pop leaps on up into its new stage, heard as it lands,
 * with a line under the day saying what it grew into; it stays until that has
 * been read. Under reduced motion nothing squashes, rings or travels: the dim
 * screen cross-fades to the warm one.
 *
 * Then the week (`StreakWeek`): Hevalo, his head in at the window by the
 * fire, saying a warm word for the day it is — a first day, a comeback, a new
 * best, or simply another day — the number and "day streak", the fire's stage
 * and the next one, the seven days of this week with what happened on each,
 * and how far the freezes have got.
 * Nothing counts down, warns or asks for anything: a streak is a number that
 * went up.
 */

/**
 * A number turning from one value to the next as a counter does: each digit
 * that changes slides up out of sight as its new one slides in under it, and
 * the ones that stay the same stay still; or, `fade`, cross-fades where it
 * is. Written left to right whatever the page's direction, as numbers are.
 */
function RollingNumber({ from, to, delayMs, fade }: { from: number; to: number; delayMs: number; fade: boolean }): React.JSX.Element {
  const locale = useLocale();
  const format = new Intl.NumberFormat(locale, { useGrouping: false });
  const after = format.format(to);
  const before = format.format(from);
  const width = Math.max(before.length, after.length);
  // a figure space holds the place of a digit that is not there yet (9 → 10)
  const old = before.padStart(width, ' ');
  const now = after.padStart(width, ' ');
  return (
    <span className={`roll${fade ? ' is-fading' : ''}`} dir="ltr" style={{ '--roll-delay': `${delayMs}ms` } as React.CSSProperties}>
      {[...now].map((digit, i) =>
        digit === old[i] ? (
          <span key={i} className="roll-digit">
            {digit}
          </span>
        ) : (
          <span key={i} className="roll-digit is-rolling">
            <span className="roll-column">
              <span>{old[i]}</span>
              <span>{digit}</span>
            </span>
          </span>
        ),
      )}
    </span>
  );
}

/** Room the flame's screen keeps for the day's number and the line under it, and round the fire; and the most it gives the fire. */
const FLAME_WORDS = 260;
const FLAME_GUTTER = 32;
const FLAME_MOST = 400;

/**
 * How big the fire is drawn on the flame's screen: as big as the window lets
 * the biggest fire there is (the Newroz fire, framed) be, up to
 * `FLAME_MOST`, and the same at every stage, so a longer streak's fire is a
 * bigger fire. Framed, a young one takes up only the room it needs.
 */
function useFlameSize(): number {
  const fit = (): number => Math.min(FLAME_MOST, fireSizeToFit('newroz', window.innerWidth - FLAME_GUTTER, window.innerHeight - FLAME_WORDS));
  const [size, setSize] = useState(fit);
  useEffect(() => {
    const onResize = (): void => setSize(fit());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/** The fire lighting up (shared `FLAME_IGNITE`), as the stylesheet's custom properties: when, how long, how faint before, and the pop's poses. */
const IGNITE = {
  '--ignite-at': `${FLAME_IGNITE.atMs}ms`,
  '--ignite-ms': `${FLAME_IGNITE.popMs}ms`,
  '--ignite-dim': FLAME_IGNITE.dim,
  '--flood-ms': `${FLAME_IGNITE.floodMs}ms`,
  ...Object.fromEntries(FLAME_IGNITE.pop.map((p, i) => [`--pop-${i}`, `scale(${p.sx}, ${p.sy})`])),
} as React.CSSProperties;
/** The app's one celebration, played from as it lights: the ring bursting out of the fire as it pops. */
const LIT = celebrationPlan(false);
const RING_AT = { '--celebrate-ring-delay': `${FLAME_IGNITE.atMs + LIT.ringDelayMs}ms` } as React.CSSProperties;

export function StreakFlame({ streak, onDone }: { streak: Streak; onDone: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const [reduce] = useState(prefersReducedMotion);
  const [fire] = useState(() => flameMoment(streak.current));
  const [landed, setLanded] = useState(false);
  const size = useFlameSize() * fire.zoom;
  const frame = fireFrame(fire.level.stage);
  // the sparks thrown round the fire, as far as it is big
  const reach = Math.max(170, (size / FIRE_VIEW.h) * Math.max(frame.w, frame.h) * 0.6);
  const heading = useRef<HTMLHeadingElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  // felt once, as it lights
  const moment = useCelebrationMoment(FLAME_IGNITE.atMs);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    // heard as it lights; on the day it grew, as the growth lands, with the line that says so
    const reward = window.setTimeout(() => playLessonSound('reward'), fire.grew ? fire.landsAtMs : FLAME_IGNITE.atMs + celebrationPlan(reduce).hapticAtMs);
    const lands = fire.grew ? window.setTimeout(() => setLanded(true), fire.landsAtMs) : undefined;
    const over = window.setTimeout(() => done.current(), fire.overMs);
    // ahead of the lesson's own keys: Escape here moves on rather than leaving
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Escape') return;
      e.preventDefault();
      done.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(reward);
      window.clearTimeout(lands);
      window.clearTimeout(over);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [reduce, fire]);

  return (
    // a click anywhere moves on
    <section className="end-flame" aria-labelledby="end-flame-title" onClick={() => done.current()} style={IGNITE}>
      <div className={`celebrate end-flame-art ${moment.playing ? 'is-playing' : 'is-done'}`} style={RING_AT}>
        {/* the warm light, flooding out from the fire as it lights */}
        <span className="end-flame-flood" aria-hidden="true" />
        <CelebrationArt flecks={BURST.tier} seed={streak.current * 13 + 5} reach={reach} delayMs={FLAME_IGNITE.atMs} still={reduce}>
          <Fire size={size} level={fire.level} from={fire.from} framed />
        </CelebrationArt>
      </div>
      <h2 className="end-flame-day" id="end-flame-title" tabIndex={-1} ref={heading}>
        <span aria-hidden="true">
          <RollingNumber from={Math.max(0, streak.current - 1)} to={streak.current} delayMs={FLAME_IGNITE.atMs} fade={reduce} />
        </span>
        <span className="sr-only">{t('learn.today.streak', { count: new Intl.NumberFormat(locale).format(streak.current) })}</span>
      </h2>
      {/* its place kept from the start, so nothing moves when the words arrive; said when they do */}
      {fire.grew && (
        <p className={`end-flame-grew${landed ? ' is-landed' : ''}`} role="status">
          {landed ? t(FIRE_GREW[fire.grew]) : ''}
        </p>
      )}
    </section>
  );
}

/** Hevalo's word for the day (`streakMood`): a first day, a comeback after a break, a new best, or another day kept. */
const CHEERS: Record<StreakMood, MessageKey> = {
  start: 'lesson.streak.say.first',
  comeback: 'lesson.streak.say.back',
  best: 'lesson.streak.say.best',
  ordinary: 'lesson.streak.say.steady',
};

/**
 * Hevalo's window under his words, and the fire on the floor in front of it,
 * by its lower corner on the side the reading starts from (shared
 * `fireBesideWindow`): its logs across the wall's corner, a little nearer
 * than the wall. The two stand together in the middle, the window towards
 * where the reading ends, where the bubble points.
 */
const WINDOW = 160;
const BESIDE = fireBesideWindow(WINDOW);
const SCENE = { '--fire-over': `${BESIDE.over}px`, '--fire-drop': `${BESIDE.drop}px`, '--window-aside': `${BESIDE.windowAside}px` } as React.CSSProperties;

const DAY_WORDS: Record<WeekDayState, MessageKey> = {
  learned: 'lesson.streak.week.learned',
  frozen: 'lesson.streak.week.frozen',
  today: 'lesson.streak.week.today',
  missed: 'lesson.streak.week.missed',
  ahead: 'lesson.streak.week.ahead',
};

export function StreakWeek({ streak }: { streak: Streak }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const freeze = freezeLine(streak);
  const level = fireLevel(streak.current);
  const next = nextFireStage(streak.current);
  // an older server says neither what today is nor which days were learned: the week is left out rather than guessed
  const days = streak.today && streak.recent ? streakWeek({ today: streak.today, recent: streak.recent, startsOn: weekStartsOn(locale) }) : null;

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="end-week" aria-labelledby="end-week-title">
      <div className="end-week-hevalo" style={SCENE}>
        <p className="end-bubble" id="end-week-cheer">
          {t(CHEERS[streakMood(streak)])}
        </p>
        <div className="end-week-scene">
          <Fire size={BESIDE.fire} level={level} className="end-week-fire" />
          <HevaloWindow size={WINDOW} reaction="cheer" />
        </div>
      </div>
      <h2 className="end-week-count" id="end-week-title" tabIndex={-1} ref={heading} aria-describedby="end-week-cheer">
        <span className="end-week-number" aria-hidden="true">
          {number(streak.current)}
        </span>
        <span className="end-week-words" aria-hidden="true">
          {t('lesson.streak.dayStreak')}
        </span>
        <span className="sr-only">{t('learn.today.streak', { count: number(streak.current) })}</span>
      </h2>
      {/* the fire's stage, and the next as a near goal: never a countdown, and at the Newroz fire simply its name */}
      {level.stage !== 'cold' && (
        <p className="end-week-stage">
          <span className="end-week-stage-name">{t(FIRE_STAGE_NAME[level.stage])}</span>
          {next && next.stage !== 'cold' && next.stage !== 'spark' && <> · {t(FIRE_NEXT[next.stage], { count: number(next.at) })}</>}
        </p>
      )}
      {days && (
        <ol className="end-days" aria-label={t('lesson.streak.week')}>
          {days.map((day, i) => (
            <WeekCell key={day.date} day={day} order={i} />
          ))}
        </ol>
      )}
      {freeze && (
        <div className="end-freeze">
          {freeze.kind === 'toward' && (
            <div className="end-freeze-bar" aria-hidden="true">
              <span style={{ '--to': freeze.done / freeze.per } as React.CSSProperties} />
            </div>
          )}
          <p className="end-freeze-line">
            {freeze.kind === 'toward'
              ? t('lesson.streak.freeze', { done: number(freeze.done), per: number(freeze.per) })
              : freeze.count === 1
                ? t('lesson.streak.freezeReadyOne')
                : t('lesson.streak.freezeReady', { count: number(freeze.count) })}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * One day of the week: its initial, and a round mark — gold with a check for
 * a day learned, ice blue with a check for one a freeze kept, muted for one
 * missed, an empty grey ring for one still ahead. Today is ringed and pops in
 * last; its name is said in full, with what happened on it.
 */
function WeekCell({ day, order }: { day: WeekDay; order: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const at = new Date(`${day.date}T00:00:00Z`);
  // a browser may know no Kurdish day names: the course's own, as the days of the week are taught (Saturday first)
  const kurdish = locale === 'ku' ? 'kmr' : locale === 'ckb' ? 'ckb' : null;
  const full = kurdish ? wordIn(wordSet('days')[(day.weekday + 1) % 7]!, kurdish) : new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(at);
  const initial = kurdish ? [...full][0]! : new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(at);
  const words = day.isToday && day.state === 'learned' ? t('lesson.streak.week.learnedToday', { day: full }) : t(DAY_WORDS[day.state], { day: full });
  return (
    <li
      className={`end-day is-${day.state}${day.isToday ? ' is-today' : ''}`}
      style={{ '--order': day.isToday ? 7 : order } as React.CSSProperties}
      aria-label={words}
    >
      <span className="end-day-name" aria-hidden="true">
        {initial}
      </span>
      <span className="end-day-mark" aria-hidden="true">
        {(day.state === 'learned' || day.state === 'frozen') && <CheckIcon size={18} weight="bold" />}
      </span>
    </li>
  );
}
