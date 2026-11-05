// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { kingdomBuildings, NO_KINGDOM_LEVELS, type KingdomView } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import { TRANSLATIONS } from '../i18n/translations';
import { KingdomScreen } from './KingdomScreen';

patchReactNativeWeb();
beforeEach(() => {
  resetHaptics();
  navigation.navigate.mockClear();
});
afterEach(cleanup);

const en = TRANSLATIONS.en;
const counts = { houses: 14, school: 5, teahouse: 0, spring: 9, market: 1, orchard: 4 };
const village = (over: Partial<KingdomView> = {}): KingdomView => ({
  buildings: kingdomBuildings(counts, NO_KINGDOM_LEVELS),
  celebrate: [],
  intro: null,
  ...over,
});

function serve(view: KingdomView, zer?: number) {
  const client = fakeClient({ 'GET /kingdom': ok(view), 'POST /kingdom/seen': ok({ seen: true }), ...(zer === undefined ? {} : { 'GET /me/wallet': ok({ balances: { zer, gems: 0 } }) }) });
  testAuth.client = client;
  return client;
}

/** The world's scale as the camera last set it, read from the transform the web renderer writes. */
const scaleOf = (): number => Number(/scale\(([\d.]+)\)/.exec(screen.getByTestId('kingdom-scene').style.transform)?.[1]);

