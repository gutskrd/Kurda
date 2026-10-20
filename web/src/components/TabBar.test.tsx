import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { TabBar, countLabel, isFullScreenTask } from './TabBar';
import { RailProvider } from '../social/RailProvider';
import { useNavLinks } from '../layouts/navLinks';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.classList.remove('has-tabbar');
});

const signIn = () =>
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

function serve({ unreadDms = 0, gifts = 0 }: { unreadDms?: number; gifts?: number } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/me/social')) {
        return jsonResponse(200, {
          you: null, friends: [], requests: [], challenges: [], groups: [], notifications: [],
          unread: { notifications: 0, groups: 0, requests: 0, challenges: 0, gifts },
        });
      }
      if (url.includes('/chat/conversations')) {
        return jsonResponse(200, { conversations: unreadDms ? [{ userId: 'u2', username: 'zana', lastMessage: 'x', lastAt: '2026-10-01T00:00:00Z', lastFromMe: false, unread: unreadDms }] : [] });
      }
      if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', emailVerified: true } });
      return jsonResponse(200, {});
    }),
  );
}

function Where(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function Bar(): React.JSX.Element {
  return <TabBar links={useNavLinks()} />;
}

const show = (at: string) =>
  renderApp(
    <RailProvider>
      <Bar />
      <Where />
    </RailProvider>,
    [at],
  );

const tabs = () => within(screen.getByRole('navigation', { name: 'Main sections' })).getAllByRole('link');

describe('TabBar', () => {
  it('has the five places, in order, each with its word under its icon', async () => {
    signIn();
    serve();
    show('/app');
    await waitFor(() => expect(tabs().map((t) => t.textContent)).toEqual(['Home', 'Learn', 'Messages', 'Search', 'Profile']));
    for (const tab of tabs()) expect(tab.querySelector('.tabbar-icon svg, .tabbar-icon .nav-avatar'), tab.textContent!).not.toBeNull();
  });

  it('says which place you are on', async () => {
    signIn();
    serve();
    show('/app/search');
    const search = await screen.findByRole('link', { name: 'Search' });
    expect(search).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('counts unread messages on Messages, and says so', async () => {
    signIn();
    serve();
    // in the app the count comes from the messages provider, through the
    // links; here the links carry it directly
    renderApp(
      <RailProvider>
        <TabBar
          links={[
            { key: 'home', label: 'Home', to: '/app', owns: (p) => p === '/app' },
            { key: 'messages', label: 'Messages', to: '/app/messages', badge: 3, owns: (p) => p.startsWith('/app/messages') },
          ]}
        />
      </RailProvider>,
      ['/app'],
    );
    const messages = await screen.findByRole('link', { name: 'Messages, 3 unread' });
    expect(messages.querySelector('.tabbar-badge')!.textContent).toBe('3');
  });

  it('caps the count at 9+', () => {
    expect(countLabel(1)).toBe('1');
    expect(countLabel(9)).toBe('9');
    expect(countLabel(10)).toBe('9+');
    expect(countLabel(250)).toBe('9+');
  });

  it('puts a dot on Profile for a gift waiting, and says so', async () => {
    signIn();
    serve({ gifts: 1 });
    show('/app');
    const profile = await screen.findByRole('link', { name: 'Profile, something is waiting for you' });
    expect(profile.querySelector('.tabbar-dot')).not.toBeNull();
  });

  it('gives a visitor Home, Learn and Search, and a way to log in where Profile will be', async () => {
    serve();
    show('/app');
    await waitFor(() => expect(tabs().map((t) => t.textContent)).toEqual(['Home', 'Learn', 'Search', 'Log in']));
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('steps aside for a conversation, a lesson and a game, and comes back after', async () => {
    signIn();
    serve();
    for (const at of [
      '/app/messages?to=u2&name=zana',
      '/app/messages?group=g1',
      '/app/learn/lesson/l1',
      '/app/learn/review',
      '/app/games/wordle',
      '/app/games/wordle-battle?id=b1',
      '/app/games/stories/play/g1',
    ]) {
      const { unmount } = show(at);
      expect(screen.queryByRole('navigation', { name: 'Main sections' }), at).not.toBeInTheDocument();
      expect(document.body).not.toHaveClass('has-tabbar');
      unmount();
    }
    // the list of conversations, the Learn page and the shelf of stories keep it
    for (const at of ['/app/messages', '/app/learn', '/app/games', '/app/games/stories']) {
      const { unmount } = show(at);
      expect(screen.getByRole('navigation', { name: 'Main sections' }), at).toBeInTheDocument();
      expect(document.body).toHaveClass('has-tabbar');
      unmount();
    }
  });

  it('knows a task from a page', () => {
    expect(isFullScreenTask('/app/messages', '')).toBe(false);
    expect(isFullScreenTask('/app/messages', '?to=u1')).toBe(true);
    expect(isFullScreenTask('/app/learn/course/c1', '')).toBe(false);
    expect(isFullScreenTask('/app/learn/next', '')).toBe(true);
    expect(isFullScreenTask('/app/games/race', '')).toBe(true);
    expect(isFullScreenTask('/app/games/stories/kawa', '')).toBe(false);
  });

  it('takes you back to the top of the place you are already on, rather than reloading it', async () => {
    signIn();
    serve();
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    show('/app/search');
    await userEvent.click(await screen.findByRole('link', { name: 'Search' }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    expect(screen.getByTestId('where').textContent).toBe('/app/search');
  });

  it('goes to the place pressed', async () => {
    signIn();
    serve();
    show('/app');
    await userEvent.click(await screen.findByRole('link', { name: 'Messages' }));
    expect(screen.getByTestId('where').textContent).toBe('/app/messages');
  });
});
