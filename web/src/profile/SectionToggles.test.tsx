import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionToggles } from './SectionToggles';
import { renderApp, jsonResponse } from '../test/utils';
import type { ProfileSections } from '../lib/types';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const ALL = { posts: true, games: true, likes: true, saved: true } as unknown as ProfileSections;
/** The page's read of your own public profile. */
const own = (sections: Partial<ProfileSections>) => ({ ok: true as const, data: { sections: sections as ProfileSections } });

describe('SectionToggles', () => {
  it('reflects what the profile actually shows, read from the public profile', async () => {
    const fetch = vi.fn(async (_url: string) => jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetch);
    renderApp(<SectionToggles own={own({ ...ALL, saved: false })} />);

    expect(await screen.findByRole('checkbox', { name: /^Posts/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^Saved/ })).not.toBeChecked();
    // the page has read the profile already: nothing is asked again here
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('/users/'))).toEqual([]);
  });

  it('says so when the page could not read them, and shows no boxes', async () => {
    renderApp(<SectionToggles own={{ ok: false, error: { kind: 'server', message: 'down', status: 503 } }} />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('offers a switch for what you have liked and saved', async () => {
    renderApp(<SectionToggles own={own({ ...ALL, likes: false })} />);

    // Liking in public and listing likes on the profile are separate choices with separate switches.
    expect(await screen.findByRole('checkbox', { name: /^Likes/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^Saved/ })).toBeChecked();
  });

  it('saves one section at a time and takes the server’s answer', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/me/profile/sections')) {
          sent.push(JSON.parse(String(init?.body)));
          // the server merges; it comes back with likes off and the rest intact
          return jsonResponse(200, { sections: { ...ALL, likes: false } });
        }
        return jsonResponse(200, { sections: ALL });
      }),
    );
    renderApp(<SectionToggles own={own(ALL)} />);

    await userEvent.click(await screen.findByRole('checkbox', { name: /^Likes/ }));

    // Only the changed key is sent, so two quick toggles cannot overwrite each other.
    await waitFor(() => expect(sent).toEqual([{ likes: false }]));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /^Likes/ })).not.toBeChecked());
    expect(screen.getByRole('checkbox', { name: /^Posts/ })).toBeChecked();
  });

  it('says when a save failed, and leaves the box as it really is', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/me/profile/sections')) {
          return jsonResponse(500, { code: 'INTERNAL', message: 'nope' });
        }
        return jsonResponse(200, { sections: ALL });
      }),
    );
    renderApp(<SectionToggles own={own(ALL)} />);

    await userEvent.click(await screen.findByRole('checkbox', { name: /Games/ }));

    expect(await screen.findByRole('status')).toBeInTheDocument();
    // Put back as the server has it: the profile still shows games.
    expect(screen.getByRole('checkbox', { name: /Games/ })).toBeChecked();
  });

  it('moves each box at once, and sends what changed meanwhile once the first answer comes', async () => {
    const patches: Array<{ body: unknown; answer: (res: Response) => void }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/me/profile/sections')) return new Promise<Response>((answer) => patches.push({ body: JSON.parse(String(init?.body)), answer }));
        return jsonResponse(200, { sections: ALL });
      }),
    );
    renderApp(<SectionToggles own={own(ALL)} />);

    await userEvent.click(await screen.findByRole('checkbox', { name: /^Games/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /^Posts/ }));
    expect(screen.getByRole('checkbox', { name: /^Games/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^Posts/ })).not.toBeChecked();
    expect(patches.map((p) => p.body)).toEqual([{ games: false }]);
    patches[0]!.answer(jsonResponse(200, { sections: { ...ALL, games: false } }));
    await waitFor(() => expect(patches.map((p) => p.body)).toEqual([{ games: false }, { posts: false }]));
    patches[1]!.answer(jsonResponse(200, { sections: { ...ALL, games: false, posts: false } }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /^Posts/ })).not.toBeChecked());
  });
});
