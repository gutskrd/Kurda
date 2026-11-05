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
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ScenarioCorrection, SoloSessionView, WhatWouldYouSayItemView } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { rememberCourseDialect, resetCourseDialect } from '../learn/courseDialect';
import { GamesView } from '../learn/GamesView';
import { forgetLastLetterAvailability } from '../lastletter/availability';
import { WhatWouldYouSayScreen } from './WhatWouldYouSayScreen';

patchReactNativeWeb({ reduceMotion: true });

const ID = '00000000-0000-4000-8000-0000000000ee';

// stand-in lines, never shown to a learner
const scene = (over: Partial<WhatWouldYouSayItemView> = {}): WhatWouldYouSayItemView => ({
  index: 0,
  situation: { en: 'At the party, a cousin turns to you.' },
  place: 'party',
  speaker: 'hamo',
  line: { ku: 'Tu çend salî yî?', audio: null },
  options: ['Li wir sêv hene!', 'Ez heft salî me.', 'Ez ne hêdî me!'],
  tiles: null,
  level: 1,
  ...over,
});

const session = (dialect: 'kmr' | 'ckb', item: WhatWouldYouSayItemView): SoloSessionView<WhatWouldYouSayItemView> => ({
  id: ID,
  game: 'what-would-you-say',
  dialect,
  difficulty: 'beginner',
  items: [item],
  states: [{ index: 0, attempts: 0, correct: false, firstTry: false, done: false }],
  maxAttempts: 2,
  finished: false,
  expiresAt: '2026-11-06T10:00:00.000Z',
});

const availability = (dialect: 'kmr' | 'ckb', available = true) =>
  ok({ dialect, games: [{ id: 'what-would-you-say', available, difficulties: available ? ['beginner', 'advanced'] : [], levels: {}, levelled: true, minimum: 8 }] });

const correction: ScenarioCorrection = {
  line: { ku: 'Tu çend salî yî?', meanings: { en: 'How old are you?' } },
  reply: { ku: 'Ez heft salî me.', meanings: { en: 'I am seven.' }, why: null, audio: null },
  options: [
    { ku: 'Li wir sêv hene!', meanings: { en: 'There are apples over there!' }, why: { en: 'That is about apples.' }, fits: false },
    { ku: 'Ez heft salî me.', meanings: { en: 'I am seven.' }, why: null, fits: true },
    { ku: 'Ez ne hêdî me!', meanings: { en: 'I am not slow!' }, why: null, fits: false },
  ],
  chosen: 1,
  firstWrong: null,
};

function routes(dialect: 'kmr' | 'ckb', item: WhatWouldYouSayItemView, answers: unknown[]) {
  let n = 0;
  return fakeClient({
    [`GET /games/availability?dialect=${dialect}`]: availability(dialect),
    [`GET /games/solo/open?game=what-would-you-say&dialect=${dialect}`]: ok({ id: null }),
    'POST /games/solo/sessions': ok(session(dialect, item)),
    [`POST /games/solo/sessions/${ID}/answers`]: () => ok(answers[n++]),
  });
}

beforeEach(() => {
  localStorage.clear();
  resetCourseDialect();
  navigation.navigate.mockClear();
  forgetLastLetterAvailability();
});
afterEach(cleanup);

