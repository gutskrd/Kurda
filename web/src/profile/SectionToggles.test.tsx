import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionToggles } from './SectionToggles';
import { renderApp, jsonResponse } from '../test/utils';
import type { MeProfile } from '../lib/types';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const me = { id: 'u1', username: 'ada' } as unknown as MeProfile;
const ALL = { stories: true, poems: true, images: true, games: true };

describe('SectionToggles', () => {
  it('reflects what the profile actually shows, read from the public profile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { sections: { ...ALL, images: false } })),
    );
    renderApp(<SectionToggles me={me} />);

    expect(await screen.findByRole('checkbox', { name: /Stories/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Dîmen/ })).not.toBeChecked();
  });

  it('saves one section at a time and takes the server’s answer', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/me/profile/sections')) {
          sent.push(JSON.parse(String(init?.body)));
          // the server merges; it comes back with poems off and the rest intact
          return jsonResponse(200, { sections: { ...ALL, poems: false } });
        }
        return jsonResponse(200, { sections: ALL });
      }),
    );
    renderApp(<SectionToggles me={me} />);

    await userEvent.click(await screen.findByRole('checkbox', { name: /Poems/ }));

    // only the one that changed is sent — a full object would let two quick
    // toggles overwrite each other
    await waitFor(() => expect(sent).toEqual([{ poems: false }]));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Poems/ })).not.toBeChecked());
    expect(screen.getByRole('checkbox', { name: /Stories/ })).toBeChecked();
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
    renderApp(<SectionToggles me={me} />);

    await userEvent.click(await screen.findByRole('checkbox', { name: /Games/ }));

    expect(await screen.findByRole('status')).toBeInTheDocument();
    // not flipped optimistically: the profile still shows games
    expect(screen.getByRole('checkbox', { name: /Games/ })).toBeChecked();
  });
});
