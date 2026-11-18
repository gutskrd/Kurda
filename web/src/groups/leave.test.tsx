import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, jsonResponse } from '../test/utils';
import { RailProvider, useRail } from '../social/RailProvider';
import { onNotice } from '../lib/notice';
import { useLeaveGroup } from './leave';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** The rail's groups, and a way to leave the first. */
function Groups(): React.JSX.Element {
  const { data } = useRail();
  const leave = useLeaveGroup();
  return (
    <>
      <p data-testid="groups">{data.groups.map((g) => g.name).join(', ') || 'none'}</p>
      <p data-testid="unread">{data.unread.groups}</p>
      <button type="button" onClick={() => void leave('g1')}>
        Leave
      </button>
    </>
  );
}

describe('leaving a group', () => {
  it('takes the group and its unread messages off the rail at once, and puts them back with a notice if refused', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
    const notices: string[] = [];
    const stop = onNotice((text) => notices.push(text));
    let answer!: (res: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/me/social')) {
          return jsonResponse(200, {
            you: null,
            friends: [],
            requests: [],
            challenges: [],
            groups: [{ id: 'g1', name: 'Kurmancî', memberCount: 4, unread: 3 }],
            notifications: [],
            unread: { notifications: 0, groups: 3, requests: 0, challenges: 0 },
          });
        }
        if (init?.method === 'POST' && url.endsWith('/groups/g1/leave')) return new Promise<Response>((r) => (answer = r));
        if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'me' } });
        return jsonResponse(200, {});
      }),
    );
    renderApp(
      <RailProvider>
        <Groups />
      </RailProvider>,
      ['/app'],
    );

    await waitFor(() => expect(screen.getByTestId('groups')).toHaveTextContent('Kurmancî'));
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.getByTestId('groups')).toHaveTextContent('none');
    expect(screen.getByTestId('unread')).toHaveTextContent('0');
    answer(jsonResponse(503, {}));
    await waitFor(() => expect(screen.getByTestId('groups')).toHaveTextContent('Kurmancî'));
    expect(screen.getByTestId('unread')).toHaveTextContent('3');
    expect(notices).toHaveLength(1);
    stop();
  });
});
