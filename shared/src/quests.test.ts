import { describe, expect, it } from 'vitest';
import { justDone, nextChest, questRows, waitingRows, withOpened, type Quest, type QuestDay, type QuestStep } from './quests.js';

const day: QuestDay = {
  date: '2026-10-29',
  monthDone: 4,
  waiting: [],
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
const earlier: Quest = { id: '2026-10-27:lessons', kind: 'lessons', target: 2, progress: 2, chest: 'rare', claimable: true, claimed: false };

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

  it('shows only what the session moved when the day did not load, never past a target', () => {
    const rows = questRows(null, [steps[0]!, { ...steps[1]!, to: 70 }]);
    expect(rows.map((r) => r.id)).toEqual(['d:streak', 'd:xp']);
    expect(rows[1]).toEqual({ id: 'd:xp', kind: 'xp', target: 40, chest: 'rare', from: 10, to: 40, claimable: false, claimed: false });
  });

  it('never runs a bar backwards or past its end', () => {
    const over: QuestDay = { ...day, quests: [{ ...day.quests[1]!, progress: 60 }] };
    expect(questRows(over, [{ ...steps[1]!, from: 50 }])[0]).toMatchObject({ from: 40, to: 40 });
  });
});

describe('waitingRows', () => {
  it('lists the chests of earlier days as rows that do not move, and none from an older server', () => {
    expect(waitingRows({ ...day, waiting: [earlier] })).toEqual([
      { id: '2026-10-27:lessons', kind: 'lessons', target: 2, chest: 'rare', from: 2, to: 2, claimable: true, claimed: false },
    ]);
    expect(waitingRows(day)).toEqual([]);
    expect(waitingRows({})).toEqual([]);
    expect(waitingRows(null)).toEqual([]);
  });
});

describe('justDone', () => {
  it('is a quest the session took to its target, not one finished before it', () => {
    const [streak, xp, perfect] = questRows(day, steps);
    expect(justDone(streak!)).toBe(true);
    expect(justDone(xp!)).toBe(false);
    expect(justDone(perfect!)).toBe(false);
  });
});

describe('withOpened', () => {
  it('marks the chests opened since the day was read, and leaves the others', () => {
    const rows = withOpened(questRows(day), ['d:streak']);
    expect(rows[0]).toMatchObject({ claimable: false, claimed: true });
    expect(rows[2]).toMatchObject({ claimable: true, claimed: false });
    expect(withOpened(rows, new Set<string>())).toEqual(rows);
  });
});

describe('nextChest', () => {
  it('opens the chests waiting in the order listed, and none once all are open', () => {
    const rows = questRows(day, steps);
    expect(nextChest(rows)?.id).toBe('d:streak');
    expect(nextChest(rows, 'd:streak')?.id).toBe('d:perfect');
    expect(nextChest(withOpened(rows, ['d:streak', 'd:perfect']))).toBeNull();
  });

  it('comes round to a chest above the one just opened, and goes on to the earlier days after today', () => {
    expect(nextChest(withOpened(questRows(day, steps), ['d:perfect']), 'd:perfect')?.id).toBe('d:streak');
    const all = [...questRows(day), ...waitingRows({ ...day, waiting: [earlier] })];
    expect(nextChest(all, 'd:perfect')?.id).toBe('2026-10-27:lessons');
  });
});
