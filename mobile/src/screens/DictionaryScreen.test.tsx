// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { Alert } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { ApiResult } from '../api/types';
import type { SavedWord } from '../dictionary/types';
import { DictionaryScreen } from './DictionaryScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const word = (entryId: string, headword: string, definitionEn: string): SavedWord => ({
  entryId,
  headword,
  pos: 'noun',
  definitionEn,
  definitionKu: null,
  savedAt: '2026-10-01T10:00:00Z',
});
const SAVED = [word('e1', 'mal', 'house'), word('e2', 'av', 'water'), word('e3', 'nan', 'bread')];

// the saved words as the list shows them, top to bottom
const headwords = () => screen.getAllByRole('button', { name: /^Remove / }).map((b) => b.getAttribute('aria-label')?.replace('Remove ', ''));

describe('the saved words', () => {
  it('takes a word off the list once the server has let it go', async () => {
    testAuth.client = fakeClient({ 'GET /me/saved-words': ok({ words: SAVED }), 'DELETE /dictionary/entries/e2/save': ok({ saved: false }) });
    renderWithProviders(<DictionaryScreen onBack={() => undefined} />);
    await screen.findByText('av');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove av' }));
    });
    expect(headwords()).toEqual(['mal', 'nan']);
  });

  /*
   * A word that vanished from the list while the server kept it would come
   * back the next time the screen opened: it goes back in its place now, and
   * why is said, as the entry’s own bookmark does.
   */
  it('puts the word back in its place and says why when the server did not let it go', async () => {
    const offline: ApiResult<never> = { ok: false, error: { kind: 'network', message: 'Network request failed' } };
    testAuth.client = fakeClient({ 'GET /me/saved-words': ok({ words: SAVED }), 'DELETE /dictionary/entries/e2/save': offline });
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<DictionaryScreen onBack={() => undefined} />);
    await screen.findByText('av');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove av' }));
    });
    expect(headwords()).toEqual(['mal', 'av', 'nan']);
    expect(alert).toHaveBeenCalledWith('Can’t reach Hevalo right now. Check your connection and try again.');
  });
});
