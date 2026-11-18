import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { badgeDef, badgeTierKey, type BadgeUnlockedEvent, type BadgeTierKey, type UnseenBadge } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import { useInvitesQuiet } from '../play/quietInvites';
import { useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { Celebration, useCelebrationsHeld } from '../ranks/Celebration';
import type { Translate } from '../i18n/I18nProvider';
import { badgeDesc, badgeNamed, badgeTierNamed, unitWord, withMeaning } from '../ranks/names';
import { ShareWin } from '../share/ShareWin';
import { badgeShare } from '../share/winText';
import { Medal } from './parts';

/** One unlock waiting to be celebrated. */
interface Unlock {
  key: string;
  tier: number;
  tierKey: BadgeTierKey | null;
  secret: boolean;
}

/**
 * The badge celebration, anywhere in the app. Unlocks arrive live as `badge_unlocked`, and those missed while away
 * come from `GET /me/badges/unseen` on opening. They show one at a time, oldest first, each marked seen only when
 * closed. A game in play or a game's result holds the queue. The Share button names the badge, never the earner.
 */
export function BadgeCelebrations(): React.JSX.Element | null {
  const { client, status } = useAuth();
  const t = useT();
  const [queue, setQueue] = useState<Unlock[]>([]);
  const held = useCelebrationsHeld();
  const playing = useInvitesQuiet();

  const add = useCallback((more: Unlock[]) => {
    setQueue((q) => {
      const next = [...q];
      for (const u of more) {
        // The same badge again, such as a second tier while the first shows: the higher tier stands.
        const at = next.findIndex((x) => x.key === u.key);
        if (at === -1) next.push(u);
        else if (u.tier > next[at]!.tier) next[at] = u;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (status !== 'signedIn') return;
    let cancelled = false;
    void client.get<{ unseen: UnseenBadge[] }>('/me/badges/unseen').then((res) => {
      if (cancelled || !res.ok) return;
      add((res.data.unseen ?? []).map(({ key, tier, tierKey, secret }) => ({ key, tier, tierKey, secret })));
    });
    return () => {
      cancelled = true;
    };
  }, [client, status, add]);

  const onUnlocked = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as Partial<BadgeUnlockedEvent>;
      if (typeof ev.key !== 'string' || typeof ev.tier !== 'number') return;
      add([{ key: ev.key, tier: ev.tier, tierKey: ev.tierKey ?? null, secret: ev.secret === true }]);
    },
    [add],
  );
  useRealtimeEvent('badge_unlocked', onUnlocked);

  const current = queue[0];
  if (status !== 'signedIn' || !current || held || playing) return null;

  const named = badgeNamed(t, current.key);
  // A single-tier badge is drawn in gold but is not called "Zêr".
  const tiered = (badgeDef(current.key)?.tiers.length ?? 1) > 1;
  const tierName = tiered && current.tierKey ? badgeTierNamed(t, current.tierKey).name : null;
  const title = named.name;
  const next = current.secret ? null : nextTierLine(t, current.key, current.tier);

  function done(): void {
    void client.post('/me/badges/seen', { keys: [current!.key] });
    setQueue((q) => q.slice(1));
  }

  return (
    <Celebration
      key={`${current.key}:${current.tier}`}
      open
      label={withMeaning(t, named)}
      tone={current.secret ? 'secret' : (current.tierKey ?? 'zer')}
      art={
        <span className="badge-medal is-hovered">
          <Medal view={{ key: current.key, tier: current.tier }} size={168} playing />
        </span>
      }
      kicker={current.secret ? t('badges.unlockedSecret') : current.tier > 1 ? t('badges.unlockedTier') : t('badges.unlocked')}
      title={title}
      body={[named.meaning, tierName].filter(Boolean).join(' · ') || null}
      extra={
        <>
          <p className="celebrate-desc">{badgeDesc(t, current.key)}</p>
          {next && <p className="celebrate-note">{next}</p>}
          <Link to="/app/badges" className="celebrate-link" onClick={done}>
            {t('badges.seeAll')}
          </Link>
        </>
      }
      action={queue.length > 1 ? t('badges.next') : t('rankResult.continue')}
      below={<ShareWin text={badgeShare(t, named.name)} />}
      onClose={done}
    />
  );
}

/** The tier after the one just won, so the next goal is in view; null for the last tier or a single-tier badge. */
function nextTierLine(t: Translate, key: string, tier: number): string | null {
  const def = badgeDef(key);
  if (!def || tier >= def.tiers.length) return null;
  const need = def.tiers[tier]!;
  const tierKey = badgeTierKey(def, tier + 1);
  if (!tierKey) return null;
  const name = badgeTierNamed(t, tierKey).name;
  if (need === 'all') return t('badges.nextTierAll', { tier: name });
  return t('badges.nextTier', { tier: name, count: need.toLocaleString(), unit: unitWord(t, def.unit, need) });
}
