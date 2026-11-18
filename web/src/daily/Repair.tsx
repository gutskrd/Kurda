import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { BURST, fireLevel, fireSizeToFit, type StreakRepairOffer } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { Fire } from '../components/Fire';
import { GemIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { prefersReducedMotion, useCelebrationMoment } from '../lib/motion';
import { playLessonSound } from '../lib/sounds';
import type { StreakRepairResult, StreakSummary, WalletBalances } from '../lib/types';
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

/**
 * The offer to restore an ended streak, in one line: which streak and through which day, and one button with the gem
 * price (or free, for a Hevalo+ member's monthly restore). No countdown, nothing about what will be lost. When gems are
 * known to be short the button is disabled, with the balance and where gems come from. The server decides: a short
 * balance is re-read, and a streak past restoring is said plainly with no button.
 */
export function RepairOffer({ offer, onRestored }: { offer: StreakRepairOffer; onRestored: (streak: StreakSummary) => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const [gems, setGems] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const shortId = useId();

  const readGems = useCallback(async (): Promise<void> => {
    const res = await client.get<{ balances: WalletBalances }>('/me/wallet');
    // `ok` says nothing about the body's shape.
    if (res.ok && typeof res.data?.balances?.gems === 'number') setGems(res.data.balances.gems);
  }, [client]);

  // A free restore needs no balance; a priced one says it only when the gems are short.
  useEffect(() => {
    if (!offer.free) void readGems();
  }, [offer.free, readGems]);

  async function restore(): Promise<void> {
    setBusy(true);
    setProblem(null);
    const res = await client.post<StreakRepairResult>('/me/streak/repair');
    setBusy(false);
    if (res.ok) {
      onRestored(res.data.streak);
      return;
    }
    if (res.error.code === 'INSUFFICIENT_FUNDS') await readGems();
    else if (res.error.code && GONE.has(res.error.code)) setGone(true);
    else setProblem(describeError(res.error, t));
  }

  // Short only once the balance is known; until then the button works and the server answers.
  const short = !offer.free && gems !== null && gems < offer.costGems;
  if (gone) {
    return (
      <div className="streak-repair">
        <p className="streak-repair-text" role="alert">
          {t('streak.repair.gone')}
        </p>
      </div>
    );
  }
  return (
    <div className="streak-repair">
      <p className="streak-repair-text">{t('streak.repair.offer', { count: number(offer.days), date: lastDay(offer.until, locale) })}</p>
      {short && gems !== null && (
        <div className="streak-repair-short" id={shortId}>
          <p className="streak-repair-gems">
            <GemIcon size={18} />
            {t('streak.repair.gems', { count: number(gems) })}
          </p>
          <p className="streak-repair-hint">{t('streak.repair.gemsFrom')}</p>
        </div>
      )}
      <Button size="sm" variant="secondary" onClick={() => void restore()} disabled={busy || short} aria-describedby={short ? shortId : undefined}>
        {busy ? (
          t('streak.repair.restoring')
        ) : offer.free ? (
          t('streak.repair.restoreFree')
        ) : (
          <>
            <GemIcon size={18} />
            {t('streak.repair.restoreFor', { count: number(offer.costGems) })}
          </>
        )}
      </Button>
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
 * `useCelebrationMoment`), then the words; under reduced motion the fire fades in. The headline takes the button's focus,
 * so it is announced.
 */
export function Restored({ streak }: { streak: StreakSummary }): React.JSX.Element {
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
        <p className="streak-repair-text">{t('streak.repair.restoredBody')}</p>
      </div>
    </div>
  );
}
