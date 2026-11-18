// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { SectionToggles } from './SectionToggles';

/* Which sections your profile shows: each is a row that is its switch, so its words toggle it too. */

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

  it('moves at once, ends rapid taps on the last one, and puts a refused one back with the reason', async () => {
    const answers: ((r: unknown) => void)[] = [];
    const client = fakeClient({
      'GET /users/me': ok({ sections: {} }),
      'PATCH /me/profile/sections': () => new Promise((resolve) => answers.push(resolve)),
    } as never);
    testAuth.client = client;
    renderWithProviders(<SectionToggles userId="me" />);
    const posts = () => screen.getByRole('switch', { name: 'Posts' });
    await screen.findByRole('switch', { name: 'Posts' });
    fireEvent.click(posts());
    fireEvent.click(posts());
    fireEvent.click(posts());
    expect(posts().getAttribute('aria-checked')).toBe('false');
    const sent = () => client.calls.filter((c) => c.method === 'PATCH').map((c) => c.body);
    expect(sent()).toEqual([{ posts: false }]);
    // Three taps end on off, which is what went, so nothing more is sent.
    await act(async () => answers[0]!(ok({ sections: { posts: false } })));
    expect(sent()).toEqual([{ posts: false }]);
    expect(posts().getAttribute('aria-checked')).toBe('false');
    fireEvent.click(posts());
    expect(posts().getAttribute('aria-checked')).toBe('true');
    await act(async () => answers[1]!({ ok: false, error: { kind: 'network', message: 'network request failed' } }));
    expect(posts().getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Can’t reach Hevalo right now. Check your connection and try again.')).toBeTruthy();
  });

  it('is one switch to a screen reader for each section, in the state the server keeps', async () => {
    open();
    await screen.findByRole('switch', { name: 'Posts' });
    expect(screen.getAllByRole('switch')).toHaveLength(5);
    expect(screen.getByRole('switch', { name: 'Likes' }).getAttribute('aria-checked')).toBe('false');
  });
});
