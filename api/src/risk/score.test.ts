import { describe, expect, it } from 'vitest';
import {
  actionForBand,
  assessRisk,
  computeRiskScore,
  exceedsSignupCap,
  HIGH_RISK_THRESHOLD,
  MAX_ACCOUNTS_PER_DEVICE,
  MAX_ACCOUNTS_PER_IP,
  MAX_ACCOUNTS_PER_SHARED_IP,
  MEDIUM_RISK_THRESHOLD,
  riskBand,
  type RiskSignals,
} from './score.js';

const clean = (over: Partial<RiskSignals> = {}): RiskSignals => ({
  ipReputation: 'clean',
  deviceKnownGood: false,
  accountsFromDeviceRecently: 1,
  accountsFromIpRecently: 1,
  disposableEmail: false,
  velocityPerMin: 1,
  geoMismatch: false,
  sharedNetwork: false,
  ...over,
});

describe('computeRiskScore', () => {
  it('a clean first-time signup scores 0 (low)', () => {
    expect(computeRiskScore(clean())).toBe(0);
  });

  it('malicious IP + disposable email scores high', () => {
    const score = computeRiskScore(clean({ ipReputation: 'malicious', disposableEmail: true }));
    expect(score).toBeGreaterThanOrEqual(HIGH_RISK_THRESHOLD);
  });

  it('a known-good device lowers the score', () => {
    const base = computeRiskScore(clean({ ipReputation: 'suspicious' }));
    const withDevice = computeRiskScore(
      clean({ ipReputation: 'suspicious', deviceKnownGood: true }),
    );
    expect(withDevice).toBeLessThan(base);
  });

  it('device volume counts at full weight even on a shared network', () => {
    const normal = computeRiskScore(clean({ accountsFromDeviceRecently: 3 }));
    const shared = computeRiskScore(clean({ accountsFromDeviceRecently: 3, sharedNetwork: true }));
    expect(shared).toBe(normal); // device is not discounted by sharedNetwork
    expect(normal).toBeGreaterThan(0);
  });

  it('IP volume is softened on a shared network', () => {
    const normal = computeRiskScore(clean({ accountsFromIpRecently: 6 }));
    const shared = computeRiskScore(clean({ accountsFromIpRecently: 6, sharedNetwork: true }));
    expect(shared).toBeLessThan(normal);
  });

  it('clamps to the 0–100 range', () => {
    const maxed = computeRiskScore(
      clean({
        ipReputation: 'malicious',
        disposableEmail: true,
        accountsFromDeviceRecently: 20,
        velocityPerMin: 100,
        geoMismatch: true,
      }),
    );
    expect(maxed).toBeLessThanOrEqual(100);
    const floored = computeRiskScore(clean({ deviceKnownGood: true }));
    expect(floored).toBeGreaterThanOrEqual(0);
  });
});

describe('riskBand / actionForBand', () => {
  it('bands by threshold', () => {
    expect(riskBand(0)).toBe('low');
    expect(riskBand(MEDIUM_RISK_THRESHOLD)).toBe('medium');
    expect(riskBand(HIGH_RISK_THRESHOLD)).toBe('high');
  });

  it('maps bands to escalating actions', () => {
    expect(actionForBand('low')).toBe('proceed');
    expect(actionForBand('medium')).toBe('step_up');
    expect(actionForBand('high')).toBe('verify_or_block');
  });
});

describe('exceedsSignupCap', () => {
  it('blocks when the per-device cap is exceeded', () => {
    const cap = exceedsSignupCap(clean({ accountsFromDeviceRecently: MAX_ACCOUNTS_PER_DEVICE + 1 }));
    expect(cap).toMatchObject({ device: true, blocked: true });
  });

  it('blocks when the per-IP cap is exceeded', () => {
    const cap = exceedsSignupCap(clean({ accountsFromIpRecently: MAX_ACCOUNTS_PER_IP + 1 }));
    expect(cap).toMatchObject({ ip: true, blocked: true });
  });

  it('raises the IP cap on a shared network', () => {
    const busyCampus = clean({ accountsFromIpRecently: MAX_ACCOUNTS_PER_IP + 5, sharedNetwork: true });
    expect(exceedsSignupCap(busyCampus).ip).toBe(false); // under the shared cap
    const abusive = clean({
      accountsFromIpRecently: MAX_ACCOUNTS_PER_SHARED_IP + 1,
      sharedNetwork: true,
    });
    expect(exceedsSignupCap(abusive).ip).toBe(true);
  });
});

describe('assessRisk', () => {
  it('proceeds on a clean signup', () => {
    expect(assessRisk(clean())).toMatchObject({ band: 'low', action: 'proceed', hardBlock: false });
  });

  it('steps up a medium-risk signup', () => {
    // suspicious IP (20) + geo mismatch (10) = 30 → medium
    const a = assessRisk(clean({ ipReputation: 'suspicious', geoMismatch: true }));
    expect(a.band).toBe('medium');
    expect(a.action).toBe('step_up');
  });

  it('forces verify-or-block when a cap is exceeded, regardless of score', () => {
    // low score signals but device cap exceeded
    const a = assessRisk(
      clean({ accountsFromDeviceRecently: MAX_ACCOUNTS_PER_DEVICE + 1, deviceKnownGood: true }),
    );
    expect(a.hardBlock).toBe(true);
    expect(a.action).toBe('verify_or_block');
  });
});
