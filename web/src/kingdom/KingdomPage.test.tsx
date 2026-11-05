import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { kingdomBuildings, NO_KINGDOM_LEVELS, type KingdomView } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';
import { KingdomPage } from './KingdomPage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const counts = { houses: 14, school: 5, teahouse: 0, spring: 9, market: 1, orchard: 4 };

function village(over: Partial<KingdomView> = {}): KingdomView {
  return { buildings: kingdomBuildings(counts, NO_KINGDOM_LEVELS), celebrate: [], intro: null, ...over };
}

/** A server that answers the village and records what is marked seen. */
function serve(view: KingdomView) {
  const seen: unknown[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/kingdom/seen')) {
      seen.push(JSON.parse(String(init?.body ?? '{}')));
      return jsonResponse(200, { seen: true });
    }
    if (url.includes('/kingdom')) return jsonResponse(200, view);
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetch);
  return { seen };
}

describe('KingdomPage', () => {
  it('draws the village with a button on every building, and lists the six with their levels', async () => {
    serve(village());
    renderApp(<KingdomPage />);
    expect(await screen.findByRole('heading', { name: en['kingdom.title'], level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: en['kingdom.title'] })).toBeInTheDocument();
    // the houses at level 1 (12 of them reached it), the tea house an empty plot
    expect(screen.getByRole('button', { name: `${en['kingdom.name.houses']}, Level 1 of 5` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${en['kingdom.name.teahouse']}, ${en['kingdom.empty']}` })).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.queryByText(en['kingdom.intro'])).not.toBeInTheDocument();
  });

  it('opens a building’s sheet: what built it, what grows it next, and the way to that part of Learn', async () => {
    const user = userEvent.setup();
    serve(village());
    renderApp(<KingdomPage />);
    await user.click(await screen.findByRole('button', { name: `${en['kingdom.name.school']}, Level 1 of 5` }));
    const sheet = await screen.findByRole('dialog', { name: en['kingdom.name.school'] });
    expect(within(sheet).getByText('Lessons passed with 80% or more: 5')).toBeInTheDocument();
    expect(within(sheet).getByText(en['kingdom.grows.school'])).toBeInTheDocument();
    expect(within(sheet).getByText('11 more to level 2')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: en['kingdom.go.lessons'] })).toHaveAttribute('href', '/app/learn/next');
  });

  it('sends the houses to review and the tea house to the stories', async () => {
    const user = userEvent.setup();
    serve(village());
    renderApp(<KingdomPage />);
    await user.click(await screen.findByRole('button', { name: `${en['kingdom.name.houses']}, Level 1 of 5` }));
    expect(within(await screen.findByRole('dialog')).getByRole('link', { name: en['kingdom.go.review'] })).toHaveAttribute('href', '/app/learn/review');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: `${en['kingdom.name.teahouse']}, ${en['kingdom.empty']}` }));
    expect(within(await screen.findByRole('dialog')).getByRole('link', { name: en['kingdom.go.stories'] })).toHaveAttribute('href', '/app/learn/stories');
  });

  it('opens the first visit with the one sentence on how the village grows, and says so once', async () => {
    const user = userEvent.setup();
    const { seen } = serve(village({ intro: { levels: 3, zer: 60 } }));
    renderApp(<KingdomPage />);
    expect(await screen.findByText(en['kingdom.intro'])).toBeInTheDocument();
    expect(screen.getByText(en['kingdom.intro.built'])).toBeInTheDocument();
    expect(screen.getByText('+60 Zêr')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en['kingdom.intro.go'] }));
    expect(screen.queryByText(en['kingdom.intro'])).not.toBeInTheDocument();
    await waitFor(() => expect(seen).toEqual([{ intro: true }]));
  });

  it('celebrates each new level once, one after another, and marks each seen as it is put away', async () => {
    const user = userEvent.setup();
    const { seen } = serve(
      village({
        celebrate: [
          { building: 'houses', level: 1, zer: 20, reachedAt: '2026-11-05T10:00:00.000Z' },
          { building: 'orchard', level: 1, zer: 0, reachedAt: '2026-11-05T10:00:01.000Z' },
        ],
      }),
    );
    renderApp(<KingdomPage />);
    const first = await screen.findByRole('dialog', { name: en['kingdom.celebrate.kicker'] });
    expect(within(first).getByRole('heading', { name: `${en['kingdom.name.houses']} · level 1` })).toBeInTheDocument();
    expect(within(first).getByText('+20 Zêr')).toBeInTheDocument();
    await user.click(within(first).getByRole('button', { name: en['kingdom.celebrate.next'] }));
    const second = await screen.findByRole('dialog', { name: en['kingdom.celebrate.kicker'] });
    expect(within(second).getByRole('heading', { name: `${en['kingdom.name.orchard']} · level 1` })).toBeInTheDocument();
    // nothing paid, nothing said about it
    expect(within(second).queryByText(/Zêr/)).not.toBeInTheDocument();
    await user.click(within(second).getByRole('button', { name: en['kingdom.celebrate.done'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(seen).toEqual([{ levels: [{ building: 'houses', level: 1 }] }, { levels: [{ building: 'orchard', level: 1 }] }]),
    );
  });

  it('says when the village could not be read, with a way to try again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(500, { code: 'INTERNAL', message: 'boom' })),
    );
    renderApp(<KingdomPage />);
    expect(await screen.findByRole('button', { name: en['common.retry'] })).toBeInTheDocument();
  });
});
