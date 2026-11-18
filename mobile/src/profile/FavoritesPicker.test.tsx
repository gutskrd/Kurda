// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { LibraryPost } from '../library/types';
import { FavoritesPicker } from './FavoritesPicker';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const poem = (id: string, title: string): LibraryPost =>
  ({ id, authorId: 'me', authorRole: 'user', type: 'poem', title, body: 'Çend gotin.', status: 'published', language: 'kmr' }) as LibraryPost;

describe('choosing a favourite poem', () => {
  it('shows the choice at once, then puts it back with the reason when the server refuses', async () => {
    let answer: (r: unknown) => void = () => undefined;
    const onChanged = vi.fn();
    const client = fakeClient({
      'GET /library/posts?type=poem&limit=50': ok({ posts: [poem('p1', 'Şev'), poem('p2', 'Bihar')] }),
      'PUT /me/favorites/poem': () => new Promise((resolve) => (answer = resolve)),
    } as never);
    testAuth.client = client;
    renderWithProviders(<FavoritesPicker favoritePoem={{ id: 'p1', title: 'Şev' }} favoriteStory={null} onChanged={onChanged} />);
    const poems = screen.getByText('Favourite poem').parentElement!;
    fireEvent.click(within(poems).getByRole('button', { name: 'Change' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bihar' }));
    // Chosen before the server has answered, and the list folds away.
    expect(within(poems).getByText('Bihar')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Şev' })).toBeNull();
    expect(client.calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([{ postId: 'p2' }]);
    await act(async () => answer({ ok: false, error: { kind: 'network', message: 'network request failed' } }));
    expect(within(poems).getByText('Şev')).toBeTruthy();
    expect(within(poems).getByText('Can’t reach Hevalo right now. Check your connection and try again.')).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
