// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { SectionToggles } from './SectionToggles';

/*
 * Which sections your profile shows (profile/SectionToggles.tsx): each is a
 * row that is its switch, so its words turn it as well as the switch does.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

function open() {
  const client = fakeClient({
    'GET /users/me': ok({ sections: { likes: false } }),
    'PATCH /me/profile/sections': (body) => ok({ sections: { likes: false, ...(body as object) } }),
  });
  testAuth.client = client;
  renderWithProviders(<SectionToggles userId="me" />);
  return client;
}

describe('the sections your profile shows', () => {
  it('turns a section off from a tap on its words, and saves just that one', async () => {
    const client = open();
    const posts = await screen.findByRole('switch', { name: 'Posts' });
    expect(posts.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByText('Everything you have posted: sayings, stories, poems, photos and memes.'));

    await waitFor(() => expect(screen.getByRole('switch', { name: 'Posts' }).getAttribute('aria-checked')).toBe('false'));
    expect(client.calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ posts: false }]);
  });

  it('is one switch to a screen reader for each section, in the state the server keeps', async () => {
    open();
    await screen.findByRole('switch', { name: 'Posts' });
    expect(screen.getAllByRole('switch')).toHaveLength(5);
    expect(screen.getByRole('switch', { name: 'Likes' }).getAttribute('aria-checked')).toBe('false');
  });
});
