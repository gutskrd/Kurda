import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { kingdomBuildings, NO_KINGDOM_LEVELS, type KingdomView } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';
import { KingdomPage } from './KingdomPage';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  // the page in sight again, for the tests that put it out of sight
  Reflect.deleteProperty(document, 'hidden');
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

/**
 * The reader goes to another tab: the page hears it is out of sight and draws
 * itself again, every part of it, to hold the village's life still. Nothing it
 * shows has changed, which makes this the plainest way to have the whole page
 * drawn again around its pictures.
 */
function leaveThePage(container: HTMLElement): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(container.querySelector('.kingdom-page')).toHaveClass('is-paused');
}

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

  it('shows each building’s level on a badge in the world, and the village’s own level, its bar and what comes next in the top bar', async () => {
    serve(village());
    const { container } = renderApp(<KingdomPage />);
    await screen.findByRole('heading', { name: en['kingdom.title'], level: 1 });
    expect(container.querySelector('[data-building="houses"]')).toHaveTextContent('Lv 1');
    expect(container.querySelector('[data-building="teahouse"]')).toHaveTextContent('Lv 0');
    // four buildings at level 1 and the market half-way to it: the village at level 6, chicks and children next
    const badge = screen.getByTestId('kingdom-level');
    expect(badge).toHaveTextContent('6');
    expect(badge).toHaveTextContent('Next: Chicks');
    expect(badge).toHaveAccessibleName(expect.stringContaining('Village level 6'));
    // the world is drawn in tiles, and its life is laid over it, hidden from screen readers; Hevalo is the app's own drawing of him
    expect(container.querySelectorAll('.kingdom-tile').length).toBeGreaterThan(0);
    const life = container.querySelector('.kingdom-life');
    expect(life).toHaveAttribute('aria-hidden', 'true');
    expect(life?.innerHTML).toContain('kgdeer-');
  });

  it('opens every village level from its badge: those reached ticked, the next one named, the rest still to come', async () => {
    serve(village());
    renderApp(<KingdomPage />);
    await userEvent.click(await screen.findByTestId('kingdom-level'));
    const sheet = await screen.findByRole('dialog', { name: en['kingdom.village.title'] });
    expect(within(sheet).getByText(en['kingdom.village.how'])).toBeInTheDocument();
    const rows = sheet.querySelectorAll('.kingdom-levels-row');
    expect(rows).toHaveLength(25);
    expect(sheet.querySelectorAll('.kingdom-levels-row.is-reached')).toHaveLength(6);
    expect(sheet.querySelector('.kingdom-levels-row.is-next')).toHaveTextContent('Chicks · Children at play');
    expect(within(sheet).getAllByLabelText(en['kingdom.village.locked'])).toHaveLength(18);
  });

  it('celebrates a new village level once on this device, and never replays old ones on a new device', async () => {
    reduceMotion();
    // a device that has never shown the village: nothing to celebrate, and the level now kept
    serve(village());
    const first = renderApp(<KingdomPage />);
    await screen.findByTestId('kingdom-level');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(localStorage.getItem('kurda.village.seen.guest')).toBe('6');
    first.unmount();
    // one that last showed level 4: the new level's banner, and what it brought
    localStorage.setItem('kurda.village.seen.guest', '4');
    serve(village());
    renderApp(<KingdomPage />);
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('Village level 6');
    expect(banner).toHaveTextContent('New: Haystacks · Chickpeas');
    await waitFor(() => expect(localStorage.getItem('kurda.village.seen.guest')).toBe('6'), { timeout: 4000 });
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

  /**
   * The page draws itself again all the time: as the camera settles, as
   * something is tapped, as a raise ticks its badge over, as the reader comes
   * back to the tab. A picture that has not changed stays the node it was. Put
   * in again, every animal near the view would be parsed afresh and start its
   * loop over, out of step with the one clock the village's life runs on.
   */
  it('leaves the village’s life and an open building’s picture in place when the page is drawn again', async () => {
    const user = userEvent.setup();
    reduceMotion();
    serve(village());
    const { container } = renderApp(<KingdomPage />);
    await user.click(await screen.findByRole('button', { name: `${en['kingdom.name.school']}, Level 1 of 5` }));
    const sheet = await screen.findByRole('dialog', { name: en['kingdom.name.school'] });
    const keyframes = container.querySelector('.kingdom-world > style')!.firstChild;
    const actors = [...container.querySelectorAll('.kingdom-life > .kg-a')].map((actor) => actor.firstChild);
    const picture = sheet.querySelector('.kingdom-sheet-art > svg');
    expect(keyframes).not.toBeNull();
    expect(actors.length).toBeGreaterThan(0);
    expect(picture).not.toBeNull();
    leaveThePage(container);
    expect(container.querySelector('.kingdom-world > style')!.firstChild).toBe(keyframes);
    const now = [...container.querySelectorAll('.kingdom-life > .kg-a')].map((actor) => actor.firstChild);
    expect(now).toHaveLength(actors.length);
    now.forEach((drawn, i) => expect(drawn).toBe(actors[i]));
    expect(sheet.querySelector('.kingdom-sheet-art > svg')).toBe(picture);
  });

  it('leaves a building going up in place, every layer and sparkle of it, when the page is drawn again', async () => {
    serve(village({ celebrate: [{ building: 'houses', level: 1, zer: 0, reachedAt: '2026-11-05T10:00:00.000Z' }] }));
    const { container } = renderApp(<KingdomPage />);
    const raise = await screen.findByTestId('kingdom-raise');
    expect([...raise.children].map((layer) => layer.className)).toEqual([
      'kingdom-raise-old',
      'kingdom-raise-scaffold',
      'kingdom-raise-next',
      'kingdom-raise-dust',
      ...Array.from({ length: 8 }, () => 'kingdom-raise-spark'),
    ]);
    const layers = [...raise.children].map((layer) => layer.firstChild);
    for (const drawn of layers) expect(drawn).not.toBeNull();
    leaveThePage(container);
    expect(screen.getByTestId('kingdom-raise')).toBe(raise);
    [...raise.children].forEach((layer, i) => expect(layer.firstChild).toBe(layers[i]));
  });

  it('leaves a celebration’s picture in place when the page under it is drawn again', async () => {
    reduceMotion();
    serve(village({ celebrate: [{ building: 'school', level: 1, zer: 0, reachedAt: '2026-11-05T10:00:00.000Z' }] }));
    const { container } = renderApp(<KingdomPage />);
    const dialog = await screen.findByRole('dialog', { name: en['kingdom.celebrate.kicker'] });
    const picture = within(dialog).getByRole('img', { name: en['kingdom.name.school'] });
    expect(picture.parentElement).toHaveClass('kingdom-celebrate-art');
    leaveThePage(container);
    expect(within(dialog).getByRole('img', { name: en['kingdom.name.school'] })).toBe(picture);
    expect(picture.isConnected).toBe(true);
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
