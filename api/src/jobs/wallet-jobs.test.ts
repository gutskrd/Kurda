import { describe, expect, it, vi } from 'vitest';
import type pino from 'pino';
import type { ReconcileReport } from '../wallet/reconcile.js';
import { makeWalletReconcileJob, WALLET_RECONCILE_JOB_NAME } from './wallet-jobs.js';

function logger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
}

const report = (over: Partial<ReconcileReport>): ReconcileReport => ({
  checkedAt: '2026-11-05T00:00:00.000Z',
  checked: 3,
  mismatched: 0,
  mismatches: [],
  ...over,
});

describe('the wallet reconciliation job', () => {
  it('says all is well when every balance equals its ledger', async () => {
    const log = logger();
    const job = makeWalletReconcileJob({ check: async () => report({ checked: 12 }) });
    expect(job.name).toBe(WALLET_RECONCILE_JOB_NAME);
    await job.handler({}, { log: log as unknown as pino.Logger, attempt: 1 });
    expect(log.error).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith({ checked: 12 }, expect.stringContaining('every balance equals its ledger'));
  });

  it('raises an error with the accounts when one does not, and changes nothing', async () => {
    const log = logger();
    const mismatches = [{ userId: 'u1', currency: 'zer' as const, balance: 105, ledgerSum: 100 }];
    const check = vi.fn(async () => report({ mismatched: 1, mismatches }));
    await makeWalletReconcileJob({ check }).handler({}, { log: log as unknown as pino.Logger, attempt: 1 });
    expect(check).toHaveBeenCalledWith({ limit: 50 });
    expect(log.error).toHaveBeenCalledWith(
      { checked: 3, mismatched: 1, mismatches },
      expect.stringContaining('differ from their ledger'),
    );
    expect(log.info).not.toHaveBeenCalled();
  });

  it('takes no payload', () => {
    const job = makeWalletReconcileJob({ check: async () => report({}) });
    expect(job.schema.safeParse({}).success).toBe(true);
  });
});
