import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Reactions, type ReactionSummary } from './Reactions';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const empty: ReactionSummary = { counts: {}, total: 0, mine: null };

/**
 * Record what the component asked for, and answer with a given summary.
 *
 * /me is answered too: the provider restores the session against it, and until
 * that lands every reaction is disabled — so a click fired before it would test
 * the signed-out path by accident.
 */
function reactionFetch(reply: ReactionSummary) {
  const calls: Array<{ method: string; body: unknown }> = [];
  return {
    calls,
    fetch: vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'me' } });
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      return jsonResponse(200, reply);
    }),
  };
}

/** Signed in: the component reads auth status, and guests cannot react. */
function signIn(): void {
  localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
}

/** Wait for the session to restore, so the buttons are live before clicking. */
const ready = () => waitFor(() => expect(screen.getByTitle('Love')).toBeEnabled());

describe('Reactions', () => {
  it('sends the reaction you picked and shows what came back', async () => {
    signIn();
    const { fetch, calls } = reactionFetch({ counts: { love: 1 }, total: 1, mine: 'love' });
    vi.stubGlobal('fetch', fetch);
    renderApp(<Reactions postId="p1" initial={empty} />);
    await ready();

    await userEvent.click(screen.getByTitle('Love'));

    await waitFor(() => expect(screen.getByTitle('Love')).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByTitle('Love').textContent).toContain('1');
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).toEqual({ reaction: 'love' });
  });

  it('takes it back when you tap the one you already left', async () => {
    signIn();
    const { fetch, calls } = reactionFetch(empty);
    vi.stubGlobal('fetch', fetch);
    renderApp(<Reactions postId="p1" initial={{ counts: { like: 1 }, total: 1, mine: 'like' }} />);
    await ready();

    await userEvent.click(screen.getByTitle('Like'));

    // a second tap on your own reaction is a request to remove it, not to set
    // it again — which the API would happily accept as a no-op
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await waitFor(() => expect(screen.getByTitle('Like')).toHaveAttribute('aria-pressed', 'false'));
  });

  it('replaces one reaction with another rather than adding a second', async () => {
    signIn();
    const { fetch, calls } = reactionFetch({ counts: { wow: 1 }, total: 1, mine: 'wow' });
    vi.stubGlobal('fetch', fetch);
    renderApp(<Reactions postId="p1" initial={{ counts: { like: 1 }, total: 1, mine: 'like' }} />);
    await ready();

    await userEvent.click(screen.getByTitle('Wow'));

    await waitFor(() => expect(screen.getByTitle('Wow')).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByTitle('Like')).toHaveAttribute('aria-pressed', 'false');
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
  });

  it('shows the counts to a guest but does not let them react', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    renderApp(<Reactions postId="p1" initial={{ counts: { laugh: 4 }, total: 4, mine: null }} />);

    // every one of them says the same thing to a guest, so there are six
    const all = await screen.findAllByTitle('Sign in to react');
    expect(all).toHaveLength(6);
    for (const b of all) expect(b).toBeDisabled();
    const laugh = all[0]!;
    expect(screen.getByRole('group', { name: 'Reactions' }).textContent).toContain('4');
    await userEvent.click(laugh);
    expect(fetch).not.toHaveBeenCalled();
  });
});
