import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { CheckIcon, CoinIcon, GemIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { haptic } from '../lib/haptics';
import type { ClaimResult, DailyRewardStatus } from '../lib/types';
import { dailyAction } from './today';

/**
 * Today's Zêr inside the daily view: the day's reward with a claim button (POST /rewards/daily/claim, the server sets
 * the amount), a lesson first until one is finished today, or tomorrow once taken, and the week's cycle as a quiet row of
 * coins. A claim pops the coin with its sparks (styles/motion.css) once. A Hevalo+ member sees the gems a claim adds.
 */
export function DailyZer({ daily, onClaimed }: { daily: DailyRewardStatus; onClaimed: (daily: DailyRewardStatus) => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The claim made here, which the coin's pop and the line under it are keyed to.
  const [landed, setLanded] = useState<ClaimResult | null>(null);
  const action = dailyAction(daily);

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

  const words = landed
    ? t('daily.claimed', { amount: number(landed.reward) })
    : action === 'claim'
      ? t('daily.dayReward', { day: number(daily.claimableDay), amount: number(daily.reward) })
      : action === 'learnFirst'
        ? t('daily.learnFirst', { amount: number(daily.reward) })
        : t('daily.comeBack');
  // What a claim adds for a member before it, and what this one added after it.
  const plusGems = landed ? (landed.plusGems ?? 0) : action === 'claim' ? (daily.plusGems ?? 0) : 0;
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
          {t('daily.title')}
        </h3>
        <p className="daily-zer-line" role={landed ? 'status' : undefined}>
          {words}
        </p>
        {daily.schedule.length > 0 && (
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
          <Link to="/app/learn" className="btn btn-secondary btn-sm">
            {t('daily.goLearn')}
          </Link>
        ) : (
          <span className="daily-zer-done" aria-hidden="true">
            <CheckIcon size={18} />
          </span>
        )}
      </div>
      {plusGems > 0 && (
        <p className="daily-zer-plus">
          <GemIcon size={16} />
          {t('daily.plusGems', { count: number(plusGems) })}
        </p>
      )}
      {problem && (
        <p className="daily-zer-problem" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
