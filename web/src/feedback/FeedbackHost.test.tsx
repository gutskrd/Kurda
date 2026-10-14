import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { APP_FEEDBACK_DELAY_MS } from '@kurda/shared';
import { AuthProvider } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n/I18nProvider';
import { jsonResponse } from '../test/utils';
import { FeedbackHost, resetFeedbackSessionForTests } from './FeedbackHost';
import { reportGameFinished, reportGameStarted } from './gameFinished';

let shouldPrompt = true;
let stateCalls = 0;
let me = 'u1';
let posted: Array<{ url: string; body: unknown }> = [];

function stubApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST') posted.push({ url: u, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (u.endsWith('/me')) return jsonResponse(200, { user: { id: me, username: 'heval' } });
      if (u.includes('/me/app-feedback/state')) {
        stateCalls++;
        return jsonResponse(200, { shouldPrompt, storeReviewEligible: false });
      }
      return jsonResponse(200, { ok: true });
    }),
  );
}

let go: (path: string) => void = () => undefined;
function Navigator(): null {
  const navigate = useNavigate();
  go = (p) => navigate(p);
  return null;
}

const dismissals = (): number => posted.filter((p) => p.url.endsWith('/me/app-feedback/dismiss')).length;
const answers = (): unknown[] => posted.filter((p) => p.url.endsWith('/me/app-feedback')).map((p) => p.body);

async function mount(): Promise<void> {
  // a stored session, so the provider loads /me and is signed in
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  render(
    <AuthProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={['/app/games/wordle']}>
          <Navigator />
          <FeedbackHost />
        </MemoryRouter>
      </I18nProvider>
    </AuthProvider>,
  );
  // let /me land
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
}

async function finishGame(gaveUp = false, deferred = false): Promise<void> {
  await act(async () => {
    reportGameFinished({ game: 'wordle', gaveUp, deferred });
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  shouldPrompt = true;
  stateCalls = 0;
  me = 'u1';
  posted = [];
  resetFeedbackSessionForTests();
  stubApi();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.style.removeProperty('--rb-space');
});

describe('the rating box after a first finished game', () => {
  it('comes up a moment after the results, beside them rather than over them', async () => {
    await mount();
    await finishGame();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await wait(APP_FEEDBACK_DELAY_MS);
    const box = screen.getByRole('dialog', { name: 'How are you enjoying Hevalo?' });
    expect(box).toHaveAttribute('aria-modal', 'false');
    // it does not take the focus from the results
    expect(box.contains(document.activeElement)).toBe(false);
  });

  it('never comes up for a game given up', async () => {
    await mount();
    await finishGame(true);
    await wait(APP_FEEDBACK_DELAY_MS * 2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(stateCalls).toBe(0);
  });

  it('does not come up when the account has been asked before', async () => {
    shouldPrompt = false;
    await mount();
    await finishGame();
    await wait(APP_FEEDBACK_DELAY_MS * 2);
    expect(stateCalls).toBe(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('comes up once a visit, however many games follow', async () => {
    await mount();
    await finishGame();
    await wait(APP_FEEDBACK_DELAY_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await finishGame();
    await wait(APP_FEEDBACK_DELAY_MS * 2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(stateCalls).toBe(1);
  });

  it('is not carried to another page when the player leaves first', async () => {
    await mount();
    await finishGame();
    act(() => go('/app/learn'));
    await wait(APP_FEEDBACK_DELAY_MS * 2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape, as “Not now”', async () => {
    await mount();
    await finishGame();
    await wait(APP_FEEDBACK_DELAY_MS);
    const box = screen.getByRole('dialog');
    fireEvent.keyDown(box.querySelector('input')!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(answers()).toEqual([]);
  });

  it('keeps the stars chosen when it is escaped', async () => {
    await mount();
    await finishGame();
    await wait(APP_FEEDBACK_DELAY_MS);
    const box = screen.getByRole('dialog');
    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    fireEvent.keyDown(box.querySelector('input')!, { key: 'Escape' });
    await wait(0);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(answers()).toEqual([{ stars: 4, source: 'first_game', locale: 'en', platform: 'web', appVersion: 'web' }]);
  });

  it('counts as shown the moment it comes up, answered or not', async () => {
    await mount();
    await finishGame();
    await wait(APP_FEEDBACK_DELAY_MS);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(dismissals()).toBe(1);
    // “Not now” has nothing more to tell the server
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await wait(0);
    expect(dismissals()).toBe(1);
    expect(answers()).toEqual([]);
  });

  it('does not come up on results that already ask something else', async () => {
    await mount();
    await finishGame(false, true);
    await wait(APP_FEEDBACK_DELAY_MS * 2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(stateCalls).toBe(0);

    // the next finished game asks instead
    await finishGame();
    await wait(APP_FEEDBACK_DELAY_MS);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not rise over the next round when “Play again” comes first', async () => {
    await mount();
    await finishGame();
    await act(async () => {
      reportGameStarted();
      await vi.advanceTimersByTimeAsync(0);
    });
    await wait(APP_FEEDBACK_DELAY_MS * 2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(dismissals()).toBe(0);

    // the round after it may still ask
    await finishGame();
    await wait(APP_FEEDBACK_DELAY_MS);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes when the next round starts, keeping stars already chosen', async () => {
    await mount();
    await finishGame();
    await wait(APP_FEEDBACK_DELAY_MS);
    fireEvent.click(screen.getByRole('radio', { name: '5 stars' }));
    await act(async () => {
      reportGameStarted();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(answers()).toEqual([{ stars: 5, source: 'first_game', locale: 'en', platform: 'web', appVersion: 'web' }]);
  });

  it('does not follow the player to another page', async () => {
    await mount();
    await finishGame();
    await wait(APP_FEEDBACK_DELAY_MS);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => go('/app/messages'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks another account that signs in on the same tab', async () => {
    await mount();
    await finishGame();
    await wait(APP_FEEDBACK_DELAY_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    cleanup();

    me = 'u2';
    await mount();
    await finishGame();
    await wait(APP_FEEDBACK_DELAY_MS);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * jsdom does no layout, so this checks the mechanism the screenshots rely
   * on: the page's bottom padding grows by the box's height (plus its gap)
   * while it is up, so the last control of the results scrolls clear of it.
   */
  it('makes room under the page for itself while it is up', async () => {
    let resized: (() => void) | null = null;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          resized = cb;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    let height = 230;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ height, width: 366, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
    );
    await mount();
    await finishGame();
    await wait(APP_FEEDBACK_DELAY_MS);

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--rb-space')).toBe('242px');
    // it grows when stars are picked and the form opens
    height = 422;
    act(() => resized?.());
    expect(root.style.getPropertyValue('--rb-space')).toBe('434px');

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(root.style.getPropertyValue('--rb-space')).toBe('');
  });
});
