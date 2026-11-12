// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

/** The player, as the screen sees it: what it was asked to play, and whether it says it failed. */
const audio = vi.hoisted(() => ({ played: [] as string[], loaded: [] as string[], error: false }));
vi.mock('../lesson/useAudio', () => ({
  canPlayAudio: () => true,
  useAudio: (url: string | undefined) => {
    if (url && !audio.loaded.includes(url)) audio.loaded.push(url);
    return { supported: true, error: audio.error, playing: false, clock: null, source: url ?? null, play: () => audio.played.push(url!) };
  },
}));

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { HearItItemView, SoloSessionView } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { rememberCourseDialect, resetCourseDialect } from '../learn/courseDialect';
import { GamesView } from '../learn/GamesView';
import { HearItScreen } from './HearItScreen';

patchReactNativeWeb({ reduceMotion: true });

const ID = '00000000-0000-4000-8000-0000000000ff';
const CLIP = 'cXV1eHF1dXhxdXV4cXV1eA';

// stand-in words for the stage, never shown to a learner
const item = (over: Partial<HearItItemView> = {}): HearItItemView => ({
  index: 0,
  stage: 'word',
  clip: CLIP,
  replays: 2,
  options: ['bar', 'dar', 'ber', 'bêr'],
  meanings: null,
  speaker: null,
  newVoice: false,
  level: 1,
  ...over,
});

const session = (items: HearItItemView[], dialect: 'kmr' | 'ckb' = 'kmr'): SoloSessionView<HearItItemView> => ({
  id: ID,
  game: 'hear-it',
  dialect,
  difficulty: 'beginner',
  items,
  states: items.map((_, i) => ({ index: i, attempts: 0, correct: false, firstTry: false, done: false })),
  maxAttempts: 2,
  finished: false,
  expiresAt: '2026-11-06T10:00:00.000Z',
});

const availability = (dialect: 'kmr' | 'ckb', available = true) =>
  ok({ dialect, games: [{ id: 'hear-it', available, difficulties: available ? ['beginner'] : [], levels: {}, levelled: false, minimum: 20 }] });

function routes(round: SoloSessionView<HearItItemView>, answers: unknown[]) {
  let n = 0;
  return fakeClient({
    [`GET /games/availability?dialect=${round.dialect}`]: availability(round.dialect),
    [`GET /games/solo/open?game=hear-it&dialect=${round.dialect}`]: ok({ id: null }),
    'POST /games/solo/sessions': ok(round),
    [`POST /games/solo/sessions/${ID}/answers`]: () => ok(answers[n++]),
  });
}

const done = (over: Record<string, unknown> = {}) => ({
  index: 0,
  attempt: 2,
  correct: true,
  firstTry: false,
  done: true,
  hint: null,
  correction: { text: 'Bar', meanings: { en: 'load' }, verdict: 'right', choice: 0, speaker: null },
  why: 'word',
  xp: 1,
  repeat: false,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  resetCourseDialect();
  navigation.navigate.mockClear();
  audio.played = [];
  audio.loaded = [];
  audio.error = false;
});
afterEach(cleanup);

async function start(): Promise<void> {
  await screen.findByText('Up to 16 XP');
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
}

