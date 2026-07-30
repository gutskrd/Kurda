import { describe, expect, it } from 'vitest';
import {
  evaluate,
  REFUND_ABUSE_THRESHOLD,
  VELOCITY_MAX_PER_HOUR,
  type FraudSignals,
} from './rules.js';

const clean: FraudSignals = {
  purchasesLastHour: 1,
  refundsAfterSpend: 0,
  receiptReusedAcrossAccounts: false,
  familyShared: false,
};

describe('fraud evaluate', () => {
  it('passes a normal purchase', () => {
    expect(evaluate(clean)).toEqual({ flagged: false, hold: false, flags: [] });
  });

  it('flags velocity above the hourly cap', () => {
    const v = evaluate({ ...clean, purchasesLastHour: VELOCITY_MAX_PER_HOUR + 1 });
    expect(v.flags).toContain('VELOCITY');
    expect(v.hold).toBe(true);
    // exactly at the cap is still fine
    expect(evaluate({ ...clean, purchasesLastHour: VELOCITY_MAX_PER_HOUR }).flagged).toBe(false);
  });

  it('flags a refund-after-spend pattern at the threshold', () => {
    expect(evaluate({ ...clean, refundsAfterSpend: REFUND_ABUSE_THRESHOLD }).flags).toContain('REFUND_ABUSE');
    expect(evaluate({ ...clean, refundsAfterSpend: REFUND_ABUSE_THRESHOLD - 1 }).flagged).toBe(false);
  });

  it('flags receipt reuse across accounts', () => {
    expect(evaluate({ ...clean, receiptReusedAcrossAccounts: true }).flags).toContain('RECEIPT_REUSE');
  });

  it('does NOT flag reuse for family-shared receipts', () => {
    const v = evaluate({ ...clean, receiptReusedAcrossAccounts: true, familyShared: true });
    expect(v.flags).not.toContain('RECEIPT_REUSE');
    expect(v.flagged).toBe(false);
  });

  it('accumulates multiple flags', () => {
    const v = evaluate({
      purchasesLastHour: VELOCITY_MAX_PER_HOUR + 5,
      refundsAfterSpend: REFUND_ABUSE_THRESHOLD,
      receiptReusedAcrossAccounts: true,
      familyShared: false,
    });
    expect(v.flags.sort()).toEqual(['RECEIPT_REUSE', 'REFUND_ABUSE', 'VELOCITY']);
  });
});
