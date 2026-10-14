import type { BadgeTierKey, BadgeUnlockedEvent, UnseenBadge } from '@kurda/shared';

/**
 * The badges waiting to be celebrated, one at a time and each once (no React
 * Native). Unlocks arrive two ways — `badge_unlocked` on the realtime channel
 * while the app is open, and `GET /me/badges/unseen` when it opens — and the
 * same unlock can arrive both ways, so a badge at a tier is one entry however
 * it came. A higher tier of a badge already waiting replaces it: two pop-ups
 * for Agir's copper and silver in the same minute is one too many.
 */
export interface PendingBadge {
  key: string;
  tier: number;
  tierKey: BadgeTierKey | null;
  secret: boolean;
}

export function fromEvent(e: BadgeUnlockedEvent): PendingBadge {
  return { key: e.key, tier: e.tier, tierKey: e.tierKey, secret: e.secret };
}

export function fromUnseen(u: UnseenBadge): PendingBadge {
  return { key: u.key, tier: u.tier, tierKey: u.tierKey, secret: u.secret };
}

/** The queue with `items` added: one entry per badge, at its highest tier, in arrival order. */
export function enqueue(queue: readonly PendingBadge[], items: readonly PendingBadge[], seen: ReadonlySet<string>): PendingBadge[] {
  const out = [...queue];
  for (const item of items) {
    if (seen.has(seenId(item))) continue;
    const at = out.findIndex((q) => q.key === item.key);
    if (at === -1) out.push(item);
    else if (item.tier > out[at]!.tier) out[at] = item;
  }
  return out;
}

/** What marks an unlock as already celebrated in this session. */
export function seenId(b: Pick<PendingBadge, 'key' | 'tier'>): string {
  return `${b.key}#${b.tier}`;
}
