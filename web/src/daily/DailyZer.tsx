import { useEffect, useState } from 'react';
import { reactionDelayMs } from '@kurda/shared';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { CheckIcon, CoinIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { haptic } from '../lib/haptics';
import { prefersReducedMotion } from '../lib/motion';
import { sayReactionLater } from '../characters/reactions';
import type { ClaimResult, DailyRewardStatus } from '../lib/types';
import { dailyAction } from './today';
import { giftMeaning } from '@kurda/shared';
import { plusPitchAllowed } from '../gifts/nudges';
import type { LearnState } from '../learn/CoursePath';

/**
 * Today's Zêr inside the daily view: the day's reward with a claim button (POST /rewards/daily/claim, the server sets
 * the amount), a lesson first until one is finished today, or tomorrow once taken, and the week's cycle as a quiet row of
 * coins. A claim pops the coin with its sparks (styles/motion.css) once, and Xezo says a word for it. A Hevalo+ member
 * gets the Zêr (`hasDailyZer`); everyone gets a small gift for the gift bag with the claim, said with it, and a free
 * account the server knows is an adult hears with its claim that members also earn Zêr here, while Hevalo+ is on sale.
 */
/** Asks the road to bring the lesson to do now into view (learn/CoursePath.tsx). */
const TO_LESSON: LearnState = { toLesson: true };

/** Whether this learner has the daily Zêr at all: a Hevalo+ member's, read from an older server as before. */
export function hasDailyZer(daily: Pick<DailyRewardStatus, 'member'>): boolean {
  return daily.member !== false;
}

export function DailyZer({
  daily,
  onClaimed,
  onLearn,
}: {
  daily: DailyRewardStatus;
  onClaimed: (daily: DailyRewardStatus) => void;
  /** Closes what holds this view as "Go to Learn" is pressed, since on Learn itself the page does not change. */
  onLearn?: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const member = hasDailyZer(daily);
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The claim made here, which the coin's pop and the line under it are keyed to.
  const [landed, setLanded] = useState<ClaimResult | null>(null);
  const action = dailyAction(daily);
  useEffect(() => (landed ? sayReactionLater(reactionDelayMs('celebration', prefersReducedMotion()), { moment: 'daily-zer' }) : undefined), [landed]);

  async function claim(): Promise<void> {
    setBusy(true);
    setProblem(null);
    const res = await client.post<ClaimResult>('/rewards/daily/claim');
    setBusy(false);
    if (!res.ok) {
      setProblem(describeError(res.error, t));
      return;
    }
    setLanded(res.data);
    haptic('celebrate');
    onClaimed({ ...daily, canClaim: false, alreadyClaimedToday: true, cycleDay: res.data.cycleDay });
  }

  const gift = landed?.bagGift ?? null;
  const giftWords = gift ? t('daily.gift.landed', { item: giftMeaning(gift.sku, locale) ? `${gift.name} (${giftMeaning(gift.sku, locale)})` : gift.name }) : null;
  const words = member
    ? landed
      ? t('daily.claimed', { amount: number(landed.reward) })
      : action === 'claim'
        ? t('daily.dayReward', { day: number(daily.claimableDay), amount: number(daily.reward) })
        : action === 'learnFirst'
          ? t('daily.learnFirst', { amount: number(daily.reward) })
          : t('daily.comeBack')
    : landed
      ? (giftWords ?? t('daily.gift.full'))
      : action === 'claim'
        ? t('daily.gift.claim')
        : action === 'learnFirst'
          ? t('daily.gift.learnFirst')
          : t('daily.comeBack');
  // The cycle's days taken so far, counting today's once it is claimed.
  const taken = action === 'claimed' ? daily.cycleDay : daily.claimableDay - 1;

  return (
    <section className={`daily-zer is-${action}`} aria-labelledby="daily-zer-title">
      <span className={`zer-coin${landed ? ' is-landed' : ''}`} aria-hidden="true">
        <CoinIcon size={36} />
        {landed && <span className="zer-burst" />}
      </span>
      <div className="daily-zer-words">
        <h3 className="daily-zer-title" id="daily-zer-title">
          {t(member ? 'daily.title' : 'daily.gift.title')}
        </h3>
        <p className="daily-zer-line" role={landed ? 'status' : undefined}>
          {words}
        </p>
        {/* a member hears of the bag's gift beside the Zêr; a known adult without it, with the claim, that members also earn Zêr here */}
        {member && giftWords && <p className="daily-zer-line">{giftWords}</p>}
        {!member && landed && plusPitchAllowed(landed.nudges) && <p className="daily-zer-line daily-zer-pitch">{t('gift.membersEarnZer')}</p>}
        {member && daily.schedule.length > 0 && (
          <span className="daily-zer-cycle" aria-hidden="true">
            {daily.schedule.map((_, i) => (
              <span key={i} className={`daily-zer-day${i < taken ? ' is-taken' : i === taken && action !== 'claimed' ? ' is-next' : ''}`} />
            ))}
          </span>
        )}
      </div>
      <div className="daily-zer-action">
        {action === 'claim' ? (
          <Button size="sm" onClick={() => void claim()} disabled={busy}>
            {busy ? t('daily.claiming') : t('daily.claimNow')}
          </Button>
        ) : action === 'learnFirst' ? (
          <Link to="/app/learn" state={TO_LESSON} className="btn btn-secondary btn-sm" onClick={onLearn}>
            {t('daily.goLearn')}
          </Link>
        ) : (
          <span className="daily-zer-done" aria-hidden="true">
            <CheckIcon size={18} />
          </span>
        )}
      </div>
      {problem && (
        <p className="daily-zer-problem" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
