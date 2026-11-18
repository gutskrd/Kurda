import type { IpReputation } from './score.js';

export interface IpReputationResult {
  reputation: IpReputation;
  /** campus / café / carrier-NAT range — softens IP volume, never device volume */
  sharedNetwork: boolean;
}

/**
 * Provider-agnostic IP reputation (datacenter, VPN, known-abuse lists). Real providers would implement this seam; the
 * auth boundary must degrade gracefully when a lookup fails (see {@link safeLookup}).
 */
export interface IpReputationProvider {
  lookup(ip: string): Promise<IpReputationResult>;
}

/** A provider returning a fixed result (clean and non-shared by default), for tests and as the neutral case. */
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
 * Looks up an address, degrading to a neutral result (clean, non-shared) on any error or with no provider, so a
 * reputation outage never hard-blocks sign-ups; velocity and CAPTCHA still apply.
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
