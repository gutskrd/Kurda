import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { badgeDef, type BadgeUnlockedEvent, type BadgeTierKey, type UnseenBadge } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import { useInvitesQuiet } from '../play/quietInvites';
import { useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { Celebration, useCelebrationsHeld } from '../ranks/Celebration';
import { badgeDesc, badgeNamed, badgeTierNamed, withMeaning } from '../ranks/names';
import { Medal } from './parts';

/** One unlock waiting to be celebrated. */
export interface Unlock {
  key: string;
  tier: number;
  tierKey: BadgeTierKey | null;
  secret: boolean;
}

/**
 * The badge celebration, anywhere in the app (contract 4 §B2, §U).
 *
 * An unlock arrives as `badge_unlocked` while the app is open; the ones that
 * arrived while it was closed are asked for once on opening
 * (`GET /me/badges/unseen`). They are shown one at a time, oldest first, and
 * each is marked seen when it is put away — so a celebration someone closed
 * the tab on comes back next time, and one they saw never does.
 *
 * Never on top of a game being played, and never over a game's own result:
 * both hold the queue until they are done.
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
        // the same badge again (a second tier while the first is showing): the higher one stands
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
  // a single badge has no ladder: it is drawn in gold, but it is not "Zêr"
  const tiered = (badgeDef(current.key)?.tiers.length ?? 1) > 1;
  const tierName = tiered && current.tierKey ? badgeTierNamed(t, current.tierKey).name : null;
  const title = named.name;

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
          <Link to="/app/badges" className="celebrate-link" onClick={done}>
            {t('badges.seeAll')}
          </Link>
        </>
      }
      action={queue.length > 1 ? t('badges.next') : t('rankResult.continue')}
      onClose={done}
    />
  );
}
