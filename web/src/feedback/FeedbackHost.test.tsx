import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { APP_FEEDBACK_DELAY_MS } from '@kurda/shared';
import { AuthProvider } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n/I18nProvider';
import { jsonResponse } from '../test/utils';
import { FeedbackHost, resetFeedbackSessionForTests } from './FeedbackHost';
import { reportGameFinished } from './gameFinished';

let shouldPrompt = true;
let stateCalls = 0;

function stubApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith('/me')) return jsonResponse(200, { user: { id: 'u1', username: 'heval' } });
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

async function finishGame(gaveUp = false): Promise<void> {
  await act(async () => {
    reportGameFinished({ game: 'wordle', gaveUp });
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
  resetFeedbackSessionForTests();
  stubApi();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
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
  });
});
