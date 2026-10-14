import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigation } from '@react-navigation/native';
import { badgeDef } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useUserEvents } from '../realtime/useUserEvents';
import { ClayButton } from '../theme/glass';
import { useI18n } from '../i18n/I18nContext';
import { BadgeMedal } from '../ranks/art';
import { Celebration } from '../ranks/Celebration';
import { FLECKS } from '../ranks/motion';
import { badgeTint } from '../ranks/tint';
import { getUnseenBadges, markBadgesSeen } from '../ranks/api';
import { badgeLabel, badgeMeaning, badgeName, badgeTextKey, tierLabel } from './format';
import { enqueue, fromEvent, fromUnseen, seenId, type PendingBadge } from './queue';

/**
 * Holding the badges back while something else is being celebrated: a rank
 * result counting up, a tier's own moment. The badge earned by the same game
 * waits until that is over, then has its turn (contract 4 §U: "badge tier-ups
 * queued after").
 */
interface Gate {
  hold: () => () => void;
}
const GateContext = createContext<Gate | null>(null);

/** While `active`, no badge is celebrated; released when it turns false or the caller goes. */
export function useCelebrationHold(active: boolean): void {
  const gate = useContext(GateContext);
  useEffect(() => {
    if (!active || !gate) return;
    return gate.hold();
  }, [active, gate]);
}

/**
 * A moment between the unlock and the celebration, so a badge earned by the
 * game that just ended does not jump in front of that game's own result
 * before the result has had a chance to hold it back.
 */
const SETTLE_MS = 1200;

/**
 * Celebrates each badge as it is earned, once (contract 4 §B2): from
 * `badge_unlocked` on the app's one realtime connection, and from the unlocks
 * not yet seen when the app opens (it was closed when they happened). One at
 * a time, the highest tier of a badge only, never while another celebration
 * holds them back; each is marked seen on the server when it is closed, so
 * the browser does not celebrate it a second time.
 */
export function BadgeCelebrationHost({ children }: { children: ReactNode }): React.JSX.Element {
  const { client } = useAuth();
  const [queue, setQueue] = useState<PendingBadge[]>([]);
  const [holds, setHolds] = useState(0);
  const [ready, setReady] = useState(false);
  const seen = useRef(new Set<string>());

  const add = useCallback((items: PendingBadge[]) => {
    setQueue((q) => enqueue(q, items.filter((i) => badgeDef(i.key) !== undefined), seen.current));
  }, []);

  useEffect(() => {
    let live = true;
    void getUnseenBadges(client).then((res) => {
      if (live && res.ok) add(res.data.unseen.map(fromUnseen));
    });
    return () => {
      live = false;
    };
  }, [client, add]);

  useUserEvents(
    useCallback(
      (event) => {
        if (event.type === 'badge_unlocked' && typeof event.key === 'string' && typeof event.tier === 'number') add([fromEvent(event)]);
      },
      [add],
    ),
  );

  const head = queue[0] ?? null;
  // a new head waits a moment before it shows (see SETTLE_MS)
  useEffect(() => {
    setReady(false);
    if (!head) return;
    const id = setTimeout(() => setReady(true), SETTLE_MS);
    return () => clearTimeout(id);
  }, [head]);

  const gate = useMemo<Gate>(
    () => ({
      hold: () => {
        setHolds((h) => h + 1);
        let released = false;
        return () => {
          if (released) return;
          released = true;
          setHolds((h) => Math.max(0, h - 1));
        };
      },
    }),
    [],
  );

  const close = useCallback(() => {
    if (!head) return;
    for (let tier = 1; tier <= head.tier; tier++) seen.current.add(seenId({ key: head.key, tier }));
    void markBadgesSeen(client, [head.key]);
    setQueue((q) => q.slice(1));
  }, [client, head]);

  return (
    <GateContext.Provider value={gate}>
      {children}
      {head && ready && holds === 0 ? <BadgeMoment key={seenId(head)} badge={head} onClose={close} /> : null}
    </GateContext.Provider>
  );
}

function BadgeMoment({ badge, onClose }: { badge: PendingBadge; onClose: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  const def = badgeDef(badge.key)!;
  const tierCount = def.tiers.length;
  const name = badgeName(t, badge.key);
  const meaning = badgeMeaning(t, badge.key);
  const tierWords = tierCount > 1 && badge.tierKey ? tierLabel(t, badge.tierKey) : null;
  const kicker = badge.secret ? t('badges.unlock.secret') : badge.tier > 1 && tierCount > 1 ? t('badges.unlock.tierUp') : t('badges.unlock.title');
  const label = badgeLabel(t, { key: badge.key, tier: badge.tier, tierKey: badge.tierKey, tierCount, hidden: false });
  const [light, strong] = badgeTint(tierCount > 1 ? badge.tier : 3, 'dark');
  return (
    <Celebration
      art={<BadgeMedal badgeKey={badge.key} tier={badge.tier} tierCount={tierCount} size={168} label={label} shine="loop" />}
      glow={strong}
      flecks={FLECKS.badge}
      fleckColours={[light, strong, '#ffffff']}
      seed={badge.key.length * 97 + badge.tier}
      kicker={kicker}
      title={name}
      subtitle={[meaning, tierWords].filter(Boolean).join(' · ') || null}
      note={t(badgeTextKey(badge.key, 'how'))}
      announce={`${kicker}: ${label}`}
      onClose={onClose}
      actions={
        <>
          <ClayButton label={t('badges.unlock.continue')} tone="primary" size="large" onPress={onClose} />
          <ClayButton
            label={t('badges.unlock.see')}
            variant="outline"
            size="large"
            onPress={() => {
              onClose();
              navigation.navigate('Badges');
            }}
          />
        </>
      }
    />
  );
}
