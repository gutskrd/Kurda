import { describe, expect, it } from 'vitest';
import {
  confirmationValid,
  CONFIRM_PHRASE,
  deletionReducer,
  initDeletionState,
  reauthMethod,
  type AuthProvider,
  type DeletionAction,
  type DeletionState,
} from './deletion.js';

function run(provider: AuthProvider, ...actions: DeletionAction[]): DeletionState {
  return actions.reduce(deletionReducer, initDeletionState(provider));
}

describe('reauthMethod', () => {
  it('is password for email and a provider token for Apple/Google', () => {
    expect(reauthMethod('email')).toBe('password');
    expect(reauthMethod('apple')).toBe('provider-token');
    expect(reauthMethod('google')).toBe('provider-token');
  });
});

describe('confirmationValid', () => {
  it('matches the phrase case-insensitively and trimmed', () => {
    expect(confirmationValid('DELETE')).toBe(true);
    expect(confirmationValid('  delete ')).toBe(true);
    expect(confirmationValid('Delete')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(confirmationValid('remove')).toBe(false);
    expect(confirmationValid('')).toBe(false);
  });

  it('accepts a localized expected phrase', () => {
    expect(confirmationValid('jêbirin', 'JÊBIRIN')).toBe(true);
  });
});

describe('deletionReducer — happy path', () => {
  it('warning → reauth → confirm → deleting → done', () => {
    const s = run(
      'apple',
      { type: 'start' },
      { type: 'reauthSucceeded' },
      { type: 'submitConfirm', input: CONFIRM_PHRASE },
      { type: 'deleteSucceeded' },
    );
    expect(s.step).toBe('done');
    expect(s.error).toBeUndefined();
  });

  it('starts on the warning step', () => {
    expect(initDeletionState('google').step).toBe('warning');
  });
});

describe('deletionReducer — errors', () => {
  it('a failed re-auth goes to error and can retry', () => {
    const failed = run('email', { type: 'start' }, { type: 'reauthFailed' });
    expect(failed).toMatchObject({ step: 'error', error: 'reauth-failed' });
    const retried = deletionReducer(failed, { type: 'start' });
    expect(retried.step).toBe('reauth');
    expect(retried.error).toBeUndefined();
  });

  it('a mismatched confirmation stays on confirm with a transient error', () => {
    const s = run('email', { type: 'start' }, { type: 'reauthSucceeded' }, { type: 'submitConfirm', input: 'nope' });
    expect(s.step).toBe('confirm');
    expect(s.error).toBe('confirmation-mismatch');
  });

  it('a failed delete goes to error', () => {
    const s = run(
      'google',
      { type: 'start' },
      { type: 'reauthSucceeded' },
      { type: 'submitConfirm', input: 'delete' },
      { type: 'deleteFailed' },
    );
    expect(s).toMatchObject({ step: 'error', error: 'delete-failed' });
  });
});

describe('deletionReducer — cancel + terminal', () => {
  it('cancel aborts back to the warning from a non-terminal step', () => {
    const s = run('apple', { type: 'start' }, { type: 'reauthSucceeded' }, { type: 'cancel' });
    expect(s.step).toBe('warning');
  });

  it('cancel does nothing once done', () => {
    const done = run(
      'apple',
      { type: 'start' },
      { type: 'reauthSucceeded' },
      { type: 'submitConfirm', input: 'DELETE' },
      { type: 'deleteSucceeded' },
    );
    expect(deletionReducer(done, { type: 'cancel' }).step).toBe('done');
  });

  it('ignores out-of-order actions', () => {
    // deleteSucceeded before we ever reached deleting
    const s = run('email', { type: 'deleteSucceeded' });
    expect(s.step).toBe('warning');
  });
});
