import type { IpReputation } from './score.js';

export interface IpReputationResult {
  reputation: IpReputation;
  /** campus / café / carrier-NAT range — softens IP volume, never device volume */
  sharedNetwork: boolean;
}

/**
 * Provider-agnostic IP reputation lookup (datacenter / VPN / known-abuse lists).
 * Real providers (an external reputation API, a maintained CIDR list) implement
 * this seam; the auth boundary must degrade gracefully when a lookup throws or
 * times out — see {@link safeLookup}.
 */
export interface IpReputationProvider {
  lookup(ip: string): Promise<IpReputationResult>;
}

/**
 * Default provider: treats every IP as clean, non-shared. Used until a real
 * reputation source is configured, and it is also the safe fallback value.
 */
export class StaticIpReputationProvider implements IpReputationProvider {
  constructor(
    private readonly value: IpReputationResult = { reputation: 'clean', sharedNetwork: false },
  ) {}

  async lookup(): Promise<IpReputationResult> {
    return this.value;
  }
}

const NEUTRAL: IpReputationResult = { reputation: 'clean', sharedNetwork: false };

/**
 * Look up an IP, degrading to a neutral (clean, non-shared) result on any
 * provider error or absence. Per the issue's edge case: a reputation outage
 * must never hard-block signups — the decision falls back to velocity + CAPTCHA.
 */
export async function safeLookup(
  provider: IpReputationProvider | undefined,
  ip: string,
): Promise<IpReputationResult> {
  if (!provider) return NEUTRAL;
  try {
    return await provider.lookup(ip);
  } catch {
    return NEUTRAL;
  }
}
