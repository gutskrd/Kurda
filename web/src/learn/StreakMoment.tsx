import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BURST,
  FIRE_VIEW,
  FLAME_IGNITE,
  STREAK_LEAVE_MS,
  STREAK_LEAVE_POSE,
  celebrationPlan,
  fireFrame,
  fireLevel,
  fireSizeToFit,
  flameMoment,
  freezeLine,
  nextFireStage,
  streakMood,
  streakReveal,
  streakWeek,
  weekStartsOn,
  wordIn,
  wordSet,
  type StreakMood,
  type WeekDay,
  type WeekDayState,
} from '@kurda/shared';
import { Fire } from '../components/Fire';
import { DayMedalArt, StreakMedal } from '../ranks/art';
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
 * The flame is for the day the fire grew: on any other day the week below is
 * the whole of the moment.
 *
 * The week (`StreakWeek`) is one card. The streak's medal stands half over
 * its top edge; under it the streak in words, a warm word from Hevalo for
 * the day it is — a first day, a comeback, a new best, or simply another day
 * — and the seven days of this week, each a small medal if it was learned
 * (or kept by a freeze) and its date if it is still to come. Under the card
 * are the fire the streak has grown into, with the next one, and how far the
 * freezes have got.
 *
 * The card comes alive as it opens (shared `streakReveal`): it opens on
 * yesterday, the medal grey and the number as it was; the medal gathers
 * itself, hops, turns to gold as the app's one celebration bursts out of it,
 * and lands as the number rolls on to today's; then the word, the week day
 * by day, what stands under the card and the way on arrive in turn. A click
 * on the card finishes it at once. Leaving, its words fade and the medal
 * gathers itself and is gone. Under reduced motion the grey medal
 * cross-fades to the gold one and everything else is simply there.
 *
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

/** The medal over the card's top edge, and a day's medal in the row of the week. */
const MEDAL = 132;
const DAY_MEDAL = 38;

const DAY_WORDS: Record<WeekDayState, MessageKey> = {
  learned: 'lesson.streak.week.learned',
  frozen: 'lesson.streak.week.frozen',
  today: 'lesson.streak.week.today',
  missed: 'lesson.streak.week.missed',
  ahead: 'lesson.streak.week.ahead',
};

/** How the medal's turn eases from one pose to the next: in and out, as a thing with weight moves. */
const POSE_EASING = 'cubic-bezier(0.37, 0, 0.63, 1)';