describe('WhatWouldYouSayScreen', () => {
  it('stages the scene, rules a wrong reply out with what it means, then explains every option', async () => {
    const client = routes('kmr', scene(), [
      { index: 0, attempt: 1, correct: false, firstTry: false, done: false, hint: { ruledOut: 0, meanings: { en: 'There are apples over there!' }, firstWrong: null }, correction: null, why: null, xp: 0, repeat: false },
      { index: 0, attempt: 2, correct: true, firstTry: false, done: true, hint: null, correction, why: 'reply', xp: 1, repeat: false },
    ]);
    testAuth.client = client;
    renderWithProviders(<WhatWouldYouSayScreen onExit={() => undefined} />);
    await screen.findByText('Up to 16 XP');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    // the speaker's drawing is the first a test file builds, so it is given a moment
    expect(await screen.findByText('At a celebration', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText('At the party, a cousin turns to you.')).toBeTruthy();
    expect(screen.getByLabelText('Hamo says')).toBeTruthy();
    expect(screen.getByText('Tu çend salî yî?')).toBeTruthy();

    const replies = screen.getByTestId('say-replies');
    fireEvent.click(within(replies).getByRole('button', { name: 'Li wir sêv hene!' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(client.calls.filter((c) => c.path.endsWith('/answers'))).toHaveLength(1));
    expect(client.calls.find((c) => c.path.endsWith('/answers'))!.body).toEqual({ index: 0, answer: { choice: 0 }, attempt: 1 });
    expect(await screen.findByText('That doesn’t answer it. It means: “There are apples over there!”')).toBeTruthy();

    fireEvent.click(within(replies).getByRole('button', { name: 'Ez heft salî me.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('In the conversation, this is what was really said next.')).toBeTruthy();
    const explained = screen.getByTestId('say-explained');
    expect(within(explained).getByText('They said: “How old are you?”')).toBeTruthy();
    expect(within(explained).getByText('The real reply')).toBeTruthy();
    expect(within(explained).getByText('That is about apples.')).toBeTruthy();
  });

  it('builds the reply from tiles at the advanced level', async () => {
    const client = routes('kmr', scene({ options: null, tiles: ['me', 'heft', 'Ez', 'salî'] }), [
      { index: 0, attempt: 1, correct: false, firstTry: false, done: false, hint: { ruledOut: null, meanings: null, firstWrong: 0 }, correction: null, why: null, xp: 0, repeat: false },
    ]);
    testAuth.client = client;
    renderWithProviders(<WhatWouldYouSayScreen onExit={() => undefined} />);
    await screen.findByText('Up to 16 XP');
    fireEvent.click(screen.getByRole('radio', { name: 'Advanced' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const tray = await screen.findByTestId('say-tray');
    fireEvent.click(within(tray).getByRole('button', { name: 'heft' }));
    fireEvent.click(within(tray).getByRole('button', { name: 'Ez' }));
    expect(within(screen.getByTestId('say-line')).getAllByRole('button').map((b) => b.textContent)).toEqual(['heft', 'Ez']);
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(client.calls.filter((c) => c.path.endsWith('/answers'))).toHaveLength(1));
    expect(client.calls.find((c) => c.path.endsWith('/answers'))!.body).toEqual({ index: 0, answer: { order: [1, 2] }, attempt: 1 });
    expect(await screen.findByText('Look again from the marked word.')).toBeTruthy();
  });

  it('plays in the learner’s Soranî, the line written right to left', async () => {
    rememberCourseDialect('sorani');
    testAuth.client = routes('ckb', scene({ line: { ku: 'تەمەنت چەندە؟', audio: null }, options: ['حەوت ساڵم', 'سوپاس'] }), []);
    renderWithProviders(<WhatWouldYouSayScreen onExit={() => undefined} />);
    expect(await screen.findByText('In Soranî')).toBeTruthy();
    await screen.findByText('Up to 16 XP');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const line = await screen.findByText('تەمەنت چەندە؟');
    expect(getComputedStyle(line).direction === 'rtl' || line.getAttribute('dir') === 'rtl' || (line as HTMLElement).style.writingDirection === 'rtl').toBe(true);
  });
});

describe('the games list', () => {
  const base = {
    'GET /ranks/me': ok({ ranks: [], cooldownUntil: null, season: { id: '2026-Q4', name: 'payiz', year: 2026, startsAt: '', endsAt: '', daysLeft: 40 } }),
    'GET /play/invites': ok({ incoming: [], outgoing: [] }),
  };

  it('adds What Would You Say? once it can be played, one tap to open', async () => {
    testAuth.client = fakeClient({ ...base, 'GET /games/availability?dialect=kmr': availability('kmr') });
    renderWithProviders(<GamesView />);
    const card = await screen.findByTestId('game-what-would-you-say');
    expect(card.getAttribute('aria-label')).toBe('What Would You Say?, Solo. Answer someone in a real Kurdish conversation, the way it really went on.');
    fireEvent.click(card);
    expect(navigation.navigate).toHaveBeenCalledWith('WhatWouldYouSay');
  });
});
