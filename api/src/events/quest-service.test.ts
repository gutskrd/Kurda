import { describe, expect, it, vi } from 'vitest';
import { QuestService, type EventLookup, type QuestMetrics } from './quest-service.js';
import type { EventDef } from './window.js';

function event(over: Partial<EventDef> = {}): EventDef {
  return {
    id: 'e1',
    key: 'newroz-2026',
    name: 'Newroz',
    type: 'cultural',
    startsAt: '2026-03-21T00:00:00.000Z',
    endsAt: '2026-03-24T00:00:00.000Z',
    priority: 10,
    theme: 'newroz',
    quests: [
      { id: 'xp', type: 'earn_xp', count: 300, reward: { zer: 150 } },
      { id: 'wins', type: 'story_quizzes', count: 3, reward: { zer: 300 } },
    ],
    rewards: {},
    enabled: true,
    ...over,
  };
}

const lookup = (e: EventDef | null): EventLookup => ({ byKey: async () => e });

function fakeMetrics(over: Partial<Record<keyof QuestMetrics, number>> = {}): QuestMetrics {
  return {
    earnedXp: async () => over.earnedXp ?? 0,
    storyQuizzes: async () => over.storyQuizzes ?? 0,
    lessonsCompleted: async () => over.lessonsCompleted ?? 0,
  };
}

/** Fake pool: records claim rows in-memory, honoring the unique constraint; the learner is a member unless told otherwise. */
function fakePool(member = true) {
  const claims = new Set<string>();
  const calls: string[] = [];
  const pool = {
    connect: async () => ({
      query: async (sql: string, params?: unknown[]) => {
        if (/SELECT quest_id/i.test(sql)) return { rows: [...claims].map((q) => ({ quest_id: q })), rowCount: claims.size };
        if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [], rowCount: 0 };
        // an account the economy pays, with nothing earned yet today, so the daily cap leaves the whole reward
        if (/AS blocked/.test(sql)) return { rows: [{ blocked: false }], rowCount: 1 };
        if (/AS member/.test(sql)) return { rows: [{ member }], rowCount: 1 };
        if (/all_today/.test(sql)) return { rows: [{ all_today: '0', reason_today: '0', reason_count: 0, recent: false }], rowCount: 1 };
        if (/INSERT INTO event_quest_claims/i.test(sql)) {
          const id = String(params![2]);
          if (claims.has(id)) return { rows: [], rowCount: 0 };
          claims.add(id);
          return { rows: [{ id: 'row' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => {},
    }),
    query: async (sql: string) => {
      calls.push(sql);
      if (/SELECT quest_id/i.test(sql)) return { rows: [...claims].map((q) => ({ quest_id: q })), rowCount: claims.size };
      if (/AS member/.test(sql)) return { rows: [{ member }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  return { pool: pool as never, claims };
}

describe('QuestService.progress', () => {
  const now = () => new Date('2026-03-22T00:00:00.000Z'); // mid-event

  it('reports capped progress, completion, and claimability', async () => {
    const { pool } = fakePool();
    const svc = new QuestService(pool, lookup(event()), {} as never, fakeMetrics({ earnedXp: 300, storyQuizzes: 1 }), now);
    const view = (await svc.progress('u1', 'newroz-2026'))!;
    expect(view.quests.find((q) => q.id === 'xp')).toMatchObject({ current: 300, complete: true, claimable: true, claimed: false });
    expect(view.quests.find((q) => q.id === 'wins')).toMatchObject({ current: 1, complete: false, claimable: false });
    expect(view.claimDeadline).toBe('2026-03-27T00:00:00.000Z'); // endsAt + 72h
  });

  it('shows a member each quest’s Zêr, and anyone else none, with a word that it is for members', async () => {
    const member = (await new QuestService(fakePool().pool, lookup(event()), {} as never, fakeMetrics(), now).progress('u1', 'newroz-2026'))!;
    expect(member.quests.map((q) => q.reward)).toEqual([{ zer: 150 }, { zer: 300 }]);
    expect(member.zerForMembers).toBe(false);
    const free = (await new QuestService(fakePool(false).pool, lookup(event()), {} as never, fakeMetrics(), now).progress('u1', 'newroz-2026'))!;
    expect(free.quests.map((q) => q.reward)).toEqual([{}, {}]);
    expect(free.zerForMembers).toBe(true);
  });

  it('returns null for an unknown event', async () => {
    const { pool } = fakePool();
    const svc = new QuestService(pool, lookup(null), {} as never, fakeMetrics(), now);
    expect(await svc.progress('u1', 'nope')).toBeNull();
  });
});

describe('QuestService.claim', () => {
  const now = () => new Date('2026-03-22T00:00:00.000Z');

  it('pays its Zêr once and is idempotent on re-claim', async () => {
    const { pool } = fakePool();
    const creditWithin = vi.fn(async () => ({ balance: 0, duplicate: false }));
    const svc = new QuestService(pool, lookup(event()), { creditWithin } as never, fakeMetrics({ storyQuizzes: 3 }), now);

    const first = await svc.claim('u1', 'newroz-2026', 'wins');
    expect(first).toEqual({ ok: true, claimed: true, reward: { zer: 300 } });
    expect(creditWithin).toHaveBeenCalledTimes(1);
    expect(creditWithin).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ currency: 'zer', amount: 300, reason: 'event_quest' }));

    const second = await svc.claim('u1', 'newroz-2026', 'wins');
    expect(second).toEqual({ ok: true, claimed: false, reward: { zer: 300 } });
    expect(creditWithin).toHaveBeenCalledTimes(1); // no double pay
  });

  it('claims for someone who is not a member, paying nothing', async () => {
    const { pool } = fakePool(false);
    const creditWithin = vi.fn(async () => ({ balance: 0, duplicate: false }));
    const svc = new QuestService(pool, lookup(event()), { creditWithin } as never, fakeMetrics({ storyQuizzes: 3 }), now);
    expect(await svc.claim('u1', 'newroz-2026', 'wins')).toEqual({ ok: true, claimed: true, reward: {} });
    expect(creditWithin).not.toHaveBeenCalled();
  });

  it('refuses an incomplete quest and an unknown quest', async () => {
    const { pool } = fakePool();
    const svc = new QuestService(pool, lookup(event()), { creditWithin: vi.fn() } as never, fakeMetrics({ storyQuizzes: 1 }), now);
    expect(await svc.claim('u1', 'newroz-2026', 'wins')).toEqual({ ok: false, code: 'NOT_COMPLETE' });
    expect(await svc.claim('u1', 'newroz-2026', 'ghost')).toEqual({ ok: false, code: 'NO_QUEST' });
  });

  it('refuses after the 72h grace window closes', async () => {
    const { pool } = fakePool();
    const late = () => new Date('2026-03-28T00:00:00.000Z'); // > endsAt + 72h
    const svc = new QuestService(pool, lookup(event()), { creditWithin: vi.fn() } as never, fakeMetrics({ storyQuizzes: 5 }), late);
    expect(await svc.claim('u1', 'newroz-2026', 'wins')).toEqual({ ok: false, code: 'GRACE_EXPIRED' });
  });
});
