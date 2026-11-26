import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { renderApp, jsonResponse } from '../test/utils';
import { Brand } from '../components/Brand';
import { PlayProvider, usePlayInvites } from '../play/PlayProvider';
import { RailProvider, useRail } from './RailProvider';

// The connection is up, so the rail reads on events and page changes rather than polling.
vi.mock('../realtime/RealtimeProvider', async (original) => ({
  ...(await original<typeof import('../realtime/RealtimeProvider')>()),
  useRealtime: () => ({ state: 'open' }),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const signIn = () => localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

/** Counts how often the rail and the invites are fetched. */
function serve() {
  const asked = { social: 0, invites: 0 };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/me/social')) {
        asked.social += 1;
        return jsonResponse(200, { you: { balances: { zer: 120 }, level: { level: 2, progress: 0.4 } }, unread: { notifications: 0, groups: 0, requests: 0, challenges: 0 } });
      }
      if (url.includes('/play/invites')) {
        asked.invites += 1;
        return jsonResponse(200, { incoming: [], outgoing: [] });
      }
      if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true } });
      return jsonResponse(200, {});
    }),
  );
  return asked;
}

function Purse(): React.JSX.Element {
  const { data } = useRail();
  const { lists } = usePlayInvites();
  return <p data-testid="purse">{data.you ? `${data.you.balances.zer} / ${lists ? 'invites read' : 'no invites'}` : 'nothing yet'}</p>;
}

describe('the rail and the invites, held once for the whole app', () => {
  it('lets a shell’s own providers stand aside for the ones above the routes', async () => {
    signIn();
    const asked = serve();
    // As App.tsx has them above the routes, with a shell (AppLayout, FocusLayout) wrapping itself in them too.
    renderApp(
      <RailProvider>
        <PlayProvider>
          <RailProvider>
            <PlayProvider>
              <Purse />
            </PlayProvider>
          </RailProvider>
        </PlayProvider>
      </RailProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('purse')).toHaveTextContent('120 / invites read'));
    // One of each, not one per provider: the inner ones make no requests and hold no state.
    expect(asked.social).toBe(1);
    expect(asked.invites).toBe(1);
  });

  it('still gives a shell drawn alone a rail of its own', async () => {
    signIn();
    const asked = serve();
    renderApp(
      <RailProvider>
        <Purse />
      </RailProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('purse')).toHaveTextContent('120'));
    expect(asked.social).toBe(1);
  });
});

describe('the rail after moving to another page', () => {
  function Leave(): React.JSX.Element {
    const navigate = useNavigate();
    return <button onClick={() => navigate('/learn')}>Leave</button>;
  }

  it('reads again soon, so a lesson or game just finished shows in the bar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signIn();
    const asked = serve();
    renderApp(
      <RailProvider>
        <Purse />
        <Leave />
      </RailProvider>,
    );
    await waitFor(() => expect(asked.social).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(asked.social).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await waitFor(() => expect(asked.social).toBe(2));
  });
});

describe('the logo’s entrance', () => {
  it('is made once in a tab: a bar drawn again later has a logo that is simply there', () => {
    const first = renderApp(<Brand />);
    // The first bar in this file's tab had the entrance; none does after.
    first.unmount();
    renderApp(<Brand />);
    expect(screen.getByRole('link', { name: /Hevalo/ })).not.toHaveClass('is-arriving');
  });
});
