import { describe, expect, it } from 'vitest';
import type { QuestDay, QuestStep } from '@kurda/shared';
import { claimProblem, justDone, markOpened, nextChest, questRows } from './model';

const day: QuestDay = {
  date: '2026-10-29',
  monthDone: 4,
  quests: [
    { id: 'd:streak', kind: 'streak', target: 1, progress: 1, chest: 'common', claimable: true, claimed: false },
    { id: 'd:xp', kind: 'xp', target: 40, progress: 25, chest: 'rare', claimable: false, claimed: false },
    { id: 'd:perfect', kind: 'perfect', target: 1, progress: 1, chest: 'epic', claimable: true, claimed: false },
  ],
};
const steps: QuestStep[] = [
  { id: 'd:streak', kind: 'streak', target: 1, chest: 'common', from: 0, to: 1, claimable: true },
  { id: 'd:xp', kind: 'xp', target: 40, chest: 'rare', from: 10, to: 25, claimable: false },
];

describe('questRows', () => {
  it('lists the day as the server does, each quest moved from where the session found it', () => {
    const rows = questRows(day, steps);
    expect(rows.map((r) => [r.id, r.from, r.to])).toEqual([
      ['d:streak', 0, 1],
      ['d:xp', 10, 25],
      ['d:perfect', 1, 1],
    ]);
    expect(rows[0]!.claimable).toBe(true);
  });

  it('shows only what the session moved when the day did not load', () => {
    const rows = questRows(null, steps);
    expect(rows.map((r) => r.id)).toEqual(['d:streak', 'd:xp']);
    expect(rows[1]).toMatchObject({ kind: 'xp', target: 40, from: 10, to: 25, claimed: false });
  });

  it('never runs a bar backwards or past its end', () => {
    const over: QuestDay = { ...day, quests: [{ ...day.quests[1]!, progress: 60 }] };
    expect(questRows(over, [{ ...steps[1]!, from: 50 }])[0]).toMatchObject({ from: 40, to: 40 });
  });
});

describe('justDone', () => {
  it('is a quest the session took over its target', () => {
    const [streak, xp, perfect] = questRows(day, steps);
    expect(justDone(streak!)).toBe(true);
    expect(justDone(xp!)).toBe(false);
    // finished before this session
    expect(justDone(perfect!)).toBe(false);
  });
});

describe('nextChest', () => {
  it('opens the chests waiting in the order the card lists them, and none once all are open', () => {
    const rows = questRows(day, steps);
    expect(nextChest(rows)?.id).toBe('d:streak');
    expect(nextChest(rows, 'd:streak')?.id).toBe('d:perfect');
    const opened = markOpened(markOpened(rows, 'd:streak'), 'd:perfect');
    expect(nextChest(opened)).toBeNull();
    expect(opened[0]).toMatchObject({ claimable: false, claimed: true });
  });

  it('comes round to a chest above the one just opened', () => {
    const rows = markOpened(questRows(day, steps), 'd:perfect');
    expect(nextChest(rows, 'd:perfect')?.id).toBe('d:streak');
  });
});

describe('claimProblem', () => {
  it('tells offline, already open and not finished apart from anything else', () => {
    expect(claimProblem({ kind: 'network', message: 'down' })).toBe('offline');
    expect(claimProblem({ kind: 'client', code: 'QUEST_CLAIMED', message: 'claimed', status: 409 })).toBe('claimed');
    expect(claimProblem({ kind: 'client', code: 'QUEST_NOT_DONE', message: 'not done', status: 409 })).toBe('notDone');
    expect(claimProblem({ kind: 'client', code: 'NOT_FOUND', message: 'gone', status: 404 })).toBe('failed');
    expect(claimProblem({ kind: 'server', message: 'oops', status: 500 })).toBe('failed');
  });
});
