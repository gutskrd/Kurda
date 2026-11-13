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
import type { DetectiveBoardView, DetectiveItemView, SoloSessionView } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { resetCourseDialect } from '../learn/courseDialect';
import { GamesView } from '../learn/GamesView';
import { forgetLastLetterAvailability } from '../lastletter/availability';
import { DetectiveScreen } from './DetectiveScreen';

patchReactNativeWeb({ reduceMotion: true });

/** How long a query waits: the characters' drawings are slow to build on a busy machine. */
const SLOW = { timeout: 4000 };

const ID = '00000000-0000-4000-8000-0000000000ff';
const en = (text: string) => ({ en: text });

// a stand-in case, never shown to a learner
const board = (over: Partial<DetectiveBoardView> = {}): DetectiveBoardView => ({
  title: en('The empty jar'),
  intro: en('A jar of honey is empty in the morning.'),
  suspects: [
    { id: 'hamo', name: 'Hamo', about: en('The uncle.'), portrait: 'hamo' },
    { id: 'baran', name: 'Baran', about: en('A son.'), portrait: null },
  ],
  evidence: [
    { id: 'advice', kind: 'note', ku: 'Bi şev hingiv qedexe ye!', meanings: null, speaker: 'xezo', from: null, audio: null },
    { id: 'away', kind: 'statement', ku: 'Baran îro ne li malê ye.', meanings: null, speaker: 'hamo', from: 'hamo', audio: null },
  ],
  steps: 1,
  hintsLeft: 3,
  hintsUsed: 0,
  hints: [],
  moreHints: true,
  notebook: [],
  level: 2,
  ...over,
});

const items: DetectiveItemView[] = [
  { index: 0, kind: 'step', prompt: en('What is forbidden?'), options: [en('Apples'), en('Honey at night')] },
  { index: 1, kind: 'accuse', suspects: ['hamo', 'baran'] },
];

const session = (): SoloSessionView<DetectiveItemView, DetectiveBoardView> => ({
  id: ID,
  game: 'detective',
  dialect: 'kmr',
  difficulty: 'beginner',
  items,
  states: items.map((_, i) => ({ index: i, attempts: 0, correct: false, firstTry: false, done: false })),
  maxAttempts: 2,
  finished: false,
  expiresAt: '2026-11-06T10:00:00.000Z',
  board: board(),
});

const availability = (available = true) =>
  ok({ dialect: 'kmr', games: [{ id: 'detective', available, difficulties: available ? ['beginner'] : [], levels: {}, levelled: true, minimum: 1 }] });

const stepDone = {
  index: 0,
  attempt: 1,
  correct: true,
  firstTry: true,
  done: true,
  hint: null,
  correction: {
    kind: 'step',
    correctIndex: 1,
    entry: { step: 0, prompt: en('What is forbidden?'), answer: en('Honey at night'), evidence: ['advice'] },
    evidence: [{ id: 'advice', meanings: en('Honey at night is forbidden!') }],
    culprit: null,
    solution: null,
    walk: null,
  },
  why: 'step',
  // a case solved alone is scored, and earns no XP: the server sends 0 for every answer and for the round
  xp: 0,
  repeat: false,
};

const accused = {
  index: 1,
  attempt: 1,
  correct: true,
  firstTry: true,
  done: true,
  hint: null,
  correction: { kind: 'accuse', correctIndex: 0, entry: null, evidence: [], culprit: 'hamo', solution: en('Hamo ate the honey.'), walk: [stepDone.correction.entry] },
  why: 'accuse',
  xp: 0,
  repeat: false,
};

function routes(answers: unknown[], hints: unknown[] = [], finish: unknown = {}) {
  let a = 0;
  let h = 0;
  return fakeClient({
    'GET /games/availability?dialect=kmr': availability(),
    'GET /games/solo/open?game=detective&dialect=kmr': ok({ id: null }),
    'POST /games/solo/sessions': ok(session()),
    [`POST /games/solo/sessions/${ID}/answers`]: () => ok(answers[a++]),
    [`POST /games/solo/sessions/${ID}/hints`]: () => ok(hints[h++]),
    [`POST /games/solo/sessions/${ID}/finish`]: ok(finish),
  });
}

/** The start is ready once the difficulties have arrived: Start can be pressed. */
async function ready(): Promise<void> {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start' }).getAttribute('aria-disabled')).not.toBe('true'), SLOW);
}

beforeEach(() => {
  localStorage.clear();
  resetCourseDialect();
  navigation.navigate.mockClear();
  forgetLastLetterAvailability();
});
afterEach(cleanup);

