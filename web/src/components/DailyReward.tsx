import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ClaimResult, DailyRewardStatus, WalletBalances } from '../lib/types';
import { Button } from './Button';
import { CoinIcon } from './icons';

/**
 * Daily Zêr reward — mirrors the mobile daily claim. Shows the Zêr balance and,
 * when today's reward is claimable, a claim button (POST /rewards/daily/claim,
 * server-authoritative — the client never sets the amount).
 */
export function DailyReward(): React.JSX.Element | null {
  const { client } = useAuth();
  const [status, setStatus] = useState<DailyRewardStatus | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      client.get<DailyRewardStatus>('/rewards/daily'),
      client.get<{ balances: WalletBalances }>('/me/wallet'),
    ]).then(([s, w]) => {
      if (cancelled) return;
      if (s.ok) setStatus(s.data);
      else setFailed(true);
      if (w.ok) setBalance(w.data.balances.zer);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  async function claim(): Promise<void> {
    setBusy(true);
    setMsg(null);
    const res = await client.post<ClaimResult>('/rewards/daily/claim');
    setBusy(false);
    if (res.ok) {
      setBalance(res.data.balance);
      setStatus((s) => (s ? { ...s, canClaim: false, alreadyClaimedToday: true } : s));
      setMsg(`+${res.data.reward} Zêr claimed!`);
    } else {
      setMsg(describeError(res.error));
    }
  }

  // Don't render a broken tile if the reward status can't be loaded.
  if (failed && balance === null) return null;

  const canClaim = status?.canClaim ?? false;

  return (
    <div className="zer-card">
      <div className="zer-left">
        <span className="zer-coin" aria-hidden="true">
          <CoinIcon size={26} />
        </span>
        <div>
          <div className="zer-balance">
            {balance === null ? '—' : balance.toLocaleString()} <span className="zer-unit">Zêr</span>
          </div>
          <div className="zer-sub">
            {canClaim
              ? `Day ${status?.claimableDay} reward: +${status?.reward} Zêr`
              : 'Come back tomorrow for more Zêr.'}
          </div>
        </div>
      </div>
      <div className="zer-action">
        {canClaim ? (
          <Button onClick={claim} disabled={busy}>
            {busy ? 'Claiming…' : 'Claim daily Zêr'}
          </Button>
        ) : (
          <span className="badge badge-gold">Claimed today</span>
        )}
      </div>
      {msg && (
        <div className="zer-msg" role="status">
          {msg}
        </div>
      )}
    </div>
  );
}
