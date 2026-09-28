import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationPrefsCard } from './NotificationPrefsCard';
import { renderApp, jsonResponse } from '../test/utils';
import type { NotificationPrefs } from './prefs';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

const stored = (over: Partial<NotificationPrefs> = {}): NotificationPrefs => ({
  streak: true,
  friends: true,
  games: true,
  events: true,
  marketing: false,
  quietStartMin: null,
  quietEndMin: null,
  ...over,
});

/**
 * A server that remembers. The card patches and then trusts the response, so a
 * stub that echoes a merge is the only way to see whether the control ends up
 * where the server put it rather than where the click left it.
 */
function server(initial: NotificationPrefs, opts: { rejectPut?: boolean } = {}) {
  let state = initial;
  const puts: Array<Partial<NotificationPrefs>> = [];
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const patch = JSON.parse(String(init.body)) as Partial<NotificationPrefs>;
      puts.push(patch);
      if (opts.rejectPut) return jsonResponse(422, { code: 'INVALID', message: 'no' });
      state = { ...state, ...patch };
      return jsonResponse(200, state);
    }
    return jsonResponse(200, state);
  });
  return { fetch, puts, current: () => state };
}

describe('NotificationPrefsCard', () => {
  it('shows every category the server knows, set the way it has them', async () => {
    const s = server(stored({ games: false }));
    vi.stubGlobal('fetch', s.fetch);
    renderApp(<NotificationPrefsCard />);

    expect(await screen.findByRole('checkbox', { name: 'Streak reminders' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Friend activity' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Game invites & results' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Events & quests' })).toBeChecked();
    // the opt-in one, off until somebody says otherwise
    expect(screen.getByRole('checkbox', { name: 'News & offers' })).not.toBeChecked();
  });

  it('patches only the category that was touched', async () => {
    const s = server(stored());
    vi.stubGlobal('fetch', s.fetch);
    renderApp(<NotificationPrefsCard />);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Streak reminders' }));
    await waitFor(() => expect(s.puts).toHaveLength(1));
    expect(s.puts[0]).toEqual({ streak: false });
  });

  /**
   * Consent for news and offers is the one people go looking for a way to
   * withdraw, and until now the browser had none.
   */
  it('can turn news and offers on and off again', async () => {
    const s = server(stored());
    vi.stubGlobal('fetch', s.fetch);
    renderApp(<NotificationPrefsCard />);

    const news = await screen.findByRole('checkbox', { name: 'News & offers' });
    await userEvent.click(news);
    await waitFor(() => expect(s.current().marketing).toBe(true));
    await userEvent.click(news);
    await waitFor(() => expect(s.current().marketing).toBe(false));
  });

  describe('quiet hours', () => {
    it('offers no window until there is one', async () => {
      vi.stubGlobal('fetch', server(stored()).fetch);
      renderApp(<NotificationPrefsCard />);

      await screen.findByRole('checkbox', { name: 'Enable quiet hours' });
      expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('To')).not.toBeInTheDocument();
    });

    /**
     * The server refuses a half-set pair, so switching this on with nothing
     * chosen has to send both ends. A 422 here would read as a broken switch.
     */
    it('sends both ends when switched on with nothing chosen', async () => {
      const s = server(stored());
      vi.stubGlobal('fetch', s.fetch);
      renderApp(<NotificationPrefsCard />);

      await userEvent.click(await screen.findByRole('checkbox', { name: 'Enable quiet hours' }));
      await waitFor(() => expect(s.puts).toHaveLength(1));
      expect(s.puts[0]).toEqual({ quietStartMin: 22 * 60, quietEndMin: 7 * 60 });
    });

    it('shows the stored window on both ends', async () => {
      vi.stubGlobal('fetch', server(stored({ quietStartMin: 22 * 60 + 30, quietEndMin: 6 * 60 })).fetch);
      renderApp(<NotificationPrefsCard />);

      expect(await screen.findByLabelText('From')).toHaveValue('22:30');
      expect(screen.getByLabelText('To')).toHaveValue('06:00');
    });

    it('clears both ends when switched off', async () => {
      const s = server(stored({ quietStartMin: 1320, quietEndMin: 420 }));
      vi.stubGlobal('fetch', s.fetch);
      renderApp(<NotificationPrefsCard />);

      await userEvent.click(await screen.findByRole('checkbox', { name: 'Enable quiet hours' }));
      await waitFor(() => expect(s.puts).toHaveLength(1));
      expect(s.puts[0]).toEqual({ quietStartMin: null, quietEndMin: null });
    });
  });

  /**
   * The point of keeping the previous value. A control that stays where the
   * click left it claims a setting the server does not have, and the reader
   * leaves the page believing something untrue about who can interrupt them.
   */
  it('puts the switch back when the server refuses', async () => {
    const s = server(stored(), { rejectPut: true });
    vi.stubGlobal('fetch', s.fetch);
    renderApp(<NotificationPrefsCard />);

    const streak = await screen.findByRole('checkbox', { name: 'Streak reminders' });
    await userEvent.click(streak);

    expect(await screen.findByRole('status')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Streak reminders' })).toBeChecked());
  });

  it('reads in the chosen language', async () => {
    localStorage.setItem('hevalo_locale', 'tr');
    vi.stubGlobal('fetch', server(stored({ quietStartMin: 1320, quietEndMin: 420 })).fetch);
    renderApp(<NotificationPrefsCard />);

    expect(await screen.findByRole('heading', { name: 'Bildirimler' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Seri hatırlatmaları' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Sessiz saatleri aç' })).toBeInTheDocument();
    // the two ends are labelled start and finish rather than from and to
    expect(screen.getByLabelText('Başlangıç')).toHaveValue('22:00');
    expect(screen.getByLabelText('Bitiş')).toHaveValue('07:00');
  });
});
