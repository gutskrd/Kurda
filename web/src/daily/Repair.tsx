import { useEffect, useRef, useState } from 'react';
import { BURST, PLUS_ON_SALE, STREAK_WIN_BACK_SESSIONS, fireLevel, fireSizeToFit, type StreakRepairOffer } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { Fire } from '../components/Fire';
import { useLocale, useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { prefersReducedMotion, useCelebrationMoment } from '../lib/motion';
import { playLessonSound } from '../lib/sounds';
import type { StreakRepairResult, StreakSummary } from '../lib/types';
import { CelebrationArt } from '../ranks/Celebration';

/** The last day a restore is possible, in full ("Thursday, 12 November"), from the minute before the offer ends. */
function lastDay(until: string, locale: string): string {
  const ends = Date.parse(until);
  if (Number.isNaN(ends)) return '';
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  try {
    return new Intl.DateTimeFormat(locale, options).format(new Date(ends - 60_000));
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(ends - 60_000));
  }
}

/** Refusals meaning this streak can no longer be restored at all. */
const GONE = new Set(['NOTHING_TO_RESTORE', 'RESTORE_EXPIRED', 'STREAK_TOO_SHORT']);

/** The days whose won-back streak this page has greeted, so the moment plays once a day rather than at every look. */
const greeted = new Set<string>();

/** Whether to greet a streak won back on `today`, once; a restore made here counts as greeted. */
export function takeWonBack(streak: Pick<StreakSummary, 'restored'>, today: string): boolean {
  if (streak.restored?.on !== today || greeted.has(today)) return false;
  greeted.add(today);
  return true;
}

/**
 * The offer to win an ended streak back, quietly: one sentence naming the streak, what wins it back (lessons or practice
 * sessions in one day) and the last day, with today's sessions as a row of marks. A restore is never bought; a Hevalo+
 * member with this month's free restore also has one button. No countdown, nothing about what will be lost. The server
 * decides, and a streak past restoring is said plainly with no button.
 */
export function RepairOffer({ offer, onRestored }: { offer: StreakRepairOffer; onRestored: (streak: StreakSummary) => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [free, setFree] = useState(offer.free);
  const needed = Math.max(1, offer.sessionsNeeded ?? STREAK_WIN_BACK_SESSIONS);
  const done = Math.min(needed, Math.max(0, offer.sessionsToday ?? 0));

  async function restore(): Promise<void> {
    setBusy(true);
    setProblem(null);
    const res = await client.post<StreakRepairResult>('/me/streak/repair');
    setBusy(false);
    if (res.ok) {
      onRestored(res.data.streak);
      return;
    }
    // This month's free restore was used after all: learning still wins it back.
    if (res.error.code === 'WIN_IT_BACK') setFree(false);
    else if (res.error.code && GONE.has(res.error.code)) setGone(true);
    else setProblem(describeError(res.error, t));
  }

  if (gone) {
    return (
      <div className="streak-repair">
        <p className="streak-repair-text" role="alert">
          {t('streak.repair.gone')}
        </p>
      </div>
    );
  }
  const progress = t('streak.repair.progress', { done: number(done), needed: number(needed) });
  return (
    <div className="streak-repair">
      <p className="streak-repair-text">
        {t('streak.repair.offer', { count: number(offer.days), sessions: number(needed), date: lastDay(offer.until, locale) })}
      </p>
      <p className="streak-repair-progress" aria-label={progress}>
        <span className="streak-repair-marks" aria-hidden="true">
          {Array.from({ length: needed }, (_, i) => (
            <span key={i} className={`streak-repair-mark${i < done ? ' is-done' : ''}`} />
          ))}
        </span>
        <span aria-hidden="true">{progress}</span>
      </p>
      {free ? (
        <Button size="sm" variant="secondary" onClick={() => void restore()} disabled={busy}>
          {busy ? t('streak.repair.restoring') : t('streak.repair.restoreFree')}
        </Button>
      ) : PLUS_ON_SALE ? (
        <p className="streak-repair-hint">{t('streak.repair.plusPitch')}</p>
      ) : null}
      {problem && (
        <p className="streak-repair-problem" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

/** The restored streak's fire, framed in a square this big inside its glow. */
const BACK_FIRE = 96;

/**
 * The streak back, in the head's place: its fire arrives as anything earned does here (`CelebrationArt`,
 * `useCelebrationMoment`), then the words, which say how it came back; under reduced motion the fire fades in. The
 * headline takes the focus, so it is announced.
 */
export function Restored({ streak, wonBack = false }: { streak: StreakSummary; wonBack?: boolean }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const moment = useCelebrationMoment();
  const heading = useRef<HTMLHeadingElement>(null);
  const level = fireLevel(streak.current);

  useEffect(() => {
    playLessonSound('reward');
    heading.current?.focus();
  }, []);

  return (
    // A click while it plays skips to the end.
    <div
      className={`celebrate celebrate-inline streak-restored tone-zer ${moment.playing ? 'is-playing' : 'is-done'}`}
      onClick={moment.playing ? moment.skip : undefined}
    >
      <CelebrationArt flecks={BURST.lesson} seed={streak.current * 17 + 3} reach={110} still={prefersReducedMotion()}>
        <Fire size={fireSizeToFit(level.stage, BACK_FIRE, BACK_FIRE)} level={level} framed />
      </CelebrationArt>
      <div className="celebrate-details">
        <h2 className="daily-restored-title" tabIndex={-1} ref={heading}>
          {t('streak.repair.restoredTitle', { count: new Intl.NumberFormat(locale).format(streak.current) })}
        </h2>
        <p className="streak-repair-text">{t(wonBack ? 'streak.repair.wonBackBody' : 'streak.repair.restoredBody')}</p>
      </div>
    </div>
  );
}
