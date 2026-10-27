import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MaintenanceNotice } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { en } from '../i18n/en';
import { MaintenanceGate, MaintenanceScreen } from './MaintenanceGate';
import { formatBackBy } from './notice';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'visibilityState');
});

const notice = (over: Partial<MaintenanceNotice> = {}): MaintenanceNotice => ({
  title: null,
  message: null,
  pictureUrl: null,
  since: '2026-10-27T08:00:00.000Z',
  backBy: null,
  ...over,
});

/**
 * The API, open or offline. While offline everything answers 503 MAINTENANCE
 * with the notice, and `/status` answers with it too; open, `/status` says
 * null and the wall has posts on it.
 */
function api(state: { open: boolean; notice: MaintenanceNotice; me?: unknown }): string[] {
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      asked.push(path);
      if (path === '/status') return jsonResponse(200, { maintenance: state.open ? null : state.notice });
      if (!state.open) {
        return jsonResponse(503, { code: 'MAINTENANCE', message: 'Hevalo is offline for maintenance', maintenance: state.notice, requestId: 'r1' });
      }
      if (path === '/feed') return jsonResponse(200, { posts: ['Rojbaş'] });
      if (path === '/me') return jsonResponse(200, state.me ?? {});
      return jsonResponse(200, {});
    }),
  );
  return asked;
}

/** A page that loads something, as every page of the app does. */
function Wall(): React.JSX.Element {
  const { data } = useApiGet<{ posts: string[] }>('/feed');
  return <p>{data ? `posts: ${data.posts.join(', ')}` : 'loading'}</p>;
}

function Who(): React.JSX.Element {
  const { status } = useAuth();
  return <p>status: {status}</p>;
}

const statusAsks = (asked: string[]): number => asked.filter((p) => p === '/status').length;

/**
 * Until `el` has the focus, however late the effect that gives it runs. With
 * the interval clock stopped, waitFor would look again only when the page
 * changes, and the focus moving does not change it.
 */
function focusOn(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    if (document.activeElement === el) resolve();
    else el.addEventListener('focus', () => resolve(), { once: true });
  });
}

/**
 * The half-minute clock, moved by hand. Only intervals are faked, so the clock
 * stands still however long a busy machine takes to draw the page.
 */
