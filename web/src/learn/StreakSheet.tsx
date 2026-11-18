import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { BURST, fireLadder, fireLevel, fireSizeToFit, type FireLadderPlace, type StreakRepairOffer } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { Fire } from '../components/Fire';
import { CheckIcon, GemIcon } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { describeError } from '../lib/api';
import { prefersReducedMotion, useCelebrationMoment } from '../lib/motion';
import { playLessonSound } from '../lib/sounds';
import type { StreakRepairResult, StreakSummary, WalletBalances } from '../lib/types';
import { CelebrationArt } from '../ranks/Celebration';
import { FIRE_STAGE_NAME } from './fireWords';
import './streak.css';

/** What a freeze costs in sessions when an older server does not say. */
const SESSIONS_PER_FREEZE = 5;

/** The fire beside the streak in words, framed in a square this big at any stage. */
const HEAD_FIRE = 48;

/**
 * The streak's whole story in a sheet from Learn's "Today", as on the phone: the streak beside its fire, the longest run,
 * days learned and freezes (with what a freeze costs), and the fire's stages. `streak` null keeps it closed. While an
 * ended streak can be restored (`streak.repair`), one plain line and one button say which streak, until when and the
 * price; no countdown, nothing about what will be lost. `onRestored` hands the restored streak to the page.
 */
export function StreakSheet({
  streak,
  onClose,
  onRestored,
}: {
  streak: StreakSummary | null;
  onClose: () => void;
  onRestored?: (streak: StreakSummary) => void;
}): React.JSX.Element {
  const t = useT();
  return (
    <Sheet open={streak !== null} onClose={onClose} label={t('profile.stat.streak')} className="streak-sheet">
      {streak && <StreakDetail streak={streak} onRestored={onRestored} />}
    </Sheet>
  );
}

/** The open sheet's contents, mounted only while open so a just-restored state is forgotten on close. */
function StreakDetail({ streak, onRestored }: { streak: StreakSummary; onRestored?: (streak: StreakSummary) => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const [restored, setRestored] = useState<StreakSummary | null>(null);
  const shown = restored ?? streak;
  const offer = restored ? null : (streak.repair ?? null);
  const days = shown.current;
  const level = fireLevel(days);
  const cells = [
    { label: t('profile.stat.longestStreak'), value: shown.longest },
    { label: t('profile.stat.daysLearned'), value: shown.daysLearned ?? 0 },
    { label: t('profile.stat.freezes'), value: shown.freezes },
  ];
  return (
    <>
      {restored ? (
        <Restored streak={restored} />
      ) : (
        <div className="streak-sheet-head">
          <span className="streak-sheet-fire">
            <Fire size={fireSizeToFit(level.stage, HEAD_FIRE, HEAD_FIRE)} level={level} framed />
          </span>
          <h2 className="streak-sheet-title">{days > 0 ? t('learn.today.streak', { count: number(days) }) : t('learn.today.noStreak')}</h2>
        </div>
      )}
      {offer && (
        <RepairOffer
          offer={offer}
          onRestored={(next) => {
            setRestored(next);
            onRestored?.(next);
          }}
        />
      )}
      <dl className="streak-sheet-stats">
        {cells.map((cell) => (
          <div key={cell.label} className="streak-sheet-stat">
            <dt>{cell.label}</dt>
            <dd>{number(cell.value)}</dd>
          </div>
        ))}
      </dl>
      {/* A Hevalo+ member can hold a second freeze, so the hint gives the number. */}
      <p className="streak-sheet-hint">
        {(shown.maxFreezes ?? 1) > 1
          ? t('profile.freezeHintPlus', { count: number(shown.sessionsPerFreeze ?? SESSIONS_PER_FREEZE), max: number(shown.maxFreezes ?? 1) })
          : t('profile.freezeHint', { count: number(shown.sessionsPerFreeze ?? SESSIONS_PER_FREEZE) })}
      </p>
      <FireLadder days={days} />
    </>
  );
}

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
 * The offer to restore an ended streak: which streak and through which day, and one button with the gem price (or free,
 * for a Hevalo+ member's monthly restore). When gems are known to be short the button is disabled, with the balance and
 * where gems come from. The server decides: a short balance is re-read, and a streak past restoring is said plainly with
 * no button.
 */
function RepairOffer({ offer, onRestored }: { offer: StreakRepairOffer; onRestored: (streak: StreakSummary) => void }): React.JSX.Element {
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
          <p className="streak-sheet-hint">{t('streak.repair.gemsFrom')}</p>
        </div>
      )}
      <Button size="lg" block onClick={() => void restore()} disabled={busy || short} aria-describedby={short ? shortId : undefined}>
        {busy ? (
          t('streak.repair.restoring')
        ) : offer.free ? (
          t('streak.repair.restoreFree')
        ) : (
          <>
            <GemIcon size={20} />
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
const BACK_FIRE = 72;

/**
 * The streak back: its fire arrives as anything earned does here (`CelebrationArt`, `useCelebrationMoment`), then the
 * words; under reduced motion the fire fades in. The headline takes the button's focus, so it is announced.
 */
function Restored({ streak }: { streak: StreakSummary }): React.JSX.Element {
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
        <h2 className="streak-sheet-title" tabIndex={-1} ref={heading}>
          {t('streak.repair.restoredTitle', { count: new Intl.NumberFormat(locale).format(streak.current) })}
        </h2>
        <p className="streak-repair-text">{t('streak.repair.restoredBody')}</p>
      </div>
    </div>
  );
}

/** How a screen reader hears a stage, by where it stands. */
const PLACE_WORDS: Record<FireLadderPlace, MessageKey> = {
  reached: 'fire.ladder.reached',
  now: 'fire.ladder.current',
  ahead: 'fire.ladder.ahead',
};

/** Each ladder fire is framed to fill a square this big, so every row is the same height. */
const RUNG_FIRE = 44;

/**
 * The fire's stages from the spark to the Newroz fire (shared `fireLadder`), each with its name and day: reached ones
 * burning with a check, the current one ringed and marked "Now", later ones still and dimmed.
 */
export function FireLadder({ days }: { days: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  return (
    <section className="fire-ladder" aria-labelledby="fire-ladder-title">
      <h3 className="fire-ladder-title" id="fire-ladder-title">
        {t('fire.ladder.title')}
      </h3>
      <ol className="fire-ladder-list">
        {fireLadder(days).map((step) => {
          const name = t(FIRE_STAGE_NAME[step.stage]);
          return (
            <li key={step.stage} className={`fire-rung is-${step.place}`}>
              <span className="fire-rung-art" aria-hidden="true">
                <Fire size={fireSizeToFit(step.stage, RUNG_FIRE, RUNG_FIRE)} level={step.level} still={step.place === 'ahead'} framed />
              </span>
              <span className="fire-rung-words" aria-hidden="true">
                <span className="fire-rung-name">
                  {name}
                  {step.place === 'reached' && <CheckIcon size={16} className="fire-rung-check" />}
                </span>
                <span className="fire-rung-day">{t('fire.ladder.day', { count: number(step.day) })}</span>
              </span>
              {step.place === 'now' && (
                <span className="fire-rung-now" aria-hidden="true">
                  {t('fire.ladder.now')}
                </span>
              )}
              <span className="sr-only">{t(PLACE_WORDS[step.place], { stage: name, count: number(step.day) })}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
