// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryListItem } from '@kurda/shared';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { resetPrefsCache } from './prefs';
import { StoriesHubScreen, defaultDialect } from './StoriesHubScreen';

// jsdom has no matchMedia, and react-native-web reads the colour scheme and
// Reduce Motion (for the loading skeleton) through it
vi.hoisted(() => {
  window.matchMedia ??= ((media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

const story = (over: Partial<StoryListItem>): StoryListItem => ({
  id: 's1',
  slug: 'nane-germ',
  title: 'Nanê Germ',
  summary: null,
  dialect: 'kurmanci',
  level: 1,
  length: 'short',
  wordCount: 180,
  readingMinutes: 2,
  fullyNarrated: false,
  ...over,
});

const STORIES = [
  story({}),
  story({ id: 's2', slug: 'bajar', title: 'Bajar', length: 'long', level: 2 }),
  story({ id: 's3', slug: 'bazar', title: 'بازاڕ', dialect: 'sorani' }),
];

function client(extra: Parameters<typeof fakeClient>[0] = {}, stories = STORIES) {
  return fakeClient({
    'GET /stories': ok({ stories }),
    'GET /story-games/active': ok({ games: [] }),
    'GET /story-games/history': ok({ progress: [] }),
    ...extra,
  });
}

async function openJoin(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Join with a code' }));
  await screen.findByLabelText('Join with a code or a link');
}

function typeCode(value: string): void {
  fireEvent.change(screen.getByLabelText('Join with a code or a link'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Join' }));
}

describe('defaultDialect', () => {
  it('opens on Soranî in a Soranî interface, else on what was chosen last, else Kurmancî', () => {
    expect(defaultDialect('ckb', 'kurmanci')).toBe('sorani');
    expect(defaultDialect('en', 'sorani')).toBe('sorani');
    expect(defaultDialect('de', null)).toBe('kurmanci');
  });
});

describe('StoriesHubScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
    navigation.navigate.mockClear();
    navigation.replace.mockClear();
  });
  afterEach(cleanup);

  it('lists one variety’s stories, switches with the variety, and remembers the choice', async () => {
    testAuth.client = client();
    renderWithProviders(<StoriesHubScreen onExit={() => undefined} />);
    expect(await screen.findByText('Nanê Germ')).toBeTruthy();
    expect(screen.getByText('Bajar')).toBeTruthy();
    expect(screen.queryByText('بازاڕ')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Soranî' }));
    expect(await screen.findByText('بازاڕ')).toBeTruthy();
    expect(screen.queryByText('Nanê Germ')).toBeNull();
    expect(JSON.parse(localStorage.getItem('hevalo_stories_prefs_v1') ?? '{}')).toMatchObject({ dialect: 'sorani' });
  });

  it('filters by length, and opens a story in the reader', async () => {
    testAuth.client = client();
    renderWithProviders(<StoriesHubScreen onExit={() => undefined} />);
    await screen.findByText('Nanê Germ');
    fireEvent.click(screen.getByRole('radio', { name: /^Long/ }));
    await waitFor(() => expect(screen.queryByText('Nanê Germ')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /^Bajar\./ }));
    expect(navigation.navigate).toHaveBeenCalledWith('StoryReader', { slug: 'bajar' });
  });

  it('says a variety’s stories are on their way rather than showing an empty list', async () => {
    testAuth.client = client({}, [STORIES[2]!]);
    renderWithProviders(<StoriesHubScreen onExit={() => undefined} />);
    expect(await screen.findByText('Kurmancî stories are on their way — a native speaker checks each one first.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Read Soranî stories' }));
    expect(await screen.findByText('بازاڕ')).toBeTruthy();
  });

  it('joins a game by its code, however it was typed', async () => {
    const c = client({ 'POST /story-games/join': ok({ id: 'g9' }) });
    testAuth.client = c;
    renderWithProviders(<StoriesHubScreen onExit={() => undefined} />);
    await screen.findByText('Nanê Germ');
    await openJoin();
    typeCode('abc-234');
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('StoryGame', { id: 'g9' }));
    expect(c.calls.find((call) => call.path === '/story-games/join')?.body).toEqual({ code: 'ABC234' });
  });

  it('says what is wrong with a code, without sending one that cannot be a code', async () => {
    const c = client({ 'POST /story-games/join': fail({ code: 'GAME_FULL', status: 409 }) });
    testAuth.client = c;
    renderWithProviders(<StoriesHubScreen onExit={() => undefined} />);
    await screen.findByText('Nanê Germ');
    await openJoin();
    typeCode('AB1');
    expect(await screen.findByText('Codes are six letters and numbers, like ABC 234.')).toBeTruthy();
    expect(c.calls.some((call) => call.path === '/story-games/join')).toBe(false);
    typeCode('ABC 234');
    expect(await screen.findByText(/full/i)).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('takes a pasted invite link to any game straight to that game', async () => {
    testAuth.client = client();
    renderWithProviders(<StoriesHubScreen onExit={() => undefined} />);
    await screen.findByText('Nanê Germ');
    await openJoin();
    const lobby = 'a1b2c3d4-0000-4000-8000-000000000001';
    typeCode(`https://hevalo.app/app/games/rhyme-match?id=${lobby}`);
    await act(async () => undefined);
    expect(navigation.navigate).toHaveBeenCalledWith('RhymeMatch', { id: lobby });
  });

  it('hands an invite link that opened the app over to the game itself', () => {
    testAuth.client = client();
    renderWithProviders(<StoriesHubScreen id="g7" onExit={() => undefined} />);
    expect(navigation.replace).toHaveBeenCalledWith('StoryGame', { id: 'g7' });
  });
});