async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function hide(hidden: boolean): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('the offline screen', () => {
  it('takes the place of the page, asks every half minute, and gives the page back when Hevalo is', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const state = { open: false, notice: notice({ title: 'Back after the update' }) };
    const asked = api(state);
    renderApp(
      <MaintenanceGate>
        <Wall />
      </MaintenanceGate>,
      ['/app'],
    );

    const heading = await screen.findByRole('heading', { name: 'Back after the update' });
    // read first: the focus is taken there as it appears
    await focusOn(heading);
    expect(heading).toHaveFocus();
    expect(screen.queryByText(/posts:|loading/)).not.toBeInTheDocument();

    await wait(29_000);
    expect(statusAsks(asked)).toBe(0);
    await wait(1_000);
    expect(statusAsks(asked)).toBe(1);
    expect(screen.getByRole('heading', { name: 'Back after the update' })).toBeInTheDocument();

    // open again: the screen goes, and the page loads its data afresh
    state.open = true;
    await wait(30_000);
    expect(await screen.findByText('posts: Rojbaş')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Back after the update' })).not.toBeInTheDocument();
    expect(asked.filter((p) => p === '/feed')).toHaveLength(2);

    // and stops asking
    await wait(60_000);
    expect(statusAsks(asked)).toBe(2);
  });

  it('shows the title, message and picture the admin wrote, as written', () => {
    api({ open: false, notice: notice() });
    renderApp(
      <MaintenanceScreen
        notice={notice({ title: 'New lessons on the way', message: 'We are adding the spring course.\nSee you tonight.', pictureUrl: 'https://cdn.test/spring.png' })}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('heading', { name: 'New lessons on the way' })).toBeInTheDocument();
    // the admin's own line breaks are kept
    expect(screen.getByText(/We are adding the spring course/).textContent).toBe('We are adding the spring course.\nSee you tonight.');
    expect(document.querySelector('.maintenance-picture img')).toHaveAttribute('src', 'https://cdn.test/spring.png');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByText('We check again every 30 seconds.')).toBeInTheDocument();
  });

  it('says it in its own words, with its own picture, where the admin wrote none', () => {
    api({ open: false, notice: notice() });
    renderApp(<MaintenanceScreen notice={notice()} onChange={() => undefined} />);
    expect(screen.getByRole('heading', { name: en['maintenance.title'] })).toBeInTheDocument();
    expect(screen.getByText(en['maintenance.message'])).toBeInTheDocument();
    expect(document.querySelector('.maintenance-picture img')).toHaveAttribute('src', '/mascot-deer.png');
  });

  it('says when Hevalo expects to be back only when the admin said', () => {
    api({ open: false, notice: notice() });
    const backBy = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const { unmount } = renderApp(<MaintenanceScreen notice={notice({ backBy })} onChange={() => undefined} />);
    // as the page's text is matched: one plain space for any run of them
    expect(screen.getByText(`Back by ${formatBackBy(backBy, 'en')}`.replace(/\s+/g, ' '))).toBeInTheDocument();
    unmount();

    renderApp(<MaintenanceScreen notice={notice()} onChange={() => undefined} />);
    expect(screen.queryByText(/Back by/)).not.toBeInTheDocument();
  });

  it('never shows a picture that is not https', async () => {
    api({ open: false, notice: notice({ pictureUrl: 'http://cdn.test/plain.png' }) });
    renderApp(
      <MaintenanceGate>
        <Wall />
      </MaintenanceGate>,
      ['/app'],
    );
    await screen.findByRole('heading', { name: en['maintenance.title'] });
    expect(document.querySelector('.maintenance-picture img')).toHaveAttribute('src', '/mascot-deer.png');
    expect(document.querySelector('img[src^="http:"]')).toBeNull();
  });

  it('asks at once with Try again, and keeps up with what the admin changes', async () => {
    const state = { open: false, notice: notice({ title: 'Back soon' }) };
    const asked = api(state);
    renderApp(
      <MaintenanceGate>
        <Wall />
      </MaintenanceGate>,
      ['/app'],
    );
    await screen.findByRole('heading', { name: 'Back soon' });

    state.notice = notice({ title: 'Back a little later' });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Back a little later' })).toBeInTheDocument();
    expect(statusAsks(asked)).toBe(1);

    state.open = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('posts: Rojbaş')).toBeInTheDocument();
  });

  it('stops asking while the tab is put away, and asks the moment it is seen again', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const asked = api({ open: false, notice: notice() });
    renderApp(
      <MaintenanceGate>
        <Wall />
      </MaintenanceGate>,
      ['/app'],
    );
    await screen.findByRole('heading', { name: en['maintenance.title'] });

    act(() => hide(true));
    await wait(120_000);
    expect(statusAsks(asked)).toBe(0);

    act(() => hide(false));
    await wait(0);
    expect(statusAsks(asked)).toBe(1);
    await wait(30_000);
    expect(statusAsks(asked)).toBe(2);
  });

  it('leaves the pages about Hevalo as they are', async () => {
    api({ open: false, notice: notice() });
    renderApp(
      <MaintenanceGate>
        <Wall />
      </MaintenanceGate>,
      ['/about'],
    );
    expect(await screen.findByText('loading')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: en['maintenance.title'] })).not.toBeInTheDocument();
  });

  /**
   * Asked while Hevalo is offline, "is this session still good?" has no
   * answer, and taking the 503 for a no would sign the reader out. It is
   * asked again once Hevalo is back.
   */
  it('keeps the session until Hevalo is back to say whether it is good', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    const state = {
      open: false,
      notice: notice(),
      me: { user: { id: 'u1', email: '', username: 'rojda', displayName: null, emailVerified: true } },
    };
    api(state);
    renderApp(
      <MaintenanceGate>
        <Who />
      </MaintenanceGate>,
      ['/app'],
    );
    await screen.findByRole('heading', { name: en['maintenance.title'] });

    state.open = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('status: signedIn')).toBeInTheDocument();
  });
});

describe('when Hevalo expects to be back', () => {
  const now = new Date(2026, 9, 27, 9, 30);

  it('is the time alone today, the weekday within the week, and the date after that', () => {
    // \s: newer ICU puts a narrow no-break space before PM
    expect(formatBackBy(new Date(2026, 9, 27, 18, 0).toISOString(), 'en', now)).toMatch(/^6:00\sPM$/);
    const thursday = formatBackBy(new Date(2026, 9, 29, 18, 0).toISOString(), 'en', now);
    expect(thursday).toMatch(/Thursday/);
    expect(thursday).toMatch(/6:00\sPM/);
    const later = formatBackBy(new Date(2026, 10, 12, 18, 0).toISOString(), 'en', now);
    expect(later).toMatch(/Nov/);
    expect(later).toMatch(/12/);
  });

  it('is in the reader’s language', () => {
    expect(formatBackBy(new Date(2026, 9, 29, 18, 0).toISOString(), 'de', now)).toMatch(/Donnerstag.*18:00/);
  });
});
