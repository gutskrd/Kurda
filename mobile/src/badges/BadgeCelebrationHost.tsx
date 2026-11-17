import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigation } from '@react-navigation/native';
import { badgeDef } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useUserEvents } from '../realtime/useUserEvents';
import { ClayButton } from '../theme/glass';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { BadgeMedal } from '../ranks/art';
import { Celebration } from '../ranks/Celebration';
import { FLECKS } from '../ranks/motion';
import { badgeTint } from '../ranks/tint';
import { getUnseenBadges, markBadgesSeen } from '../ranks/api';
import { ShareWin } from '../share/ShareWin';
import { badgeShare } from '../share/winText';
import { badgeLabel, badgeMeaning, badgeName, badgeTextKey, nextTierLine, tierLabel, unitWord } from './format';
import { enqueue, fromEvent, fromUnseen, seenId, type PendingBadge } from './queue';

/**
 * Holds badges back while something else is celebrated (a rank result counting up, a tier's moment); a badge from
 * the same game waits its turn.
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

const NONE: ReadonlySet<string> = new Set();
const FreshContext = createContext<ReadonlySet<string>>(NONE);

/**
 * Badges unlocked since the app opened, by key: those waiting at start and those earned while open, celebrated or
 * not. They count as new until the next launch, so the Badges page and profile showcase mark them "New" (NewChip)
 * without asking the server.
 */
export function useFreshBadges(): ReadonlySet<string> {
  return useContext(FreshContext);
}

/**
 * A pause between unlock and celebration, so a badge from the game that just ended does not jump ahead of that
 * game's result before it can hold it back.
 */
const SETTLE_MS = 1200;

/**
 * Celebrates each badge once as it is earned: from `badge_unlocked` on the realtime connection, and from unlocks
 * not yet seen at launch. One at a time, only a badge's highest tier, never while another celebration holds them
 * back; each is marked seen on the server when closed, so the web app does not celebrate it again. A quiet Share
 * sits under the two ways on (share/ShareWin.tsx); sharing neither closes the moment nor marks the badge seen.
 */
export function BadgeCelebrationHost({ children }: { children: ReactNode }): React.JSX.Element {
  const { client } = useAuth();
  const [queue, setQueue] = useState<PendingBadge[]>([]);
  const [holds, setHolds] = useState(0);
  const [ready, setReady] = useState(false);
  // Every badge that arrived new this session, kept after its celebration for the "New" chips.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(NONE);
  const seen = useRef(new Set<string>());
  // Unlocks earned while the app was open get the haptic as they are celebrated; ones waiting from before are only shown.
  const live = useRef(new Set<string>());

  const add = useCallback((items: PendingBadge[]) => {
    const known = items.filter((i) => badgeDef(i.key) !== undefined);
    setQueue((q) => enqueue(q, known, seen.current));
    setFresh((f) => {
      if (known.every((i) => f.has(i.key))) return f;
      const next = new Set(f);
      for (const i of known) next.add(i.key);
      return next;
    });
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
        if (event.type === 'badge_unlocked' && typeof event.key === 'string' && typeof event.tier === 'number') {
          const badge = fromEvent(event);
          live.current.add(seenId(badge));
          add([badge]);
        }
      },
      [add],
    ),
  );

  const head = queue[0] ?? null;
  // A new head waits a moment before it shows (see SETTLE_MS).
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
      <FreshContext.Provider value={fresh}>
        {children}
        {head && ready && holds === 0 ? (
          <BadgeMoment key={seenId(head)} badge={head} felt={live.current.has(seenId(head))} onClose={close} />
        ) : null}
      </FreshContext.Provider>
    </GateContext.Provider>
  );
}

function BadgeMoment({ badge, felt, onClose }: { badge: PendingBadge; felt: boolean; onClose: () => void }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { t, locale } = useI18n();
  const n = (v: number): string => formatNumber(v, locale);
  const def = badgeDef(badge.key)!;
  const tierCount = def.tiers.length;
  const name = badgeName(t, badge.key);
  const meaning = badgeMeaning(t, badge.key);
  const tierWords = tierCount > 1 && badge.tierKey ? tierLabel(t, badge.tierKey) : null;
  const kicker = badge.secret ? t('badges.unlock.secret') : badge.tier > 1 && tierCount > 1 ? t('badges.unlock.tierUp') : t('badges.unlock.title');
  const label = badgeLabel(t, { key: badge.key, tier: badge.tier, tierKey: badge.tierKey, tierCount, hidden: false });
  const [light, strong] = badgeTint(tierCount > 1 ? badge.tier : 3, 'dark');
  // What this tier took: "30 days", "25 wins" (a single badge has no number to name).
  const threshold = tierCount > 1 ? def.tiers[badge.tier - 1] : undefined;
  const reached = typeof threshold === 'number' ? `${n(threshold)} ${unitWord(t, def.unit, threshold)}` : null;
  // And the tier after it, so a new goal is in view the moment this one is won.
  const next = badge.secret ? null : nextTierLine(t, badge.key, badge.tier, n);
  return (
    <Celebration
      art={<BadgeMedal badgeKey={badge.key} tier={badge.tier} tierCount={tierCount} size={168} label={label} shine="once" />}
      glow={strong}
      flecks={FLECKS.badge}
      fleckColours={[light, strong, '#ffffff']}
      seed={badge.key.length * 97 + badge.tier}
      kicker={kicker}
      title={name}
      subtitle={[meaning, tierWords].filter(Boolean).join(' · ') || null}
      detail={reached}
      note={[t(badgeTextKey(badge.key, 'how')), next].filter(Boolean).join('\n')}
      announce={`${kicker}: ${label}`}
      onClose={onClose}
      felt={felt}
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
          {/* Under the ways on and quieter than either: the badge's name and the site's address, nothing about who earned it. */}
          <ShareWin text={badgeShare(t, name)} testID="badge-share" />
        </>
      }
    />
  );
}