describe('DetectiveScreen', () => {
  it('lays out the board with the evidence in its Kurdish only, and has a card’s meaning for a hint that costs nothing but itself', async () => {
    const client = routes([], [{ board: board({ hintsLeft: 2, hintsUsed: 1, evidence: board().evidence.map((e) => (e.id === 'away' ? { ...e, meanings: en('Baran is not at home today.') } : e)) }) }]);
    testAuth.client = client;
    renderWithProviders(<DetectiveScreen onExit={() => undefined} />);
    await ready();
    // before the case: hints are few, and nothing says one costs XP, or that the case pays any
    expect(screen.getByText(/Hints help, but a case has only a few\.$/)).toBeTruthy();
    expect(screen.queryByText(/XP/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByText('The empty jar', {}, { timeout: 15000 })).toBeTruthy();
    expect(screen.getAllByText('Meaning not found yet')).toHaveLength(2);
    expect(screen.getByText('Baran îro ne li malê ye.')).toBeTruthy();
    // how many are left is the whole price of a hint
    expect(screen.getByText('Hints left: 3')).toBeTruthy();
    expect(screen.getByText('A case has only a few hints, so use them where they help most.')).toBeTruthy();
    expect(screen.queryByText(/XP/)).toBeNull();
    const away = screen.getByTestId('evidence-away');
    fireEvent.click(within(away).getByRole('button', { name: 'Translate it (hint)' }));
    await waitFor(() => expect(client.calls.filter((c) => c.path.endsWith('/hints'))).toHaveLength(1));
    expect(client.calls.find((c) => c.path.endsWith('/hints'))!.body).toEqual({ evidence: 'away' });
    expect(await within(away).findByText('Baran is not at home today.', {}, SLOW)).toBeTruthy();
    expect(screen.getByText('Hints left: 2')).toBeTruthy();
  }, 20000);

  it('notes a deduction, then solves the case: the day counts, one quiet line says where XP comes from, and none is shown', async () => {
    const client = routes([stepDone, accused], [], { correct: 2, total: 2, firstTry: 2, xp: 0, learningCounted: true, needed: 1, items: [], streak: 2 });
    testAuth.client = client;
    renderWithProviders(<DetectiveScreen onExit={() => undefined} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const options = await screen.findByTestId('detective-options', {}, { timeout: 15000 });
    fireEvent.click(within(options).getByRole('button', { name: 'Honey at night' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Written in your notebook.', {}, SLOW)).toBeTruthy();
    expect(client.calls.find((c) => c.path.endsWith('/answers'))!.body).toEqual({ index: 0, answer: { choice: 1 }, attempt: 1 });
    expect(await within(screen.getByTestId('evidence-advice')).findByText('Honey at night is forbidden!', {}, SLOW)).toBeTruthy();
    expect(within(screen.getByTestId('detective-notebook')).getByText('Honey at night')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const suspects = await screen.findByTestId('detective-accused', {}, SLOW);
    fireEvent.click(within(suspects).getByRole('button', { name: 'Hamo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accuse' }));
    expect(await screen.findByText('It was Hamo.', {}, SLOW)).toBeTruthy();
    expect(screen.getByText('Hamo ate the honey.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'See how it went' }));
    expect(await screen.findByText('2 of 2 right', {}, SLOW)).toBeTruthy();
    expect(screen.getByText('Today counts for your streak.')).toBeTruthy();
    expect(screen.getByText('Played alone, a game earns no XP. Play online with friends to earn it.')).toBeTruthy();
    // no XP earned, none taken for hints, and no figure at all
    expect(screen.queryByText(/\d+ XP/)).toBeNull();
    expect(screen.queryByText(/cost/)).toBeNull();
  }, 20000);
});

describe('the games list', () => {
  it('adds Detektîf once a case can be played, one tap to open', async () => {
    testAuth.client = fakeClient({
      'GET /ranks/me': ok({ ranks: [], cooldownUntil: null, season: { id: '2026-Q4', name: 'payiz', year: 2026, startsAt: '', endsAt: '', daysLeft: 40 } }),
      'GET /play/invites': ok({ incoming: [], outgoing: [] }),
      'GET /games/availability?dialect=kmr': availability(),
    });
    renderWithProviders(<GamesView />);
    const card = await screen.findByTestId('game-detective', {}, SLOW);
    expect(card.getAttribute('aria-label')).toBe('Detektîf, Solo. Solve a case from Kurdish evidence, then name who did it.');
    fireEvent.click(card);
    expect(navigation.navigate).toHaveBeenCalledWith('Detective');
  });
});
