import { describe, expect, it } from 'vitest';
import {
  lessonCompletionXp,
  BASE_LESSON_XP,
  ACCURACY_BONUS_XP,
  XpService,
} from './service.js';

describe('lessonCompletionXp', () => {
  it('pays base + full accuracy bonus for a perfect first pass', () => {
    expect(lessonCompletionXp(1, false)).toBe(BASE_LESSON_XP + ACCURACY_BONUS_XP);
  });

  it('pays only the base when nothing is correct', () => {
    expect(lessonCompletionXp(0, false)).toBe(BASE_LESSON_XP);
  });

  it('scales the bonus with accuracy (rounded)', () => {
    expect(lessonCompletionXp(0.5, false)).toBe(BASE_LESSON_XP + 5);
    expect(lessonCompletionXp(0.34, false)).toBe(BASE_LESSON_XP + 3);
  });

  it('clamps out-of-range accuracy', () => {
    expect(lessonCompletionXp(2, false)).toBe(BASE_LESSON_XP + ACCURACY_BONUS_XP);
    expect(lessonCompletionXp(-1, false)).toBe(BASE_LESSON_XP);
  });

  it('decays a repeat to a quarter, never below 1', () => {
    expect(lessonCompletionXp(1, true)).toBe(5); // round(20 * 0.25)
    expect(lessonCompletionXp(0, true)).toBe(Math.max(1, Math.round(BASE_LESSON_XP * 0.25)));
  });
});

describe('XpService.award (unit, mocked executor)', () => {
  const userId = '00000000-0000-0000-0000-000000000001';

  function fakeExecutor(insertRowCount: number) {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const executor = {
      query: async (text: string, values: unknown[]) => {
        calls.push({ text, values });
        if (text.includes('INSERT INTO xp_ledger')) {
          return { rowCount: insertRowCount, rows: insertRowCount ? [{ amount: values[2] }] : [] };
        }
        return { rowCount: 1, rows: [] };
      },
    };
    return { executor, calls };
  }

  it('returns the amount and bumps the total on a fresh insert', async () => {
    const { executor, calls } = fakeExecutor(1);
    const svc = new XpService({} as never);
    const awarded = await svc.award({ userId, source: 'lesson_complete', amount: 20, refId: 's1' }, executor as never);
    expect(awarded).toBe(20);
    expect(calls.some((c) => c.text.includes('UPDATE users SET xp'))).toBe(true);
  });

  it('awards 0 and never touches the total on a duplicate', async () => {
    const { executor, calls } = fakeExecutor(0);
    const svc = new XpService({} as never);
    const awarded = await svc.award({ userId, source: 'lesson_complete', amount: 20, refId: 's1' }, executor as never);
    expect(awarded).toBe(0);
    expect(calls.some((c) => c.text.includes('UPDATE users SET xp'))).toBe(false);
  });

  it('rejects non-positive or non-integer amounts', async () => {
    const { executor, calls } = fakeExecutor(1);
    const svc = new XpService({} as never);
    expect(await svc.award({ userId, source: 's', amount: 0 }, executor as never)).toBe(0);
    expect(await svc.award({ userId, source: 's', amount: -5 }, executor as never)).toBe(0);
    expect(await svc.award({ userId, source: 's', amount: 1.5 }, executor as never)).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
