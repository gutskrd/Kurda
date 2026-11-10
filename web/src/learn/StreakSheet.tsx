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

/** What the server pays a freeze for, when it does not say (older responses). */
const SESSIONS_PER_FREEZE = 5;

/** The fire beside the streak in words: framed in a square this big, whatever its stage. */
const HEAD_FIRE = 48;

/**
 * The streak's whole story, in a sheet opened from the streak in Learn's
 * "Today" — the same as the phone's: the streak in words beside its fire, the
 * three numbers a missed day never takes away (the longest run, the days
 * learned in all, the freezes learning has earned) with what a freeze costs,
 * and the ladder of the fire's stages. `streak` null keeps it closed.
 *
 * While a streak that ended can still be restored (`streak.repair`), the sheet
 * says so under the streak's words: which streak, the last day it can be
 * brought back on, and one button with what that costs. It is said once, in
 * plain words, here and nowhere else: no countdown, and nothing about what
 * will be lost. `onRestored` hands the restored streak to the page.
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

/**
 * What the open sheet shows. Mounted only while it is open, so what it
 * remembers — that the streak was just restored — is forgotten when it closes.
 */
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
      {/* a Hevalo+ member has room for a second freeze, and the hint says how many rather than "one" */}
      <p className="streak-sheet-hint">
        {(shown.maxFreezes ?? 1) > 1
          ? t('profile.freezeHintPlus', { count: number(shown.sessionsPerFreeze ?? SESSIONS_PER_FREEZE), max: number(shown.maxFreezes ?? 1) })
          : t('profile.freezeHint', { count: number(shown.sessionsPerFreeze ?? SESSIONS_PER_FREEZE) })}
      </p>
      <FireLadder days={days} />
    </>
  );
}

/**
 * The last day the streak can be restored on, named in full in the reader's
 * language ("Thursday, 12 November"): a moment inside it, the minute before
 * the offer ends. A day, not a countdown.
 */
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

/** The refusals that mean this streak can no longer be restored at all. */
const GONE = new Set(['NOTHING_TO_RESTORE', 'RESTORE_EXPIRED', 'STREAK_TOO_SHORT']);

/**
 * The offer to bring back the streak that ended: one sentence saying which
 * streak and through which day, and one button with the price in gems — or
 * that it is free, for a Hevalo+ member's restore of the month.
 *
 * When the gems are known to be short the button is there but cannot be
 * pressed, and above it are the balance and one line on where gems come from.
 * Nothing is sold here. The server decides: the request carries nothing, and
 * a refusal is read for what it means — the balance read again if the gems
 * were short after all, and, if the streak can no longer be restored, a plain
 * sentence in place of the offer, with no button left to press.
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
    // `ok` is about the status code, not the shape
    if (res.ok && typeof res.data?.balances?.gems === 'number') setGems(res.data.balances.gems);
  }, [client]);

  // a free restore needs no balance; a priced one says it only when the gems are short
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

  // short only once the balance is known; until then the button is live and the server answers
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

/** The restored streak's fire: framed in a square this big inside the glow it arrives in. */
const BACK_FIRE = 72;

/**
 * The streak, back: its fire arriving the way anything earned arrives here
 * (`CelebrationArt` and `useCelebrationMoment` — the art springs in, a ring
 * widens once, a few flecks, a buzz on a phone and the reward chime), then
 * the words. For a reader who asked for less motion the fire simply fades in.
 * The headline takes the focus the button had, so a screen reader says it.
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
    // a click on it while it plays skips to the end
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

/** Each stage's fire on the ladder, framed to fill a square this big: a spark as plain as the Newroz fire, each telling by what it has, and every row as tall. */
const RUNG_FIRE = 44;

/**
 * The fire's stages from the spark to the Newroz fire (shared `fireLadder`),
 * each a small fire with its name and the day it comes: the ones reached
 * burning with a check, the one burning now ringed and marked "Now", the
 * ones ahead standing still and dimmed — something to look forward to.
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
