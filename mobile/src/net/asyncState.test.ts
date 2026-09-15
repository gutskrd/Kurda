import { describe, expect, it } from 'vitest';
import { deriveAsyncState } from './asyncState';
import type { ApiError } from '../api/types';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';

const netErr: ApiError = { kind: 'network', message: 'network request failed' };
const serverErr: ApiError = { kind: 'server', message: 'boom', status: 500 };
const clientErr: ApiError = { kind: 'client', message: 'bad input', status: 400 };

/** The real catalogue, so a missing sentence fails here too. */
const t = (key: TranslationKey, vars?: Record<string, string | number>): string =>
  interpolate(TRANSLATIONS.en[key], vars);

describe('deriveAsyncState', () => {
  it('never spins forever while offline (offline beats loading)', () => {
    expect(deriveAsyncState({ loading: true, online: false , t })).toEqual({ kind: 'offline' });
  });

  it('shows loading only when online with no error', () => {
    expect(deriveAsyncState({ loading: true, online: true , t })).toEqual({ kind: 'loading' });
  });

  it('maps a network error to offline, a server error to retryable error', () => {
    expect(deriveAsyncState({ loading: false, online: true, error: netErr , t })).toEqual({ kind: 'offline' });
    const s = deriveAsyncState({ loading: false, online: true, error: serverErr , t });
    expect(s.kind).toBe('error');
    if (s.kind === 'error') {
      expect(s.retryable).toBe(true);
      expect(s.message.length).toBeGreaterThan(10);
    }
  });

  it('treats any error as offline when the device is offline', () => {
    expect(deriveAsyncState({ loading: false, online: false, error: serverErr , t })).toEqual({ kind: 'offline' });
  });

  it('surfaces a non-retryable client error as error', () => {
    const s = deriveAsyncState({ loading: false, online: true, error: clientErr , t });
    expect(s.kind).toBe('error');
    if (s.kind === 'error') expect(s.retryable).toBe(false);
  });

  it('shows empty vs offline-with-no-content, and ready otherwise', () => {
    expect(deriveAsyncState({ loading: false, online: true, isEmpty: true , t })).toEqual({ kind: 'empty' });
    expect(deriveAsyncState({ loading: false, online: false, isEmpty: true , t })).toEqual({ kind: 'offline' });
    expect(deriveAsyncState({ loading: false, online: true, isEmpty: false , t })).toEqual({ kind: 'ready' });
  });
});
