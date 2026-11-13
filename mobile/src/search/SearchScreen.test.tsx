// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { forgetLastLetterAvailability } from '../lastletter/availability';
import { SearchScreen } from './SearchScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

describe('Search with nothing typed', () => {
  /*
   * People you may know take a moment to arrive. "Type to search"
   * used to show first and then be replaced by them — the screen changing
   * its mind under the reader. Their place is held in grey instead.
   */
  it('holds the place of people you may know while they load, rather than saying there is nothing', async () => {
    let answer: (v: unknown) => void = () => undefined;
    testAuth.client = fakeClient({ 'GET /friends/suggestions': () => new Promise((go) => (answer = go)) as never });
    renderWithProviders(<SearchScreen />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(10);
    expect(screen.queryByText('Type to search across the app.')).toBeNull();

    answer(ok({ suggestions: [{ userId: 'u7', username: 'jiyan', displayName: 'Jiyan', mutualCount: 3 }] }));
    expect(await screen.findByText('jiyan')).toBeTruthy();
    expect(screen.queryAllByTestId('skeleton')).toHaveLength(0);
  });

  it('says where to start once it knows there is nobody to suggest', async () => {
    testAuth.client = fakeClient({ 'GET /friends/suggestions': ok({ suggestions: [] }) });
    renderWithProviders(<SearchScreen />);
    expect(await screen.findByText('Type to search across the app.')).toBeTruthy();
    expect(screen.queryAllByTestId('skeleton')).toHaveLength(0);
  });
});

describe('Search when the server cannot answer', () => {
  // a search that failed is not a search that found nothing, and it can be tried again
  it('says it could not search, not that nothing was found, and tries again', async () => {
    let calls = 0;
    testAuth.client = fakeClient({
      'GET /friends/suggestions': ok({ suggestions: [] }),
      'GET /users/search?q=azad': () =>
        ++calls === 1
          ? { ok: false, error: { kind: 'server', message: 'unavailable', status: 503 } }
          : ok({ results: [{ userId: 'u2', username: 'azad', displayName: null }] }),
      'GET /dictionary/search?q=azad': ok({ results: [] }),
    });
    renderWithProviders(<SearchScreen />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'azad' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(screen.queryByText('Nothing found for “azad”.')).toBeNull();
    expect(await screen.findByText('azad')).toBeTruthy();
  });
});

/*
 * From the last letter typed until the server answered, the page was blank:
 * a quarter of a second's pause and the round trip, which read as nothing
 * found. The rows are held in grey now, and the lists the phone holds answer
 * on the letter.
 */
describe('Search while it is looking', () => {
  const course = {
    'GET /courses': ok({ courses: [{ id: 'c1', title: 'Kurmancî', dialect: 'kurmanji' }] }),
    'GET /courses/c1/map': ok({
      course: { id: 'c1', title: 'Kurmancî' },
      units: [{ unitId: 'u1', title: 'Destpêk', position: 1, skills: [{ skillId: 'n1', title: 'Silavkirin', firstLessonId: 'l1', state: 'unlocked' }] }],
    }),
  };

  it('holds the people and the words in grey from the letter typed until the server answers', async () => {
    let answer: (v: unknown) => void = () => undefined;
    testAuth.client = fakeClient({
      'GET /friends/suggestions': ok({ suggestions: [] }),
      'GET /users/search?q=azad': () => new Promise((go) => (answer = go)) as never,
      'GET /dictionary/search?q=azad': ok({ results: [] }),
    });
    renderWithProviders(<SearchScreen />);
    expect(await screen.findByText('Type to search across the app.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'azad' } });
    // at once: before the pause is over, before anything is asked
    expect(screen.getByTestId('search-looking')).toBeTruthy();
    expect(screen.queryByText('Nothing found for “azad”.')).toBeNull();
    await waitFor(() => expect(answer).not.toBe(undefined));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    // asked, and still unanswered: still grey, still not "nothing found"
    expect(screen.getByTestId('search-looking')).toBeTruthy();
    await act(async () => answer(ok({ results: [{ userId: 'u2', username: 'azad', displayName: null }] })));
    expect(await screen.findByText('azad')).toBeTruthy();
    expect(screen.queryByTestId('search-looking')).toBeNull();
  });

  it('finds a lesson on the letter typed, without waiting for the pause or the server', async () => {
    const client = fakeClient({ 'GET /friends/suggestions': ok({ suggestions: [] }), ...course });
    testAuth.client = client;
    renderWithProviders(<SearchScreen />);
    await waitFor(() => expect(client.calls.some((c) => c.path === '/courses/c1/map')).toBe(true));
    await act(async () => undefined);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 's' } });
    // one letter is not asked of the server at all, and the lesson is there in the same breath
    expect(screen.getByRole('button', { name: 'Silavkirin' })).toBeTruthy();
    expect(screen.queryByTestId('search-looking')).toBeNull();
  });

  it('lets go of an answer that comes back after a later search was asked', async () => {
    const answers: Record<string, (v: unknown) => void> = {};
    testAuth.client = fakeClient({
      'GET /friends/suggestions': ok({ suggestions: [] }),
      'GET /users/search?q=az': () => new Promise((go) => (answers.az = go)) as never,
      'GET /dictionary/search?q=az': ok({ results: [] }),
      'GET /users/search?q=azad': ok({ results: [{ userId: 'u2', username: 'azad', displayName: null }] }),
      'GET /dictionary/search?q=azad': ok({ results: [] }),
    });
    renderWithProviders(<SearchScreen />);
    const field = screen.getByLabelText('Search');
    fireEvent.change(field, { target: { value: 'az' } });
    await waitFor(() => expect(answers.az).toBeTruthy());
    fireEvent.change(field, { target: { value: 'azad' } });
    expect(await screen.findByText('azad')).toBeTruthy();
    // the slow answer to the shorter search arrives last, and changes nothing
    await act(async () => answers.az!(ok({ results: [{ userId: 'u9', username: 'azize', displayName: null }] })));
    expect(screen.queryByText('azize')).toBeNull();
    expect(screen.getByText('azad')).toBeTruthy();
  });
});

describe('Search for a person or a game', () => {
  it('looks for a handle without the "@" the app writes before it', async () => {
    const client = fakeClient({
      'GET /friends/suggestions': ok({ suggestions: [] }),
      'GET /users/search?q=dilan': ok({ results: [{ userId: 'u3', username: 'dilan', displayName: null }] }),
      'GET /dictionary/search?q=%40dilan': ok({ results: [] }),
    });
    testAuth.client = client;
    renderWithProviders(<SearchScreen />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '@dilan' } });
    expect(await screen.findByRole('button', { name: 'dilan' })).toBeTruthy();
    expect(client.calls.some((c) => c.path.startsWith('/users/search?q=%40'))).toBe(false);
  });

  /*
   * The games' own register is what is searched: a game added to the Games
   * screen since the search was written is found by name like the first five.
   */
  it('finds a game that has a card on the Games screen, and opens it the way its card does', async () => {
    forgetLastLetterAvailability();
    navigation.navigate.mockReset();
    const listed = (id: string) => ({ id, available: true, difficulties: ['beginner'], levels: {}, levelled: true, minimum: 6 });
    const client = fakeClient({
      'GET /friends/suggestions': ok({ suggestions: [] }),
      'GET /games/availability?dialect=kmr': ok({ dialect: 'kmr', games: [listed('impostor'), listed('who-am-i')] }),
      'GET /mp/last-letter/availability': ok({ dialects: [] }),
    });
    testAuth.client = client;
    renderWithProviders(<SearchScreen />);
    await waitFor(() => expect(client.calls.some((c) => c.path.startsWith('/games/availability'))).toBe(true));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'impostor' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Kurdish Impostor' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Impostor');
    // one name, two ways in: each row says which, and opens that one
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'who am' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Who Am I?, With friends' }));
    expect(navigation.navigate).toHaveBeenCalledWith('WhoAmI', { way: 'friends' });
    // and the first games are found as they always were
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'battle' } });
    expect(await screen.findByRole('button', { name: 'Peyvok Battle' })).toBeTruthy();
  });
});

