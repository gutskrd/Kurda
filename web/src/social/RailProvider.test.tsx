import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderApp, jsonResponse } from '../test/utils';
import { Brand } from '../components/Brand';
import { PlayProvider, usePlayInvites } from '../play/PlayProvider';
import { RailProvider, useRail } from './RailProvider';

afterEach(() => {
  vi.restoreAllMocks();
});

const signIn = () => localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

/** Count how often the rail and the invites are asked for. */
function serve() {
  const asked = { social: 0, invites: 0 };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/me/social')) {
        asked.social += 1;
        return jsonResponse(200, { you: { balances: { zer: 120, gems: 3 }, level: { level: 2, progress: 0.4 } }, unread: { notifications: 0, groups: 0, requests: 0, challenges: 0 } });
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
    // as App.tsx has them above the routes, and a shell (AppLayout, FocusLayout) has them round itself
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
    // one of each, not one per provider: the inner ones made no request and hold no state of their own
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

describe('the logo’s entrance', () => {
  it('is made once in a tab: a bar drawn again later has a logo that is simply there', () => {
    const first = renderApp(<Brand />);
    // whichever bar was first in this file's tab has had the entrance; from then on none does
    first.unmount();
    renderApp(<Brand />);
    expect(screen.getByRole('link', { name: /Hevalo/ })).not.toHaveClass('is-arriving');
  });
});
