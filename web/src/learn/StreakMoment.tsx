import { useEffect, useId, useRef, useState } from 'react';
import {
  BURST,
  CELEBRATE_MS,
  STREAK_DAY_TIMING,
  freezeLine,
  streakMood,
  streakWeek,
  weekStartsOn,
  wordIn,
  wordSet,
  type StreakMood,
  type WeekDay,
  type WeekDayState,
} from '@kurda/shared';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { CheckIcon } from '../components/icons';
import { CelebrationArt } from '../ranks/Celebration';
import { prefersReducedMotion, useCelebrationMoment } from '../lib/motion';
import { playLessonSound } from '../lib/sounds';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import type { Streak } from './types';

/**
 * The streak kept today, in two moments after the results — only when
 * today's first lesson is what kept it, and only once the learner taps on.
 *
 * First the flame (`StreakFlame`): the whole screen warm, the flame growing
 * out of a glow with sparks thrown off it, and the day number rolling up from
 * yesterday's to today's, heard and felt as it turns. It moves on by itself
 * after the app's one celebration (about a second and a half), or at once on
 * a click, Enter, Space or Escape.
 *
 * Then the week (`StreakWeek`): Hevalo saying a warm word for the day it is —
 * a first day, a comeback, a new best, or simply another day — the number and
 * "day streak", the seven days of this week with what happened on each, and
 * how far the freezes have got. Nothing counts down, warns or asks for
 * anything: a streak is a number that went up.
 */

/** A flame in the sun's colours: an orange body with a curl at its tip, a yellow heart. */
export function FlameArt({ size = 120 }: { size?: number }): React.JSX.Element {
  const id = `flame${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  return (
    <svg className="flame-art" width={size} height={size * 1.2} viewBox="0 0 100 120" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-outer`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb648" />
          <stop offset="1" stopColor="#f27a1a" />
        </linearGradient>
        <linearGradient id={`${id}-inner`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset="1" stopColor="#ffc93c" />
        </linearGradient>
      </defs>
      <path
        d="M54 4 C58 22 84 38 88 66 C92 94 74 116 50 116 C26 116 10 98 10 74 C10 56 20 44 30 34 C30 46 34 54 42 58 C38 40 42 20 54 4 Z"
        fill={`url(#${id}-outer)`}
      />
      <path d="M52 56 C56 68 70 76 70 92 C70 104 62 112 50 112 C38 112 30 104 30 92 C30 82 36 76 42 70 C43 76 46 80 50 80 C48 72 49 63 52 56 Z" fill={`url(#${id}-inner)`} />
    </svg>
  );
}

/**
 * A number turning from one value to the next as a counter does: each digit
 * that changes slides up out of sight as its new one slides in under it, and
 * the ones that stay the same stay still. Written left to right whatever the
 * page's direction, as numbers are.
 */
function RollingNumber({ from, to, delayMs, still }: { from: number; to: number; delayMs: number; still: boolean }): React.JSX.Element {
  const locale = useLocale();
  const format = new Intl.NumberFormat(locale, { useGrouping: false });
  const after = format.format(to);
  if (still) return <span className="roll">{after}</span>;
  const before = format.format(from);
  const width = Math.max(before.length, after.length);
  // a figure space holds the place of a digit that is not there yet (9 → 10)
  const old = before.padStart(width, ' ');
  const now = after.padStart(width, ' ');
  return (
    <span className="roll" dir="ltr" style={{ '--roll-delay': `${delayMs}ms` } as React.CSSProperties}>
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

export function StreakFlame({ streak, onDone }: { streak: Streak; onDone: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const [reduce] = useState(prefersReducedMotion);
  const heading = useRef<HTMLHeadingElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  // felt once, as the flame lands
  const moment = useCelebrationMoment();

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const reward = window.setTimeout(() => playLessonSound('reward'), reduce ? 0 : STREAK_DAY_TIMING.rewardAtMs);
    const over = window.setTimeout(() => done.current(), CELEBRATE_MS);
    // ahead of the lesson's own keys: Escape here moves on rather than leaving
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Escape') return;
      e.preventDefault();
      done.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(reward);
      window.clearTimeout(over);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [reduce]);

  return (
    // a click anywhere moves on
    <section className="end-flame" aria-labelledby="end-flame-title" onClick={() => done.current()}>
      <div className={`celebrate end-flame-art ${moment.playing ? 'is-playing' : 'is-done'}`}>
        <CelebrationArt flecks={BURST.tier} seed={streak.current * 13 + 5} reach={170}>
          <FlameArt size={150} />
        </CelebrationArt>
      </div>
      <h2 className="end-flame-day" id="end-flame-title" tabIndex={-1} ref={heading}>
        <span aria-hidden="true">
          <RollingNumber
            from={Math.max(0, streak.current - 1)}
            to={streak.current}
            delayMs={STREAK_DAY_TIMING.countAtMs}
            still={reduce}
          />
        </span>
        <span className="sr-only">{t('learn.today.streak', { count: new Intl.NumberFormat(locale).format(streak.current) })}</span>
      </h2>
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
  // an older server says neither what today is nor which days were learned: the week is left out rather than guessed
  const days = streak.today && streak.recent ? streakWeek({ today: streak.today, recent: streak.recent, startsOn: weekStartsOn(locale) }) : null;

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="end-week" aria-labelledby="end-week-title">
      <div className="end-week-hevalo">
        <p className="end-bubble" id="end-week-cheer">
          {t(CHEERS[streakMood(streak)])}
        </p>
        <SpeakingCharacter speaker="hevalo" audio={null} crop="full" size={150} decorative reaction="cheer" />
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
