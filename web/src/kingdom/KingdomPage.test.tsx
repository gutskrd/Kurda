import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { kingdomBuildings, NO_KINGDOM_LEVELS, type KingdomView } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';
import { KingdomPage } from './KingdomPage';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

const reduceMotion = (): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
};

/** The world's transform as the camera last wrote it: its scale. */
const scaleOf = (container: HTMLElement): number => Number(/scale\(([\d.]+)\)/.exec((container.querySelector('.kingdom-world') as HTMLElement).style.transform)?.[1]);

describe('The Village on the website', () => {
  it('draws the world, and lists the six buildings in the tray as buttons with their levels', async () => {
    serve(village());
    renderApp(<KingdomPage />);
    expect(await screen.findByRole('heading', { name: en['kingdom.title'], level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: en['kingdom.title'] })).toBeInTheDocument();
    // the houses at level 1 (12 of them reached it), the tea house an empty plot
    expect(screen.getByRole('button', { name: `${en['kingdom.name.houses']}, Level 1 of 5` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${en['kingdom.name.teahouse']}, ${en['kingdom.empty']}` })).toBeInTheDocument();
    const tray = screen.getByRole('region', { name: en['kingdom.list'] });
    expect(within(tray).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.queryByText(en['kingdom.intro'])).not.toBeInTheDocument();
  });

  it('shows each building’s level on a badge in the world, and the village’s level of thirty in the top bar', async () => {
    serve(village());
    const { container } = renderApp(<KingdomPage />);
    await screen.findByRole('heading', { name: en['kingdom.title'], level: 1 });
    expect(container.querySelector('[data-building="houses"]')).toHaveTextContent('Lv 1');
    expect(container.querySelector('[data-building="teahouse"]')).toHaveTextContent('Lv 0');
    // houses, school, spring and orchard at level 1
    expect(screen.getByRole('img', { name: '4 of 30 building levels' })).toHaveTextContent('4');
    // the world is drawn in tiles, and its life is laid over it, hidden from screen readers; Hevalo is the app's own drawing of him
    expect(container.querySelectorAll('.kingdom-tile').length).toBeGreaterThan(0);
    const life = container.querySelector('.kingdom-life');
    expect(life).toHaveAttribute('aria-hidden', 'true');
    expect(life?.innerHTML).toContain('kgdeer-');
  });

  it('gives each card what grows its building in plain words and the way into that part of Learn', async () => {
    serve(village());
    renderApp(<KingdomPage />);
    const houses = await screen.findByTestId('kingdom-card-houses');
    expect(within(houses).getByText(en['kingdom.grows.houses'])).toBeInTheDocument();
    expect(within(houses).getByText('36 more to level 2')).toBeInTheDocument();
    expect(within(houses).getByRole('link', { name: en['kingdom.go.review'] })).toHaveAttribute('href', '/app/learn/review');
    expect(within(screen.getByTestId('kingdom-card-teahouse')).getByRole('link', { name: en['kingdom.go.stories'] })).toHaveAttribute('href', '/app/learn/stories');
    expect(within(screen.getByTestId('kingdom-card-school')).getByRole('link', { name: en['kingdom.go.lessons'] })).toHaveAttribute('href', '/app/learn/next');
  });

  it('flies to a building from its card and opens what built it and what grows it next', async () => {
    const user = userEvent.setup();
    serve(village());
    renderApp(<KingdomPage />);
    await user.click(await screen.findByRole('button', { name: `${en['kingdom.name.school']}, Level 1 of 5` }));
    const sheet = await screen.findByRole('dialog', { name: en['kingdom.name.school'] }, { timeout: 3000 });
    expect(within(sheet).getByText('Lessons passed with 80% or more: 5')).toBeInTheDocument();
    expect(within(sheet).getByText(en['kingdom.grows.school'])).toBeInTheDocument();
    expect(within(sheet).getByText('11 more to level 2')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: en['kingdom.go.lessons'] })).toHaveAttribute('href', '/app/learn/next');
  });

  it('zooms in and out with its round buttons and its keys, and goes back to the heart', async () => {
    const user = userEvent.setup();
    reduceMotion();
    serve(village());
    const { container } = renderApp(<KingdomPage />);
    await screen.findByRole('heading', { name: en['kingdom.title'], level: 1 });
    const opening = scaleOf(container);
    expect(opening).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: en['kingdom.zoomIn'] }));
    expect(scaleOf(container)).toBeGreaterThan(opening);
    await user.click(screen.getByRole('button', { name: en['kingdom.recentre'] }));
    expect(scaleOf(container)).toBeCloseTo(opening, 5);
    await user.click(screen.getByRole('button', { name: en['kingdom.zoomOut'] }));
    expect(scaleOf(container)).toBeLessThan(opening);
    screen.getByRole('img', { name: en['kingdom.title'] }).focus();
    await user.keyboard('++');
    expect(scaleOf(container)).toBeGreaterThan(opening);
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
    // each new level goes up in the scene first, its card saying a new level is ready to see, then it is celebrated
    expect(await screen.findByTestId('kingdom-raise')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${en['kingdom.name.houses']}, ${en['kingdom.tray.ready']}` })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const first = await screen.findByRole('dialog', { name: en['kingdom.celebrate.kicker'] }, { timeout: 5000 });
    expect(screen.queryByTestId('kingdom-raise')).toBeNull();
    expect(within(first).getByRole('heading', { name: `${en['kingdom.name.houses']} · level 1` })).toBeInTheDocument();
    expect(within(first).getByText('+20 Zêr')).toBeInTheDocument();
    await user.click(within(first).getByRole('button', { name: en['kingdom.celebrate.next'] }));
    const second = await screen.findByRole('dialog', { name: en['kingdom.celebrate.kicker'] }, { timeout: 5000 });
    expect(within(second).getByRole('heading', { name: `${en['kingdom.name.orchard']} · level 1` })).toBeInTheDocument();
    // nothing paid, nothing said about it
    expect(within(second).queryByText(/Zêr/)).not.toBeInTheDocument();
    await user.click(within(second).getByRole('button', { name: en['kingdom.celebrate.done'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(seen).toEqual([{ levels: [{ building: 'houses', level: 1 }] }, { levels: [{ building: 'orchard', level: 1 }] }]),
    );
  }, 15000);

  it('celebrates straight away, with nothing raised in the scene, for a reader who asked for less motion', async () => {
    reduceMotion();
    serve(village({ celebrate: [{ building: 'school', level: 1, zer: 0, reachedAt: '2026-11-05T10:00:00.000Z' }] }));
    renderApp(<KingdomPage />);
    expect(await screen.findByRole('dialog', { name: en['kingdom.celebrate.kicker'] })).toBeInTheDocument();
    expect(screen.queryByTestId('kingdom-raise')).toBeNull();
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