describe('the village on the phone', () => {
  it('draws the world, and gives every building a card in the tray that says its level', async () => {
    serve(village());
    renderWithProviders(<KingdomScreen onExit={() => undefined} />);
    expect(await screen.findByTestId('kingdom-scene')).toBeTruthy();
    for (const id of ['houses', 'school', 'teahouse', 'spring', 'market', 'orchard']) expect(screen.getByTestId(`kingdom-card-${id}`)).toBeTruthy();
    expect(screen.getByTestId('kingdom-row-houses').getAttribute('aria-label')).toBe(`${en['kingdom.name.houses']}, Level 1 of 5`);
    expect(screen.getByTestId('kingdom-row-teahouse').getAttribute('aria-label')).toBe(`${en['kingdom.name.teahouse']}, ${en['kingdom.empty']}`);
    expect(screen.getByTestId('kingdom-stage').getAttribute('aria-label')).toBe(en['kingdom.title']);
    expect(screen.queryByTestId('kingdom-intro')).toBeNull();
  });

  it('shows a chunky top bar with the village’s level and the learner’s Zêr, and a badge under every building', async () => {
    serve(village(), 1240);
    renderWithProviders(<KingdomScreen onExit={() => undefined} />);
    expect((await screen.findByTestId('kingdom-zer')).getAttribute('aria-label')).toBe('1,240 Zêr');
    // houses, school, spring and orchard at level 1
    expect(screen.getByTestId('kingdom-levels').getAttribute('aria-label')).toBe('4 of 30 building levels');
    expect(within(screen.getByTestId('kingdom-plot-houses')).getByText('Lv 1')).toBeTruthy();
    expect(within(screen.getByTestId('kingdom-plot-teahouse')).getByText('Lv 0')).toBeTruthy();
    // the village's life is laid over the world, hidden from screen readers; the tray is the list
    expect(screen.getByTestId('kingdom-life')).toBeTruthy();
    expect(screen.getByText(en['kingdom.list'])).toBeTruthy();
  });

  it('flies to a building from its card and opens what built it, with the way to the part of Learn that grows it', async () => {
    serve(village());
    renderWithProviders(<KingdomScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('kingdom-row-school'));
    const sheet = await screen.findByTestId('kingdom-sheet', undefined, { timeout: 3000 });
    expect(within(sheet).getByText('Lessons passed with 80% or more: 5')).toBeTruthy();
    expect(within(sheet).getByText(en['kingdom.grows.school'])).toBeTruthy();
    expect(within(sheet).getByText('11 more to level 2')).toBeTruthy();
    fireEvent.click(within(sheet).getByText(en['kingdom.go.lessons']));
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Learn', params: { view: 'lessons' } });
  });

  it('sends the houses to review and the tea house to the stories, straight from their cards', async () => {
    serve(village());
    renderWithProviders(<KingdomScreen onExit={() => undefined} />);
    fireEvent.click(within(await screen.findByTestId('kingdom-card-houses')).getByText(en['kingdom.go.review']));
    expect(navigation.navigate).toHaveBeenLastCalledWith('PracticeHub');
    fireEvent.click(within(screen.getByTestId('kingdom-card-teahouse')).getByText(en['kingdom.go.stories']));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Stories');
    expect(within(screen.getByTestId('kingdom-card-houses')).getByText(en['kingdom.grows.houses'])).toBeTruthy();
  });

  it('zooms in and out with its round buttons, and goes back to the heart', async () => {
    serve(village());
    renderWithProviders(<KingdomScreen onExit={() => undefined} />);
    await screen.findByTestId('kingdom-scene');
    const opening = scaleOf();
    expect(opening).toBeGreaterThan(0);
    expect(screen.getByTestId('kingdom-zoom-in').getAttribute('aria-label')).toBe(en['kingdom.zoomIn']);
    fireEvent.click(screen.getByTestId('kingdom-zoom-in'));
    await waitFor(() => expect(scaleOf()).toBeGreaterThan(opening * 1.3), { timeout: 2000 });
    fireEvent.click(screen.getByTestId('kingdom-recentre'));
    await waitFor(() => expect(scaleOf()).toBeCloseTo(opening, 3), { timeout: 2000 });
    fireEvent.click(screen.getByTestId('kingdom-zoom-out'));
    await waitFor(() => expect(scaleOf()).toBeLessThan(opening), { timeout: 2000 });
  });

  it('opens the first visit with the one sentence on how the village grows, and marks it seen', async () => {
    const client = serve(village({ intro: { levels: 2, zer: 40 } }));
    renderWithProviders(<KingdomScreen onExit={() => undefined} />);
    expect(await screen.findByText(en['kingdom.intro'])).toBeTruthy();
    expect(screen.getByText(`${en['kingdom.intro.built']} +40 Zêr`)).toBeTruthy();
    fireEvent.click(screen.getByText(en['kingdom.intro.go']));
    await waitFor(() => expect(screen.queryByTestId('kingdom-intro')).toBeNull());
    expect(client.calls.filter((c) => c.method === 'POST')).toEqual([{ method: 'POST', path: '/kingdom/seen', body: { intro: true } }]);
  });

  it('celebrates a new level once, felt as it lands, and marks it seen', async () => {
    const felt: string[] = [];
    const stop = onHaptic((e) => felt.push(e));
    const client = serve(village({ celebrate: [{ building: 'spring', level: 1, zer: 20, reachedAt: '2026-11-05T10:00:00.000Z' }] }));
    renderWithProviders(<KingdomScreen onExit={() => undefined} />);
    // it goes up in the scene first, its card saying a new level is ready to see, felt as it lands, and is celebrated after
    expect(await screen.findByTestId('kingdom-raise')).toBeTruthy();
    expect(screen.getByTestId('kingdom-row-spring').getAttribute('aria-label')).toBe(`${en['kingdom.name.spring']}, ${en['kingdom.tray.ready']}`);
    expect(screen.queryByText(`${en['kingdom.name.spring']} · level 1`)).toBeNull();
    expect(await screen.findByText(`${en['kingdom.name.spring']} · level 1`, undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByTestId('kingdom-raise')).toBeNull();
    expect(screen.getByText('+20 Zêr')).toBeTruthy();
    await waitFor(() => expect(felt).toContain('celebrate'), { timeout: 3000 });
    fireEvent.click(screen.getByText(en['kingdom.celebrate.done']));
    await waitFor(() => expect(screen.queryByText(`${en['kingdom.name.spring']} · level 1`)).toBeNull());
    expect(client.calls.filter((c) => c.method === 'POST')).toEqual([
      { method: 'POST', path: '/kingdom/seen', body: { levels: [{ building: 'spring', level: 1 }] } },
    ]);
    stop();
  }, 15000);

  it('offers to try again when the village cannot be read', async () => {
    testAuth.client = fakeClient({ 'GET /kingdom': fail({ kind: 'server', status: 500 }) });
    renderWithProviders(<KingdomScreen onExit={() => undefined} />);
    expect(await screen.findByText(TRANSLATIONS.en['common.retry'])).toBeTruthy();
  });
});
