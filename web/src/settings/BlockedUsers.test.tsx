import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BlockedUsers } from './BlockedUsers';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

const person = (n: number, blockedAt: string): Record<string, unknown> => ({
  userId: `u${n}`,
  username: `person${n}`,
  displayName: `Person ${n}`,
  avatarUrl: null,
  blockedAt,
});

/**
 * A fetch stub that answers the blocklist and records every call, so a test can
 * assert on the request the component actually made (method and path), not only
 * on what ended up on screen.
 */
function stubApi(pages: Array<{ blocked: unknown[]; total: number }>): ReturnType<typeof vi.fn> {
  let next = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/friends/blocks')) {
      const page = pages[Math.min(next, pages.length - 1)];
      next += 1;
      return jsonResponse(200, page);
    }
    void init;
    return jsonResponse(200, { ok: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('the blocklist in Settings', () => {
  it('lists who you blocked, with the count and when', async () => {
    stubApi([{ blocked: [person(1, '2026-09-03T10:00:00.000Z'), person(2, '2024-02-11T10:00:00.000Z')], total: 2 }]);
    renderApp(<BlockedUsers />);

    expect(await screen.findByText('Person 1')).toBeInTheDocument();
    expect(screen.getByText('Person 2')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // the count beside the heading
    // the date is what tells an old block from one placed by accident today
    expect(screen.getByText(/@person1 · blocked/)).toBeInTheDocument();
    expect(screen.getByText(/@person2 · blocked .*2024/)).toBeInTheDocument();
  });

  /**
   * The name of someone you blocked is text, not a button. Their profile is a
   * 404 to you the moment you block them, so a link would go nowhere — see the
   * component comment.
   */
  it('does not offer a link to a profile that no longer answers', async () => {
    stubApi([{ blocked: [person(1, '2026-09-03T10:00:00.000Z')], total: 1 }]);
    renderApp(<BlockedUsers />);

    await screen.findByText('Person 1');
    expect(screen.queryByRole('button', { name: /^person 1$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /person 1/i })).not.toBeInTheDocument();
  });

  it('unblocks only after a second press, then takes the row away', async () => {
    const fetchMock = stubApi([{ blocked: [person(1, '2026-09-03T10:00:00.000Z')], total: 1 }]);
    renderApp(<BlockedUsers />);
    await screen.findByText('Person 1');

    const user = userEvent.setup();
    const unblock = screen.getByRole('button', { name: /unblock person 1/i });

    // one press only arms it — nothing has been sent yet
    await user.click(unblock);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/friends/u1/block')).length).toBe(0);

    await user.click(screen.getByRole('button', { name: /press again to confirm/i }));

    await waitFor(() => expect(screen.queryByText('Person 1')).not.toBeInTheDocument());
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/friends/u1/block'));
    expect(call).toBeTruthy();
    expect((call![1] as RequestInit).method).toBe('DELETE');
    // the count follows the list down rather than going stale
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('says so plainly when you have blocked nobody', async () => {
    stubApi([{ blocked: [], total: 0 }]);
    renderApp(<BlockedUsers />);

    expect(await screen.findByText(/haven’t blocked anyone/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unblock/i })).not.toBeInTheDocument();
  });

  it('offers the rest of a long list rather than silently truncating it', async () => {
    stubApi([
      { blocked: [person(1, '2026-09-03T10:00:00.000Z')], total: 3 },
      { blocked: [person(2, '2026-09-02T10:00:00.000Z'), person(3, '2026-09-01T10:00:00.000Z')], total: 3 },
    ]);
    renderApp(<BlockedUsers />);
    await screen.findByText('Person 1');

    const more = screen.getByRole('button', { name: /show more \(2\)/i });
    await userEvent.setup().click(more);

    expect(await screen.findByText('Person 3')).toBeInTheDocument();
    // once everything is shown there is nothing left to ask for
    await waitFor(() => expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument());
  });

  it('keeps the row when the unblock fails, rather than pretending it worked', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/friends/blocks')) {
        return jsonResponse(200, { blocked: [person(1, '2026-09-03T10:00:00.000Z')], total: 1 });
      }
      return jsonResponse(500, { error: { code: 'BOOM', message: 'nope' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<BlockedUsers />);
    await screen.findByText('Person 1');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /unblock person 1/i }));
    await user.click(screen.getByRole('button', { name: /press again to confirm/i }));

    // still blocked, and told so — the dangerous failure here is a row that
    // vanishes while the block is still in force
    await waitFor(() => expect(screen.getByRole('button', { name: /unblock person 1/i })).toBeInTheDocument());
    expect(screen.getByText('Person 1')).toBeInTheDocument();
  });
});
