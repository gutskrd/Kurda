// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryDetail } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { resetPrefsCache } from './prefs';
import { NANE_GERM } from './testing/views';
import { StoryReaderScreen } from './StoryReaderScreen';

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
vi.mock('expo-audio', () => ({
  createAudioPlayer: () => ({
    addListener: () => ({ remove: () => undefined }),
    replace: () => undefined,
    play: () => undefined,
    pause: () => undefined,
    seekTo: () => Promise.resolve(),
    setPlaybackRate: () => undefined,
    remove: () => undefined,
  }),
}));

/** A short legend in two chapters, with an introduction, the way the server sends one. */
const LEGEND: StoryDetail = {
  ...NANE_GERM,
  id: 's9',
  slug: 'kela-dimdime',
  title: 'Kela Dimdimê',
  summary: 'Çîroka kelayekê.',
  length: 'saga',
  paragraphs: [
    'Ev çîrok kevn e. Dapîran ji me re gotiye.',
    '## Kela Dimdimê',
    'Li ser çiyê kelayek hebû. Kela germ bû.',
    '## Şer',
    'Dijmin hat. Mirov li ber xwe dan.',
  ],
  sections: [
    { title: 'Kela Dimdimê', paragraph: 1 },
    { title: 'Şer', paragraph: 3 },
  ],
  // a glossary word that is also in a heading, which the heading must not mark
  glossary: [{ term: 'Kela', meanings: { en: 'fortress' } }],
  translations: { en: ['This story is old.', '## The fortress', 'On the mountain stood a fortress.', '## The battle', 'The enemy came.'] },
  metaTranslations: { en: { title: 'The Fortress of Dimdim', summary: 'The story of a fortress.' } },
  reflections: [{ text: 'Tu dê çi bikira?', translations: { en: 'What would you have done?' } }],
  notes: [{ kind: 'history', title: 'Dîrok û efsane', body: 'Kela hebû; gelek tişt efsane ne.', translations: { en: { title: 'Legend and history', body: 'The fortress existed; much else is legend.' } } }],
  sources: [{ title: 'Dimdim', type: 'literary', url: 'https://example.org/dimdim' }],
};

const routes = () =>
  fakeClient({
    'GET /stories/kela-dimdime': ok(LEGEND),
    'GET /stories/categories': ok({ categories: [] }),
    'GET /story-games/active': ok({ games: [] }),
    'PUT /stories/s9/progress': ok({ me: { bookmarked: false, paragraph: 0, share: 0, finishedAt: null, bestCorrect: null, total: null, attemptsToday: 0 } }),
  });

beforeEach(() => {
  localStorage.clear();
  resetPrefsCache();
  navigation.navigate.mockClear();
});
afterEach(cleanup);

describe('a legend in the reader', () => {
  it('gives the title and summary in the reader’s language under the Kurdish, and lists the chapters', async () => {
    testAuth.client = routes();
    renderWithProviders(<StoryReaderScreen slug="kela-dimdime" onExit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Kela Dimdimê' })).toBeTruthy();
    expect(screen.getByTestId('story-title-translation').textContent).toBe('The Fortress of Dimdim');
    expect(screen.getByText('The story of a fortress.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Chapters' })).toBeTruthy();
    expect(within(screen.getByTestId('chapter-row-intro')).getByText('Introduction')).toBeTruthy();
    expect(within(screen.getByTestId('chapter-row-c1')).getByText('The fortress')).toBeTruthy();
    // what is known about it, and where it comes from, by what kind of source each is
    expect(within(screen.getByTestId('story-notes')).getByText('Legend and history')).toBeTruthy();
    expect(within(screen.getByTestId('story-sources')).getByText('Literary work')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dimdim, Literary work' })).toBeTruthy();
  });

  it('sets its headings as chapter titles, never as text with ## or a word to tap', async () => {
    testAuth.client = routes();
    renderWithProviders(<StoryReaderScreen slug="kela-dimdime" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Read' }));
    const text = await screen.findByTestId('story-text');
    expect(text.textContent).not.toContain('##');
    const first = within(text).getByTestId('story-chapter-1');
    expect(within(first).getByRole('heading', { name: 'Kela Dimdimê' })).toBeTruthy();
    expect(first.textContent).toContain('Chapter 1');
    expect(within(text).getByTestId('story-chapter-2').textContent).toContain('Şer');
    // the introduction is said to be one, before the first chapter
    expect(within(text).getByRole('heading', { name: 'Introduction' })).toBeTruthy();
    // the glossary word is marked in the paragraph, not in the heading
    expect(within(first).queryByText('Kela')).toBeNull();
    // and a heading has no Translation toggle of its own: one per paragraph, three paragraphs
    expect(within(text).getAllByRole('button', { name: /^Translation of paragraph/ })).toHaveLength(3);
  });

  it('says which chapter is being read, and goes to another from the list', async () => {
    testAuth.client = routes();
    renderWithProviders(<StoryReaderScreen slug="kela-dimdime" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Read' }));
    const line = await screen.findByTestId('story-chapter-line');
    expect(line.textContent).toContain('Introduction');
    fireEvent.click(line);
    const sheet = await screen.findByRole('heading', { name: 'Chapters' });
    expect(sheet).toBeTruthy();
    expect(screen.getByText('You are here')).toBeTruthy();
    fireEvent.click(screen.getByTestId('chapter-row-c3'));
    await waitFor(() => expect(screen.queryByText('You are here')).toBeNull());
    expect(screen.getByTestId('story-chapter-line').textContent).toContain('Chapter 2 of 2');
  });

  it('ends with questions to think about, nothing scored', async () => {
    testAuth.client = routes();
    renderWithProviders(<StoryReaderScreen slug="kela-dimdime" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Read' }));
    const think = await screen.findByTestId('story-reflections');
    expect(within(think).getByRole('heading', { name: 'Think about it' })).toBeTruthy();
    expect(within(think).getByText('Tu dê çi bikira?')).toBeTruthy();
    expect(within(think).getByText('What would you have done?')).toBeTruthy();
    expect(think.textContent).not.toMatch(/XP/);
    expect(within(think).queryByRole('button')).toBeNull();
  });
});
