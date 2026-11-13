import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuth } from '../auth/AuthProvider';
import { renderApp, jsonResponse } from '../test/utils';
import { lastAnswer } from './apiMemory';
import { useApiGet } from './useApi';

afterEach(() => {
  vi.restoreAllMocks();
});

const signIn = () => localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

/** Serve /me as `user`, and /friends with whatever `friends` returns now; count how often /friends is asked. */
function serve(user: { id: string }, friends: () => string[]) {
  let asked = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/friends')) {
        asked += 1;
        return jsonResponse(200, { friends: friends() });
      }
      if (url.includes('/me')) return jsonResponse(200, { user: { ...user, username: 'me' } });
      return jsonResponse(200, {});
    }),
  );
  return { asked: () => asked };
}

/** Shows what the hook holds, once it is known who is here (as every page under the app's gate is). */
function Friends({ fresh = false }: { fresh?: boolean }): React.JSX.Element | null {
  const { status, logout } = useAuth();
  if (status === 'restoring') return null;
  return (
    <>
      <List fresh={fresh} />
      <button type="button" onClick={() => void logout()}>
        Sign out
      </button>
    </>
  );
}

function List({ fresh }: { fresh: boolean }): React.JSX.Element {
  const { data, loading } = useApiGet<{ friends: string[] }>('/friends', { fresh });
  return <p data-testid="friends">{loading ? 'loading' : (data?.friends.join(', ') ?? 'none')}</p>;
}

describe('useApiGet', () => {
  it('shows the last answer at once on a second visit, and brings it up to date behind that', async () => {
    signIn();
    let names = ['rojda'];
    const server = serve({ id: 'u1' }, () => names);
    const first = renderApp(<Friends />);
    await waitFor(() => expect(screen.getByTestId('friends')).toHaveTextContent('rojda'));
    first.unmount();

    // a friend was made meanwhile; and the visit is not within the moment an answer counts as the page's own
    names = ['rojda', 'baran'];
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    renderApp(<Friends />);
    // never "loading": what it showed last time is there from the first frame it draws
    const seen: string[] = [];
    await waitFor(() => {
      seen.push(screen.getByTestId('friends').textContent ?? '');
      expect(screen.getByTestId('friends')).toHaveTextContent('rojda, baran');
    });
    expect(seen).not.toContain('loading');
    expect(server.asked()).toBe(2);
  });

  it('asks afresh every time, and keeps nothing, for a question marked fresh', async () => {
    signIn();
    const server = serve({ id: 'u1' }, () => ['rojda']);
    const first = renderApp(<Friends fresh />);
    await waitFor(() => expect(screen.getByTestId('friends')).toHaveTextContent('rojda'));
    expect(lastAnswer('u1', '/friends')).toBeNull();
    first.unmount();

    renderApp(<Friends fresh />);
    await waitFor(() => expect(screen.getByTestId('friends')).toHaveTextContent('loading'));
    await waitFor(() => expect(screen.getByTestId('friends')).toHaveTextContent('rojda'));
    expect(server.asked()).toBe(2);
  });

  it('empties the memory on sign-out, so nothing one account loaded is left for the next', async () => {
    signIn();
    serve({ id: 'u1' }, () => ['rojda']);
    renderApp(<Friends />);
    await waitFor(() => expect(screen.getByTestId('friends')).toHaveTextContent('rojda'));
    expect(lastAnswer('u1', '/friends')?.data).toEqual({ friends: ['rojda'] });

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await act(async () => undefined);
    // read as the same account would: had anything been kept, this is where it would be
    expect(lastAnswer('u1', '/friends')).toBeNull();
  });

  it('does not ask again for what another part of the same page was only just given', async () => {
    signIn();
    const server = serve({ id: 'u1' }, () => ['rojda']);
    const first = renderApp(<Friends />);
    await waitFor(() => expect(screen.getByTestId('friends')).toHaveTextContent('rojda'));
    first.unmount();
    renderApp(<Friends />);
    await waitFor(() => expect(screen.getByTestId('friends')).toHaveTextContent('rojda'));
    expect(server.asked()).toBe(1);
  });
});