export function StreakWeek({
  streak,
  afterFlame = false,
  leaving = false,
  onSettled,
}: {
  streak: Streak;
  /** the flame played before this (the day the fire grew): the number has rolled and the moment been heard already */
  afterFlame?: boolean;
  /** the way on was taken: the card goes, over `STREAK_LEAVE_MS` */
  leaving?: boolean;
  /** everything on the card has arrived, or the reader finished it with a click */
  onSettled?: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  const medal = useRef<HTMLSpanElement>(null);
  const turn = useRef<Animation | null>(null);
  const heard = useRef(afterFlame);
  const [reduce] = useState(prefersReducedMotion);
  const plan = useMemo(() => streakReveal(reduce), [reduce]);
  const [settled, setSettled] = useState(false);
  // the app's one celebration, bursting out of the medal as it turns to gold: felt once, there
  const moment = useCelebrationMoment(plan.burstAtMs);
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const freeze = freezeLine(streak);
  const level = fireLevel(streak.current);
  const next = nextFireStage(streak.current);
  // an older server says neither what today is nor which days were learned: the week is left out rather than guessed
  const days = streak.today && streak.recent ? streakWeek({ today: streak.today, recent: streak.recent, startsOn: weekStartsOn(locale) }) : null;
  const told = useRef(onSettled);
  told.current = onSettled;

  /** Heard once, as the medal turns to gold, unless the flame before it was heard already. */
  const hear = useCallback((): void => {
    if (heard.current) return;
    heard.current = true;
    playLessonSound('reward');
  }, []);

  /** Everything has arrived, by itself or at a click: said once to whoever asked to be told. */
  const arrived = useRef(false);
  const settle = useCallback((): void => {
    if (arrived.current) return;
    arrived.current = true;
    setSettled(true);
    told.current?.();
  }, []);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const sound = window.setTimeout(hear, plan.burstAtMs);
    const over = window.setTimeout(settle, plan.overMs);
    return () => {
      window.clearTimeout(sound);
      window.clearTimeout(over);
    };
  }, [plan, hear, settle]);

  // the medal's turn: gathers, hops, lands (the poses are the shared plan's, about its foot)
  useEffect(() => {
    const el = medal.current;
    if (!el || !plan.travel || typeof el.animate !== 'function') return;
    const playing = el.animate(
      plan.poses.map((p) => ({ offset: p.at, transform: `translateY(${p.lift * MEDAL}px) scale(${p.sx}, ${p.sy})`, easing: POSE_EASING })),
      { duration: plan.medalMs, delay: plan.medalAtMs, fill: 'both' },
    );
    turn.current = playing;
    return () => playing.cancel();
  }, [plan]);

  // leaving: it gathers itself once more, and is gone
  useEffect(() => {
    const el = medal.current;
    if (!leaving || reduce || !el || typeof el.animate !== 'function') return;
    const { sx, sy, scale } = STREAK_LEAVE_POSE;
    const going = el.animate([{ transform: 'none', opacity: 1 }, { transform: `scale(${sx * scale}, ${sy * scale})`, opacity: 0 }], {
      duration: STREAK_LEAVE_MS,
      easing: 'cubic-bezier(0.4, 0, 1, 1)',
      fill: 'both',
    });
    return () => going.cancel();
  }, [leaving, reduce]);

  /** A click on the card while it plays: everything where it ends, at once. */
  const finish = (): void => {
    if (arrived.current) return;
    turn.current?.finish();
    moment.skip();
    hear();
    settle();
  };

  // the streak in words, with its number on its own so that it can roll: "{count}-day streak" around a mark
  const [before, after] = t('learn.today.streak', { count: '\u0001' }).split('\u0001');
  const timing = {
    '--light-at': `${plan.lightAtMs}ms`,
    '--light-ms': `${plan.lightMs}ms`,
    '--count-at': `${plan.countAtMs}ms`,
    '--words-at': `${plan.wordsAtMs}ms`,
    '--week-at': `${plan.weekAtMs}ms`,
    '--day-step': `${plan.dayStepMs}ms`,
    '--after-at': `${plan.afterAtMs}ms`,
  } as React.CSSProperties;
  const ring = { '--celebrate-ring-delay': `${plan.burstAtMs}ms` } as React.CSSProperties;

  return (
    <section
      className={`end-week${settled ? ' is-settled' : ''}${leaving ? ' is-leaving' : ''}${plan.travel ? '' : ' is-still'}`}
      aria-labelledby="end-week-title"
      style={timing}
      onClick={finish}
    >
      <div className="streak-panel">
        {/* the panel's own name, as a shelf says what stands on it */}
        <p className="streak-panel-name">{t('profile.stat.streak')}</p>
        <div className="streak-card">
          {/* a picture beside the words that say it: not read out a second time */}
          <span className={`celebrate streak-card-medal tone-zer ${moment.playing ? 'is-playing' : 'is-done'}`} style={ring} aria-hidden="true">
            <CelebrationArt flecks={BURST.lesson} seed={streak.current * 11 + 7} reach={120} delayMs={plan.burstAtMs} still={reduce}>
              <span className="streak-medal-float">
                <span className="streak-medal-turn" ref={medal}>
                  {/* yesterday's, in grey, and today's over it: one medal changing colour */}
                  <StreakMedal size={MEDAL} title="" unlit />
                  <span className="streak-medal-lit">
                    <StreakMedal size={MEDAL} title="" />
                  </span>
                </span>
              </span>
            </CelebrationArt>
            {/* a few sparks that rise off it once it is lit, the way they rise off a fire */}
            {plan.travel && (
              <span className="streak-medal-sparks">
                <i />
                <i />
                <i />
              </span>
            )}
          </span>
          <h2 className="streak-card-title" id="end-week-title" tabIndex={-1} ref={heading} aria-describedby="end-week-cheer">
            <span aria-hidden="true">
              {before}
              <RollingNumber from={afterFlame ? streak.current : Math.max(0, streak.current - 1)} to={streak.current} delayMs={plan.countAtMs} fade={reduce} />
              {after}
            </span>
            <span className="sr-only">{t('learn.today.streak', { count: number(streak.current) })}</span>
          </h2>
          <p className="streak-card-cheer" id="end-week-cheer">
            {t(CHEERS[streakMood(streak)])}
          </p>
          {days && (
            <ol className="end-days" aria-label={t('lesson.streak.week')}>
              {days.map((day, i) => (
                <WeekCell key={day.date} day={day} order={i} />
              ))}
            </ol>
          )}
        </div>
      </div>
      {/* the fire's stage, and the next as a near goal: never a countdown, and at the Newroz fire simply its name */}
      {level.stage !== 'cold' && (
        <p className="end-week-stage">
          <span className="end-week-stage-name">{t(FIRE_STAGE_NAME[level.stage])}</span>
          {next && next.stage !== 'cold' && next.stage !== 'spark' && <> · {t(FIRE_NEXT[next.stage], { count: number(next.at) })}</>}
        </p>
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
 * One day of the week: its name, short, over what happened on it. A day
 * learned wears a small gold medal, one a freeze kept an ice-blue one with a
 * snowflake; a day still to come is its date, and so is one that was missed,
 * more quietly — never a cross. Today is ringed until it is learned, and its
 * medal is the last to arrive; its name is said in full, with what happened
 * on it.
 */
function WeekCell({ day, order }: { day: WeekDay; order: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const at = new Date(`${day.date}T00:00:00Z`);
  // a browser may know no Kurdish day names: the course's own, as the days of the week are taught (Saturday first)
  const kurdish = locale === 'ku' ? 'kmr' : locale === 'ckb' ? 'ckb' : null;
  const full = kurdish ? wordIn(wordSet('days')[(day.weekday + 1) % 7]!, kurdish) : new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(at);
  // short, as a calendar heads its columns; the course's names have no short form of their own, so their first letter
  const short = kurdish ? [...full][0]! : new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(at);
  const words = day.isToday && day.state === 'learned' ? t('lesson.streak.week.learnedToday', { day: full }) : t(DAY_WORDS[day.state], { day: full });
  const medal = day.state === 'learned' || day.state === 'frozen' ? day.state : null;
  return (
    <li
      className={`end-day is-${day.state}${day.isToday ? ' is-today' : ''}`}
      style={{ '--order': day.isToday ? 7 : order } as React.CSSProperties}
      aria-label={words}
    >
      <span className="end-day-name" aria-hidden="true">
        {short}
      </span>
      <span className="end-day-mark" aria-hidden="true">
        {medal ? <DayMedalArt kind={medal} size={DAY_MEDAL} title="" /> : new Intl.NumberFormat(locale, { useGrouping: false }).format(at.getUTCDate())}
      </span>
    </li>
  );
}
