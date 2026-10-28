import { useEffect, useRef, useState } from 'react';
import { STREAK_DAY_TIMING, freezeLine } from '@kurda/shared';
import { FlameIcon } from '../components/icons';
import { haptic } from '../lib/haptics';
import { prefersReducedMotion, useCountUp } from '../lib/motion';
import { playLessonSound } from '../lib/sounds';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { Streak } from './types';

/**
 * "Day 12": the streak kept today, on a card of its own after the results —
 * only when today's first lesson is what kept it, and only once the learner
 * taps on from the results, never by itself.
 *
 * The flame arrives on a spring, the day counts on from yesterday's, the
 * reward is heard and felt as it does (`STREAK_DAY_TIMING`), and then the
 * freezes are said: how far the sessions since the last one have got towards
 * the next, or the ones saved. Every day learned is counted beside it,
 * because unlike the streak that number never goes down. Nothing here counts
 * down, warns or asks for anything: a streak is a number that went up.
 */
export function StreakDay({ streak }: { streak: Streak }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  const [reduce] = useState(prefersReducedMotion);
  const day = useCountUp(streak.current, { from: Math.max(0, streak.current - 1), delayMs: STREAK_DAY_TIMING.countAtMs });
  const freeze = freezeLine(streak);
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);

  useEffect(() => {
    heading.current?.focus();
    const id = window.setTimeout(
      () => {
        playLessonSound('reward');
        haptic('celebrate');
      },
      reduce ? 0 : STREAK_DAY_TIMING.rewardAtMs,
    );
    return () => window.clearTimeout(id);
  }, [reduce]);

  return (
    <section className="lesson-day" aria-labelledby="lesson-day-title">
      <span className="lesson-day-flame" aria-hidden="true">
        <FlameIcon size={96} weight="fill" />
      </span>
      <h2 className="lesson-day-title" id="lesson-day-title" tabIndex={-1} ref={heading}>
        {/* read out as the day it is, not each number on the way */}
        <span aria-hidden="true">{t('lesson.streak.day', { n: number(day) })}</span>
        <span className="sr-only">{t('lesson.streak.day', { n: number(streak.current) })}</span>
      </h2>
      {typeof streak.daysLearned === 'number' && streak.daysLearned > 0 && (
        <p className="lesson-day-body">{t('lesson.streak.body', { days: number(streak.daysLearned) })}</p>
      )}
      {freeze && (
        <div className="lesson-day-freeze">
          {freeze.kind === 'toward' && (
            <div className="lesson-day-bar" aria-hidden="true">
              <span style={{ '--to': freeze.done / freeze.per } as React.CSSProperties} />
            </div>
          )}
          <p className="lesson-day-freeze-line">
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
