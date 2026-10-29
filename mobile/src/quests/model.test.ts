import { describe, expect, it } from 'vitest';
import { claimProblem } from './model';

describe('claimProblem', () => {
  it('tells offline, already open and not finished apart from anything else', () => {
    expect(claimProblem({ kind: 'network', message: 'down' })).toBe('offline');
    expect(claimProblem({ kind: 'client', code: 'QUEST_CLAIMED', message: 'claimed', status: 409 })).toBe('claimed');
    expect(claimProblem({ kind: 'client', code: 'QUEST_NOT_DONE', message: 'not done', status: 409 })).toBe('notDone');
    expect(claimProblem({ kind: 'client', code: 'NOT_FOUND', message: 'gone', status: 404 })).toBe('failed');
    expect(claimProblem({ kind: 'server', message: 'oops', status: 500 })).toBe('failed');
  });
});
