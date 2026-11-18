// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Linking } from 'react-native';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { BookCard } from './BookCard';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * The book card on Learn says how many chapters it holds and opens the PDF; with no chapter online, or no book on
 * the server, there is no card.
 */
describe('Hevalo’s book on Learn', () => {
  it('opens the PDF of the chapters that are online', async () => {
    testAuth.client = fakeClient({ 'GET /books/road': ok({ chapters: [1, 2] }) });
    const opened = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderWithProviders(<BookCard />);
    fireEvent.click(await screen.findByRole('link', { name: /^Hevalo’s book\. 2 chapters of the road, to keep or print/ }));
    expect(opened).toHaveBeenCalledWith('http://api.test/books/road.pdf');
  });

  it('says one chapter when there is one', async () => {
    testAuth.client = fakeClient({ 'GET /books/road': ok({ chapters: [1] }) });
    renderWithProviders(<BookCard />);
    expect(await screen.findByText(/^Chapter 1 of the road, to keep or print: Hamo’s story/)).toBeTruthy();
  });

  it('is not there before any chapter is online, nor on a server without the book', async () => {
    for (const client of [fakeClient({ 'GET /books/road': ok({ chapters: [] }) }), fakeClient()]) {
      testAuth.client = client;
      renderWithProviders(<BookCard />);
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByTestId('book-card')).toBeNull();
      expect(client.calls.map((c) => c.path)).toEqual(['/books/road']);
      cleanup();
    }
  });
});
