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
 * The daily Zêr reward, as on the phone: the balance and, when claimable, a claim button (POST /rewards/daily/claim; the
 * server sets the amount). Until a lesson or practice is finished today it points at Learn instead. A Hevalo+ member
 * sees one line about the gems the claim adds. `onClaimWaiting` tells the page while the claim button is waiting, so it
 * can quieten competing buttons (pages/Civak.tsx).
 */
export function DailyReward({ onClaimWaiting }: { onClaimWaiting?: (waiting: boolean) => void } = {}): React.JSX.Element | null {
  const t = useT();
  const { client } = useAuth();
  const [status, setStatus] = useState<DailyRewardStatus | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // The gems this claim added for a member; null until claimed here.
  const [plusClaimed, setPlusClaimed] = useState<number | null>(null);
  // Claims landed on this page, which key the coin's pop and sparks.
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
      // `ok` says nothing about the body's shape, so read it defensively rather than crash the panel.
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
      // The coin pops with its sparks (styles/motion.css), and a phone buzzes.
      setLanded((n) => n + 1);
      haptic('celebrate');
      // The balance counts up from the old value (lib/motion.ts).
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
  useEffect(() => {
    onClaimWaiting?.(canClaim);
  }, [canClaim, onClaimWaiting]);

  // Don't render a broken tile if the reward status can't be loaded.
  if (failed && balance === null) return null;
  // A day already claimed when the page opened shows nothing (the balance is in the top bar); a claim made on this page
  // stays to say what it brought.
  if (status?.alreadyClaimedToday && landed === 0) return null;

  // Explicitly false only: an older server sends no learnedToday.
  const learnFirst = status !== null && !status.alreadyClaimedToday && status.learnedToday === false;
  // What a claim adds for a member before it, and what this one added after it.
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
