/**
 * Whether an account is the same person as a banned one, from the signals they share: pure, so the table below is the
 * whole rule and its tests are the specification.
 *
 * | What the account shares with one banned account                                  | Strength | What happens   |
 * |-----------------------------------------------------------------------------------|----------|----------------|
 * | the normalised email address, a sign-in provider subject, or the phone number     | identity | refused        |
 * | an install id the banned person used within 180 days                              | strong   | held, queued   |
 * | a push token the banned person's phone had                                        | strong   | held, queued   |
 * | two medium signals, at least one with the same time zone and language             | strong   | held, queued   |
 * | a quiet network the banned person used, within 7 days of the ban, with the same   | medium   | queued         |
 * |   time zone and language                                                          |          |                |
 * | a quiet network the banned person used, on 2 or more separate days                | medium   | queued         |
 * | a network alone, or any busy, shared or trusted network (schools, carriers, VPNs) | weak     | nothing        |
 *
 * A network is never enough by itself to hold or refuse anyone: on its own it is at most medium, which only asks a
 * person to look, and two network signals make a hold only when one also matches time zone and language. A pair a
 * moderator said is not the same person is never scored again (returns.ts).
 */

export const RETURN_SIGNAL_KINDS = ['email', 'oauth', 'phone', 'device', 'push', 'network_near_ban', 'network_repeated', 'network'] as const;
export type ReturnSignalKind = (typeof RETURN_SIGNAL_KINDS)[number];

export type SignalStrength = 'identity' | 'strong' | 'medium' | 'weak';
export type ReturnLevel = 'same_identity' | 'strong' | 'medium' | 'none';

/** How long after a ban a new account on the banned person's network counts as near it. */
export const NEAR_BAN_DAYS = 7;
/** Separate days on the banned person's network that count as repeatedly. */
export const REPEATED_DAYS = 2;
/** How far back a banned person's install id counts. */
export const DEVICE_WINDOW_DAYS = 180;

/** What was observed about one network the two share. */
export interface NetworkFacts {
  /** few established accounts use it, and nobody vouched for it as shared (not busy, not trusted, not a known VPN) */
  quiet: boolean;
  /** days between the ban and the account showing up there; null when not after the ban */
  daysAfterBan: number | null;
  /** separate days the account was there */
  separateDays: number;
  sameTimeZone: boolean;
  sameLanguage: boolean;
}

/** One signal as observed, before it is weighed. */
export interface ObservedSignal {
  kind: ReturnSignalKind;
  /** when it was last seen (ISO) */
  at: string;
  /** for an install id: days since the banned person last used it */
  ageDays?: number;
  network?: NetworkFacts;
}

export interface WeighedSignal extends ObservedSignal {
  strength: SignalStrength;
}

/** One signal's strength, by the table above. */
export function signalStrength(s: ObservedSignal): SignalStrength {
  switch (s.kind) {
    case 'email':
    case 'oauth':
    case 'phone':
      return 'identity';
    case 'device':
      return s.ageDays === undefined || s.ageDays <= DEVICE_WINDOW_DAYS ? 'strong' : 'weak';
    case 'push':
      return 'strong';
    case 'network_near_ban': {
      const n = s.network;
      if (!n?.quiet || n.daysAfterBan === null || n.daysAfterBan < 0 || n.daysAfterBan > NEAR_BAN_DAYS) return 'weak';
      return n.sameTimeZone && n.sameLanguage ? 'medium' : 'weak';
    }
    case 'network_repeated': {
      const n = s.network;
      return n?.quiet && n.separateDays >= REPEATED_DAYS ? 'medium' : 'weak';
    }
    case 'network':
      return 'weak';
  }
}

/** A medium signal that is more than a network: it also matched time zone and language. */
function corroborated(s: WeighedSignal): boolean {
  return s.strength === 'medium' && s.network?.sameTimeZone === true && s.network.sameLanguage === true;
}

/** The verdict for one banned account, with each signal weighed; the strongest first. */
export function scoreReturn(signals: readonly ObservedSignal[]): { level: ReturnLevel; signals: WeighedSignal[] } {
  const rank: Record<SignalStrength, number> = { identity: 3, strong: 2, medium: 1, weak: 0 };
  const weighed = signals
    .map((s) => ({ ...s, strength: signalStrength(s) }))
    .sort((a, b) => rank[b.strength] - rank[a.strength] || b.at.localeCompare(a.at));
  if (weighed.some((s) => s.strength === 'identity')) return { level: 'same_identity', signals: weighed };
  if (weighed.some((s) => s.strength === 'strong')) return { level: 'strong', signals: weighed };
  const medium = weighed.filter((s) => s.strength === 'medium');
  if (medium.length >= 2 && medium.some(corroborated)) return { level: 'strong', signals: weighed };
  if (medium.length >= 1) return { level: 'medium', signals: weighed };
  return { level: 'none', signals: weighed };
}

/** The higher of two levels. */
export function strongerLevel(a: ReturnLevel, b: ReturnLevel): ReturnLevel {
  const rank: Record<ReturnLevel, number> = { same_identity: 3, strong: 2, medium: 1, none: 0 };
  return rank[a] >= rank[b] ? a : b;
}
