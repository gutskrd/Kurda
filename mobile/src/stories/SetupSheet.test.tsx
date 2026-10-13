// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryGameView, StoryListItem } from '@kurda/shared';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { resetPrefsCache } from './prefs';
import { SetupSheet } from './SetupSheet';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));

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

// a short and a long story, and nothing medium: Medium is not offered
const STORIES = [story({}), story({ id: 's2', slug: 'bajar', title: 'Bajar', length: 'long', level: 2 })];

const created = { id: 'g1', mode: 'duo', status: 'lobby' } as unknown as StoryGameView;

function radios(group: string): HTMLElement[] {
  return within(screen.getByRole('radiogroup', { name: group })).getAllByRole('radio');
}

function checked(group: string): string | null {
  const on = radios(group).find((r) => r.getAttribute('aria-checked') === 'true');
  return on?.getAttribute('aria-label') ?? null;
}

describe('SetupSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
  });
  afterEach(cleanup);

  it('offers every choice as a named radio group, and only lengths that have a story', async () => {
    testAuth.client = fakeClient({ 'GET /story-games/options': ok({ canHostOpen: false }) });
    renderWithProviders(
      <SetupSheet dialect="kurmanci" stories={STORIES} initialMode="duo" onClose={() => undefined} onCreated={() => undefined} />,
    );
    await act(async () => undefined);
    expect(radios('Who’s playing').map((r) => r.getAttribute('aria-label'))).toEqual(['Just me', 'With a friend', 'With a group']);
    expect(radios('Length').map((r) => r.getAttribute('aria-label'))).toEqual(['Short', 'Long']);
    expect(checked('Story')).toBe('Surprise me');
    expect(radios('Questions').map((r) => r.getAttribute('aria-label'))).toEqual(['3', '5']);
    // together, a minute a question until the host picks
    expect(checked('Time per question')).toBe('60 s');
    expect(checked('Text during questions')).toBe('Text visible');
  });

  it('moves the question count to what a new length allows, and lists only stories of that length', async () => {
    testAuth.client = fakeClient({ 'GET /story-games/options': ok({ canHostOpen: false }) });
    renderWithProviders(
      <SetupSheet dialect="kurmanci" stories={STORIES} initialMode="duo" onClose={() => undefined} onCreated={() => undefined} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Long' }));
    expect(radios('Questions').map((r) => r.getAttribute('aria-label'))).toEqual(['5', '10']);
    expect(checked('Questions')).toBe('5');
    expect(radios('Story').map((r) => r.getAttribute('aria-label'))).toEqual(['Surprise me', 'Bajar']);
  });

  it('asks who can join only of a host who may open a game, and never for a game alone', async () => {
    testAuth.client = fakeClient({ 'GET /story-games/options': ok({ canHostOpen: true }) });
    renderWithProviders(
      <SetupSheet dialect="kurmanci" stories={STORIES} initialMode="group" onClose={() => undefined} onCreated={() => undefined} />,
    );
    expect(await screen.findByRole('radiogroup', { name: 'Who can join' })).toBeTruthy();
    expect(screen.getByText('Only your friends can join.')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Just me' }));
    expect(screen.queryByRole('radiogroup', { name: 'Who can join' })).toBeNull();
    // alone, nobody to wait for: no timer, unless one is picked
    expect(checked('Time per question')).toBe('No timer');
  });

  it('creates the game with exactly what was picked', async () => {
    const client = fakeClient({
      'GET /story-games/options': ok({ canHostOpen: false }),
      'POST /story-games': ok(created),
    });
    testAuth.client = client;
    const onCreated = vi.fn();
    renderWithProviders(
      <SetupSheet dialect="kurmanci" stories={STORIES} initialMode="duo" onClose={() => undefined} onCreated={onCreated} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: '5' }));
    fireEvent.click(screen.getByRole('radio', { name: '30 s' }));
    fireEvent.click(screen.getByRole('radio', { name: 'From memory' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create game' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(client.calls.find((c) => c.method === 'POST')?.body).toEqual({
      mode: 'duo',
      dialect: 'kurmanci',
      length: 'short',
      questionCount: 5,
      timerSeconds: 30,
      textDuring: 'hidden',
      access: 'friends',
    });
  });

  it('says why a game could not be made, in words, and stays open', async () => {
    testAuth.client = fakeClient({
      'GET /story-games/options': ok({ canHostOpen: false }),
      'POST /story-games': fail({ code: 'IN_GAME', status: 409 }),
    });
    const onCreated = vi.fn();
    renderWithProviders(
      <SetupSheet dialect="kurmanci" stories={STORIES} initialMode="duo" onClose={() => undefined} onCreated={onCreated} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create game' }));
    expect(await screen.findByText('You’re already in a game on this story with others. Finish that one first.')).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('from the reader: plays the story just read, goes straight to the questions, and remembers the quiz settings', async () => {
    const client = fakeClient({
      'GET /story-games/options': ok({ canHostOpen: false }),
      'POST /story-games': ok({ ...created, mode: 'solo', status: 'question' }),
    });
    testAuth.client = client;
    const onCreated = vi.fn();
    renderWithProviders(
      <SetupSheet
        dialect="kurmanci"
        stories={STORIES}
        story={STORIES[0]}
        initialMode="solo"
        skipReading
        onClose={() => undefined}
        onCreated={onCreated}
      />,
    );
    expect(screen.getByText('Play this story')).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Length' })).toBeNull();
    expect(screen.getByText('Nanê Germ')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(client.calls.find((c) => c.method === 'POST')?.body).toEqual({
      mode: 'solo',
      storyId: 's1',
      questionCount: 5,
      timerSeconds: 0,
      textDuring: 'visible',
      access: 'friends',
      skipReading: true,
    });
    const saved = JSON.parse(localStorage.getItem('hevalo_stories_prefs_v1') ?? '{}') as { quiz?: unknown };
    expect(saved.quiz).toEqual({ questionCount: { short: 5 }, timerSeconds: 0, textDuring: 'visible' });
  });
});