describe('HearItScreen', () => {
  it('opens on the ladder a round climbs', async () => {
    testAuth.client = routes(session([item()]), []);
    renderWithProviders(<HearItScreen onExit={() => undefined} />);
    expect(await screen.findByText('How a round climbs')).toBeTruthy();
    for (const rung of ['Find the word', 'What does it mean?', 'Find the sentence', 'Type what you hear']) expect(screen.getByText(rung)).toBeTruthy();
  });

  it('plays the clip from its round’s handle, and counts the replays down', async () => {
    testAuth.client = routes(session([item()]), []);
    renderWithProviders(<HearItScreen onExit={() => undefined} />);
    await start();
    expect(await screen.findByText('Replays left: 2')).toBeTruthy();
    // played once loaded, from an address that names the round and the handle only
    expect(audio.played).toEqual([`http://api.test/games/solo/sessions/${ID}/clips/${CLIP}`]);
    for (const option of ['bar', 'dar', 'ber', 'bêr']) expect(audio.loaded[0]).not.toContain(option);
    fireEvent.click(await screen.findByRole('button', { name: 'Play it again' }));
    expect(screen.getByText('Replays left: 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Play it again' }));
    expect(screen.getByText('No replays left')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play it again' }).getAttribute('aria-disabled')).toBe('true');
    expect(audio.played).toHaveLength(3);
  });

  it('strikes a wrong pick out, then shows what was said with its meaning', async () => {
    const client = routes(session([item({ speaker: 'hamo', newVoice: true })]), [
      { index: 0, attempt: 1, correct: false, firstTry: false, done: false, hint: { struck: 1, right: null }, correction: null, why: null, xp: 0, repeat: false },
      done(),
    ]);
    testAuth.client = client;
    renderWithProviders(<HearItScreen onExit={() => undefined} />);
    await start();
    expect(await screen.findByText('Hamo speaking')).toBeTruthy();
    expect(screen.getByText('A new voice')).toBeTruthy();
    const choices = screen.getByTestId('hear-choices');
    fireEvent.click(within(choices).getByRole('button', { name: 'dar' }));
    await waitFor(() => expect(client.calls.filter((c) => c.path.endsWith('/answers'))).toHaveLength(1));
    expect(client.calls.find((c) => c.path.endsWith('/answers'))!.body).toEqual({ index: 0, answer: { choice: 1 }, attempt: 1 });
    expect(await screen.findByText('Not that one. Listen again and choose another.')).toBeTruthy();
    expect(await within(choices).findByRole('button', { name: 'dar, not this one' })).toBeTruthy();
    fireEvent.click(within(choices).getByRole('button', { name: 'bar' }));
    expect(await screen.findByText('What was said')).toBeTruthy();
    expect(screen.getByText('Bar')).toBeTruthy();
    expect(screen.getByText('load')).toBeTruthy();
    expect(screen.getByText('Listen as often as you like')).toBeTruthy();
    expect(screen.getByText(/differ by a single sound/)).toBeTruthy();
  });

  it('takes a typed answer with the key bar, and marks the words right where they stand', async () => {
    const client = routes(session([item({ stage: 'type', options: null, replays: 1, level: 5 })]), [
      { index: 0, attempt: 1, correct: false, firstTry: false, done: false, hint: { struck: null, right: [true, false] }, correction: null, why: null, xp: 0, repeat: false },
      done({ correction: { text: 'Ez diçim malê.', meanings: { en: 'I am going home.' }, verdict: 'typo', choice: null, speaker: null }, why: 'type' }),
    ]);
    testAuth.client = client;
    renderWithProviders(<HearItScreen onExit={() => undefined} />);
    await start();
    const field = await screen.findByLabelText('What you heard', { selector: 'input' });
    fireEvent.change(field, { target: { value: 'ez diçim bajêr' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(client.calls.filter((c) => c.path.endsWith('/answers'))).toHaveLength(1));
    expect(client.calls.find((c) => c.path.endsWith('/answers'))!.body).toMatchObject({ answer: { text: 'ez diçim bajêr' } });
    expect(await screen.findByLabelText(/Ticked words are right/)).toBeTruthy();
    expect(screen.getAllByLabelText('Right!')).toHaveLength(1);
    expect(screen.getAllByLabelText('not right here')).toHaveLength(1);
    fireEvent.change(field, { target: { value: 'ez dicim male' } });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Accepted — mind the marks')).toBeTruthy();
    expect(screen.getByText('I am going home.')).toBeTruthy();
  });

  it('says when a recording would not play, and gives the play back', async () => {
    audio.error = true;
    testAuth.client = routes(session([item()]), []);
    renderWithProviders(<HearItScreen onExit={() => undefined} />);
    await start();
    expect(await screen.findByText('This recording didn’t play. Try the play button again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play the recording' })).toBeTruthy();
  });

  it('plays in the learner’s Soranî', async () => {
    rememberCourseDialect('sorani');
    testAuth.client = routes(session([item({ options: ['ماڵ', 'باڵ', 'کاڵ', 'خاڵ'] })], 'ckb'), []);
    renderWithProviders(<HearItScreen onExit={() => undefined} />);
    expect(await screen.findByText('In Soranî')).toBeTruthy();
    await start();
    expect(within(await screen.findByTestId('hear-choices')).getByRole('button', { name: 'ماڵ' })).toBeTruthy();
  });
});

/*
 * Hear It, Find It was a game once. It is an exercise of the lessons'
 * practice now, listed there and never among the games.
 */
describe('Hear It, Find It, as an exercise of the lessons', () => {
  it('is not among the games, even while it can be done', async () => {
    const client = fakeClient({
      'GET /ranks/me': ok({ ranks: [], cooldownUntil: null, season: { id: '2026-Q4', name: 'payiz', year: 2026, startsAt: '', endsAt: '', daysLeft: 40 } }),
      'GET /play/invites': ok({ incoming: [], outgoing: [] }),
      'GET /games/availability?dialect=kmr': availability('kmr'),
    });
    testAuth.client = client;
    renderWithProviders(<GamesView />);
    expect(await screen.findByTestId('game-wordle')).toBeTruthy();
    await waitFor(() => expect(client.calls.some((c) => c.path.startsWith('/games/availability'))).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId('game-hear-it')).toBeNull();
    expect(screen.queryByText('Hear It, Find It')).toBeNull();
  });
});
