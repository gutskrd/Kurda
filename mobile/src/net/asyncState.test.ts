import { describe, expect, it } from 'vitest';
import { deriveAsyncState } from './asyncState';
import type { ApiError } from '../api/types';

const netErr: ApiError = { kind: 'network', message: 'network request failed' };
const serverErr: ApiError = { kind: 'server', message: 'boom', status: 500 };
const clientErr: ApiError = { kind: 'client', message: 'bad input', status: 400 };

describe('deriveAsyncState', () => {
  it('never spins forever while offline (offline beats loading)', () => {
    expect(deriveAsyncState({ loading: true, online: false })).toEqual({ kind: 'offline' });
  });

  it('shows loading only when online with no error', () => {
    expect(deriveAsyncState({ loading: true, online: true })).toEqual({ kind: 'loading' });
  });

  it('maps a network error to offline, a server error to retryable error', () => {
    expect(deriveAsyncState({ loading: false, online: true, error: netErr })).toEqual({ kind: 'offline' });
    const s = deriveAsyncState({ loading: false, online: true, error: serverErr });
    expect(s.kind).toBe('error');
    if (s.kind === 'error') {
      expect(s.retryable).toBe(true);
      expect(s.message.length).toBeGreaterThan(10);
    }
  });

  it('treats any error as offline when the device is offline', () => {
    expect(deriveAsyncState({ loading: false, online: false, error: serverErr })).toEqual({ kind: 'offline' });
  });

  it('surfaces a non-retryable client error as error', () => {
    const s = deriveAsyncState({ loading: false, online: true, error: clientErr });
    expect(s.kind).toBe('error');
    if (s.kind === 'error') expect(s.retryable).toBe(false);
  });

  it('shows empty vs offline-with-no-content, and ready otherwise', () => {
    expect(deriveAsyncState({ loading: false, online: true, isEmpty: true })).toEqual({ kind: 'empty' });
    expect(deriveAsyncState({ loading: false, online: false, isEmpty: true })).toEqual({ kind: 'offline' });
    expect(deriveAsyncState({ loading: false, online: true, isEmpty: false })).toEqual({ kind: 'ready' });
  });
});
