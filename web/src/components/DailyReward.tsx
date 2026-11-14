import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ClaimResult, DailyRewardStatus, WalletBalances } from '../lib/types';
import { Button } from './Button';
import { CoinIcon, GemIcon } from './icons';
import { useT } from '../i18n/I18nProvider';
import { haptic } from '../lib/haptics';
import { useCountUp } from '../lib/motion';

/**
 * Daily Zêr reward — mirrors the mobile daily claim. Shows the Zêr balance and,
 * when today's reward is claimable, a claim button (POST /rewards/daily/claim,
 * server-authoritative — the client never sets the amount).
 *
 * The reward is paid for learning: until a lesson or practice session has been
 * finished today, the tile says so and points at Learn rather than offering a
 * claim the server would refuse.
 *
 * A Hevalo+ member's claim also brings a few gems. The tile says so in one
 * quiet line: what the claim adds while it is there to take, and what it added
 * once it has been. Nobody else sees the line at all.
 *
 * While the claim is there to take, its button is the one filled button the
 * page should have: `onClaimWaiting` tells the page so, and the page quietens
 * what would compete with it (the wall's +, pages/Civak.tsx).
 */
export function DailyReward({ onClaimWaiting }: { onClaimWaiting?: (waiting: boolean) => void } = {}): React.JSX.Element | null {
  const t = useT();
  const { client } = useAuth();
  const [status, setStatus] = useState<DailyRewardStatus | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // the gems this claim added for a member; null until a claim has been made here
  const [plusClaimed, setPlusClaimed] = useState<number | null>(null);
  // how many claims have landed here (one a day, so one): what the coin's pop and its sparks are keyed by
  const [landed, setLanded] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      client.get<DailyRewardStatus>('/rewards/daily'),
      client.get<{ balances: WalletBalances }>('/me/wallet'),
    ]).then(([s, w]) => {
      if (cancelled) return;
      if (s.ok) setStatus(s.data);
      else setFailed(true);
      // `ok` is about the status code, not the shape: a 200 whose body is not
      // what we expect would otherwise throw here, unhandled, and take the
      // whole home page's reward panel with it
      if (w.ok) setBalance(w.data?.balances?.zer ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const [countFrom, setCountFrom] = useState<number | null>(null);
  const shown = useCountUp(balance ?? 0, { from: countFrom ?? balance ?? 0 });

  async function claim(): Promise<void> {
    setBusy(true);
    setMsg(null);
    const res = await client.post<ClaimResult>('/rewards/daily/claim');
    setBusy(false);
    if (res.ok) {
      // it lands: the coin pops with its sparks (styles/motion.css), and a phone gives its small buzz
      setLanded((n) => n + 1);
      haptic('celebrate');
      // the balance counts up from what it was to what it is now (lib/motion.ts)
      setCountFrom(balance);
      setBalance(res.data.balance);
      setStatus((s) => (s ? { ...s, canClaim: false, alreadyClaimedToday: true } : s));
      setMsg(t('daily.claimed', { amount: res.data.reward }));
      setPlusClaimed(res.data.plusGems ?? 0);
    } else {
      setMsg(describeError(res.error, t));
    }
  }

  const canClaim = status?.canClaim ?? false;
  // the page is told while a claim waits, and when it no longer does
  useEffect(() => {
    onClaimWaiting?.(canClaim);
  }, [canClaim, onClaimWaiting]);

  // Don't render a broken tile if the reward status can't be loaded.
  if (failed && balance === null) return null;
  // a day already claimed when the page opened has nothing to say here: the balance is in the top bar, and
  // the card steps aside for the wall; one claimed on this page stays to say what it brought
  if (status?.alreadyClaimedToday && landed === 0) return null;

  // explicitly false only: an older server sends no learnedToday at all
  const learnFirst = status !== null && !status.alreadyClaimedToday && status.learnedToday === false;
  // what a claim adds for a member, before it; what this one added, after it
  const plusGems = canClaim ? (status?.plusGems ?? 0) : (plusClaimed ?? 0);

  return (
    <div className="zer-card">
      <div className="zer-left">
        <span className={`zer-coin${landed > 0 ? ' is-landed' : ''}`} aria-hidden="true">
          <CoinIcon size={40} />
          {landed > 0 && <span key={landed} className="zer-burst" />}
        </span>
        <div>
          <div className="zer-balance">
            {balance === null ? '—' : shown.toLocaleString()} <span className="zer-unit">Zêr</span>
          </div>
          <div className="zer-sub">
            {canClaim
              ? t('daily.dayReward', { day: status?.claimableDay ?? 1, amount: status?.reward ?? 0 })
              : learnFirst
                ? t('daily.learnFirst', { amount: status?.reward ?? 0 })
                : t('daily.comeBack')}
          </div>
        </div>
      </div>
      <div className="zer-action">
        {canClaim ? (
          <Button onClick={claim} disabled={busy}>
            {busy ? t('daily.claiming') : t('daily.claim')}
          </Button>
        ) : learnFirst ? (
          <Link to="/app/learn" className="btn btn-secondary">
            {t('daily.goLearn')}
          </Link>
        ) : (
          <span className="badge badge-gold">{t('daily.claimedToday')}</span>
        )}
      </div>
      {msg && (
        <div className="zer-msg" role="status">
          {msg}
        </div>
      )}
      {plusGems > 0 && (
        <div className="zer-msg zer-plus">
          <GemIcon size={16} />
          {t('daily.plusGems', { count: plusGems })}
        </div>
      )}
    </div>
  );
}
