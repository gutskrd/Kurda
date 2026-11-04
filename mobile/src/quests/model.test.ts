import { describe, expect, it } from 'vitest';
import { claimProblem, monthProgress } from './model';

describe('claimProblem', () => {
  it('tells offline, already open and not finished apart from anything else', () => {
    expect(claimProblem({ kind: 'network', message: 'down' })).toBe('offline');
    expect(claimProblem({ kind: 'client', code: 'QUEST_CLAIMED', message: 'claimed', status: 409 })).toBe('claimed');
    expect(claimProblem({ kind: 'client', code: 'QUEST_NOT_DONE', message: 'not done', status: 409 })).toBe('notDone');
    expect(claimProblem({ kind: 'client', code: 'NOT_FOUND', message: 'gone', status: 404 })).toBe('failed');
    expect(claimProblem({ kind: 'server', message: 'oops', status: 500 })).toBe('failed');
  });
});

describe('monthProgress', () => {
  it('measures the month’s quests against three a day up to the learner’s own today', () => {
    expect(monthProgress({ date: '2026-10-29', monthDone: 7 })).toEqual({ done: 7, possible: 87, share: 7 / 87 });
    expect(monthProgress({ date: '2026-11-01', monthDone: 3 })).toEqual({ done: 3, possible: 3, share: 1 });
    expect(monthProgress({ date: '2026-11-04', monthDone: 0 })).toEqual({ done: 0, possible: 12, share: 0 });
  });

  it('is simply full when the tally outruns the days, and reads an unparseable day as the first', () => {
    expect(monthProgress({ date: '2026-11-02', monthDone: 9 })).toEqual({ done: 9, possible: 9, share: 1 });
    expect(monthProgress({ date: 'today', monthDone: 2 })).toEqual({ done: 2, possible: 3, share: 2 / 3 });
  });
});
