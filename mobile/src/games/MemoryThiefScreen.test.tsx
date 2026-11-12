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
import type { MemoryThiefItemView, SoloSessionView } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { rememberCourseDialect, resetCourseDialect } from '../learn/courseDialect';
import { GamesView } from '../learn/GamesView';
import { MemoryThiefScreen, memoryTokens } from './MemoryThiefScreen';

// the thief's ink lifts at once under Reduce Motion, so the gaps are there without waiting
patchReactNativeWeb({ reduceMotion: true });

const ID = '00000000-0000-4000-8000-0000000000ee';

// stand-in passages for the stage, never shown to a learner
type Passage = Omit<MemoryThiefItemView, 'phase' | 'text' | 'parts' | 'tiles'> & {
  text: string;
  parts: NonNullable<MemoryThiefItemView['parts']>;
  tiles: string[] | null;
};
const item = (over: Partial<Passage> = {}): Passage => ({
  index: 0,
  kind: 'story',
  title: 'Rêwîtî',
  parts: [{ line: 0 }, { gap: 0 }, { text: ' li ber ' }, { gap: 1 }, { text: ' ye.' }],
  text: 'Gund li ber çiya ye.',
  speakers: [null],
  gaps: 2,
  studySeconds: 20,
  tiles: ['çiya', 'mal', 'gund', 'bajar'],
  level: 1,
  ...over,
});
/** A passage as the server sends it while it is studied: whole, and nothing of its gaps. */
const studied = (p: Passage): MemoryThiefItemView => ({ ...p, phase: 'study', parts: null, tiles: null });
/** The same once its study is over: its gaps and tiles, and never the passage again. */
const restored = (p: Passage): MemoryThiefItemView => ({ ...p, phase: 'restore', text: null });

type Round = SoloSessionView<MemoryThiefItemView> & { passages: Passage[] };
const session = (passages: Passage[], dialect: 'kmr' | 'ckb' = 'kmr', phase: 'study' | 'restore' = 'study'): Round => ({
  id: ID,
  game: 'memory-thief',
  dialect,
  difficulty: 'beginner',
  items: passages.map(phase === 'study' ? studied : restored),
  passages,
  states: passages.map((_, i) => ({ index: i, attempts: 0, correct: false, firstTry: false, done: false })),
  maxAttempts: 2,
  finished: false,
  expiresAt: '2026-11-06T10:00:00.000Z',
});

const availability = (dialect: 'kmr' | 'ckb', available = true) =>
  ok({ dialect, games: [{ id: 'memory-thief', available, difficulties: available ? ['beginner'] : [], levels: {}, levelled: true, minimum: 6 }] });

function routes(round: Round, answers: unknown[], results?: unknown) {
  let n = 0;
  const { passages, ...view } = round;
  return fakeClient({
    [`GET /games/availability?dialect=${round.dialect}`]: availability(round.dialect),
    [`GET /games/solo/open?game=memory-thief&dialect=${round.dialect}`]: ok({ id: null }),
    'POST /games/solo/sessions': ok(view),
    [`POST /games/solo/sessions/${ID}/begin`]: (body) => ok({ item: restored(passages[(body as { index: number }).index]!) }),
    [`POST /games/solo/sessions/${ID}/answers`]: () => ok(answers[n++]),
    ...(results ? { [`POST /games/solo/sessions/${ID}/finish`]: ok(results) } : {}),
  });
}

/** The start is ready once the difficulties have arrived: Start can be pressed. */
async function ready(): Promise<void> {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start' }).getAttribute('aria-disabled')).not.toBe('true'));
}

/** A round of one passage, its words given back rightly at the first try, taken to its results. */
async function playToResults(): Promise<void> {
  renderWithProviders(<MemoryThiefScreen onExit={() => undefined} />);
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  const tray = await screen.findByTestId('memory-tray');
  fireEvent.click(within(tray).getByRole('button', { name: 'gund' }));
  fireEvent.click(within(tray).getByRole('button', { name: 'çiya' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  fireEvent.click(await screen.findByRole('button', { name: 'See how it went' }));
  await screen.findByText('Round finished');
}

const correction = (verdicts: Array<'right' | 'typo' | 'wrong'>, given: string[]) => ({
  words: [
    { gap: 0, term: 'Gund', meanings: { en: 'village' }, given: given[0], verdict: verdicts[0] },
    { gap: 1, term: 'çiya', meanings: { en: 'mountain' }, given: given[1], verdict: verdicts[1] },
  ],
});

// what the server sends for a passage given back: a game played alone is scored, and every `xp` is 0
const givenBack = {
  index: 0,
  attempt: 1,
  correct: true,
  firstTry: true,
  done: true,
  hint: null,
  correction: correction(['right', 'right'], ['gund', 'çiya']),
  why: null,
  xp: 0,
  repeat: false,
};

beforeEach(() => {
  localStorage.clear();
  resetCourseDialect();
  navigation.navigate.mockClear();
});
afterEach(cleanup);

describe('MemoryThiefScreen', () => {
  it('opens on its three steps, and promises no XP for a game played alone', async () => {
    testAuth.client = routes(session([item()]), []);
    renderWithProviders(<MemoryThiefScreen onExit={() => undefined} />);
    expect(await screen.findByText('Study the passage')).toBeTruthy();
    expect(screen.getByText('Words vanish')).toBeTruthy();
    expect(screen.getByText('Give them back')).toBeTruthy();
    await ready();
    expect(screen.queryByText(/XP/)).toBeNull();
  });

  it('ends a round with what counted and one quiet line about XP, and no XP figure', async () => {
    testAuth.client = routes(session([item()], 'kmr', 'restore'), [givenBack], {
      correct: 1,
      total: 1,
      firstTry: 1,
      xp: 0,
      learningCounted: true,
      needed: 1,
      items: [{ index: 0, correct: true, firstTry: true, xp: 0, repeat: true }],
      streak: 3,
    });
    await playToResults();
    expect(screen.getByText('1 of 1 right')).toBeTruthy();
    expect(screen.getByText('Today counts for your streak.')).toBeTruthy();
    expect(screen.getByText('Played alone, a game earns no XP. Play online with friends to earn it.')).toBeTruthy();
    // nothing earned is shown, not even a zero, and nothing explains XP that was never on offer
    expect(screen.queryByText(/\+\d+ XP/)).toBeNull();
    expect(screen.queryByText('Answered right lately, so no XP this time')).toBeNull();
  });

  it('says what it takes for the day to count when a round fell short, without a word about earning XP', async () => {
    testAuth.client = routes(session([item()], 'kmr', 'restore'), [{ ...givenBack, firstTry: false }], {
      correct: 1,
      total: 1,
      firstTry: 0,
      xp: 0,
      learningCounted: false,
      needed: 1,
      items: [{ index: 0, correct: true, firstTry: false, xp: 0, repeat: false }],
      streak: 3,
    });
    await playToResults();
    expect(screen.getByText('Get at least 1 right on the first try for today to count. This time: 0.')).toBeTruthy();
    expect(screen.getByText('Played alone, a game earns no XP. Play online with friends to earn it.')).toBeTruthy();
    expect(screen.queryByText(/earn XP and count today/)).toBeNull();
    expect(screen.queryByText('Today counts for your streak.')).toBeNull();
  });

  it('opens on the night with its emblem, its name once as the heading, and one way in', async () => {
    testAuth.client = routes(session([item()]), []);
    const { container } = renderWithProviders(<MemoryThiefScreen onExit={() => undefined} />);
    await waitFor(() => expect(container.querySelectorAll('svg[data-xml="drawn"]').length).toBeGreaterThan(0));
    // the screen's header is the heading; the name under the emblem is its caption, not a second heading
    expect(await screen.findByRole('heading', { name: 'The Memory Thief' })).toBeTruthy();
    expect(screen.getAllByText('The Memory Thief')).toHaveLength(2);
    expect(screen.getByText('In Kurmancî')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Start' })).toBeTruthy();
  });

  it('shows the passage, takes its words, and lets them be given back from tiles', async () => {
    const client = routes(session([item()]), [
      { index: 0, attempt: 1, correct: false, firstTry: false, done: false, hint: { wrong: [1] }, correction: null, why: null, xp: 0, repeat: false },
      { index: 0, attempt: 2, correct: true, firstTry: false, done: true, hint: null, correction: correction(['right', 'right'], ['gund', 'çiya']), why: 'glossary', xp: 0, repeat: false },
    ]);
    testAuth.client = client;
    renderWithProviders(<MemoryThiefScreen onExit={() => undefined} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    // the whole passage is there to study, with the time running
    const page = await screen.findByTestId('memory-page');
    expect(page.textContent).toContain('Gund');
    expect(page.textContent).toContain('çiya');
    expect(screen.getByLabelText('20 s to study')).toBeTruthy();

    // ready: the gaps are asked for once the study is over, never sent with the passage
    expect(client.calls.some((c) => c.path.endsWith('/begin'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'I’m ready' }));
    expect(await screen.findByRole('button', { name: 'Missing word 1, empty' })).toBeTruthy();
    expect(client.calls.find((c) => c.path.endsWith('/begin'))!.body).toEqual({ index: 0 });
    expect(page.textContent).not.toContain('Gund');
    expect(page.textContent).not.toContain('çiya');

    const tray = screen.getByTestId('memory-tray');
    fireEvent.click(within(tray).getByRole('button', { name: 'gund' }));
    expect(screen.getByRole('button', { name: 'Missing word 1: gund' })).toBeTruthy();
    fireEvent.click(within(tray).getByRole('button', { name: 'mal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(client.calls.filter((c) => c.path.endsWith('/answers'))).toHaveLength(1));
    expect(client.calls.find((c) => c.path.endsWith('/answers'))!.body).toEqual({ index: 0, answer: { gaps: ['gund', 'mal'] }, attempt: 1 });

    // the wrong gap glows again, emptied; the right one is kept
    expect(await screen.findByText('The glowing gaps are still wrong; the others are right.')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Missing word 2, empty' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Missing word 1: gund' })).toBeTruthy();
    fireEvent.click(within(tray).getByRole('button', { name: 'çiya' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('The words the thief took')).toBeTruthy();
    expect(client.calls.filter((c) => c.path.endsWith('/answers'))[1]!.body).toEqual({ index: 0, answer: { gaps: ['gund', 'çiya'] }, attempt: 2 });
    expect(screen.getByText('village')).toBeTruthy();
    expect(screen.getByText('mountain')).toBeTruthy();
    expect(screen.getByText(/glossary words/)).toBeTruthy();
  });

  it('is typed at the advanced difficulty, a gap at a time with the key bar', async () => {
    const client = routes(session([item({ tiles: null })]), [
      { index: 0, attempt: 1, correct: true, firstTry: true, done: true, hint: null, correction: correction(['right', 'typo'], ['gund', 'ciya']), why: 'vocabulary', xp: 0, repeat: false },
    ]);
    testAuth.client = client;
    renderWithProviders(<MemoryThiefScreen onExit={() => undefined} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(await screen.findByRole('button', { name: 'I’m ready' }));
    fireEvent.change(await screen.findByLabelText('Missing word 1', { selector: 'input' }), { target: { value: 'gund' } });
    fireEvent.click(screen.getByRole('button', { name: 'Missing word 2' }));
    fireEvent.change(screen.getByLabelText('Missing word 2', { selector: 'input' }), { target: { value: 'ciya' } });
    expect(screen.getByRole('button', { name: 'Missing word 2: ciya' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(client.calls.filter((c) => c.path.endsWith('/answers'))).toHaveLength(1));
    expect(client.calls.find((c) => c.path.endsWith('/answers'))!.body).toMatchObject({ answer: { gaps: ['gund', 'ciya'] } });
    expect(await screen.findByText('Accepted — mind the marks')).toBeTruthy();
  });

  it('opens a passage whose words already vanished on its gaps, with no study', async () => {
    const client = routes(session([item()], 'kmr', 'restore'), []);
    testAuth.client = client;
    renderWithProviders(<MemoryThiefScreen onExit={() => undefined} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('button', { name: 'Missing word 1, empty' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'I’m ready' })).toBeNull();
    expect((await screen.findByTestId('memory-page')).textContent).not.toContain('Gund');
    expect(within(screen.getByTestId('memory-tray')).getByRole('button', { name: 'gund' })).toBeTruthy();
    expect(client.calls.some((c) => c.path.endsWith('/begin'))).toBe(false);
  });

  it('names who says each line, and lays a Soranî page out from the right', async () => {
    rememberCourseDialect('sorani');
    testAuth.client = routes(
      session(
        [
          item({
            kind: 'conversation',
            title: null,
            text: 'تۆ دەچیت بۆ کوێ؟\nبۆ بازاڕ.',
            speakers: ['hamo', 'xezo'],
            parts: [{ line: 0 }, { text: 'تۆ دەچیت بۆ کوێ؟' }, { line: 1 }, { text: 'بۆ ' }, { gap: 0 }, { text: '.' }],
            gaps: 1,
            tiles: ['بازاڕ', 'ماڵ'],
          }),
        ],
        'ckb',
      ),
      [],
    );
    renderWithProviders(<MemoryThiefScreen onExit={() => undefined} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const page = await screen.findByTestId('memory-page');
    expect(within(page).getByText('Hamo')).toBeTruthy();
    expect(within(page).getByText('Xezo')).toBeTruthy();
    expect(within(page).getByText('From a conversation')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'I’m ready' }));
    expect(getComputedStyle(await screen.findByTestId('memory-tray')).flexDirection).toBe('row-reverse');
  });
});

describe('memoryTokens', () => {
  it('cuts a line into words and keeps the punctuation that touches a gap on it', () => {
    expect(
      memoryTokens([{ text: 'Got: «' }, { gap: 0, word: 'Bajar' }, { text: '», ez ' }, { gap: 1, word: 'diçim' }, { text: '.' }]),
    ).toEqual([
      { word: 'Got:' },
      { gap: 0, word: 'Bajar', before: '«', after: '»,' },
      { word: 'ez' },
      { gap: 1, word: 'diçim', before: '', after: '.' },
    ]);
    expect(memoryTokens([{ gap: 0, word: 'Gund' }, { text: ' li ber ' }, { gap: 1, word: 'çiya' }, { text: ' ye.' }])).toEqual([
      { gap: 0, word: 'Gund', before: '', after: '' },
      { word: 'li' },
      { word: 'ber' },
      { gap: 1, word: 'çiya', before: '', after: '' },
      { word: 'ye.' },
    ]);
  });
});

describe('the games list', () => {
  const base = {
    'GET /ranks/me': ok({ ranks: [], cooldownUntil: null, season: { id: '2026-Q4', name: 'payiz', year: 2026, startsAt: '', endsAt: '', daysLeft: 40 } }),
    'GET /play/invites': ok({ incoming: [], outgoing: [] }),
  };

  it('adds The Memory Thief as a card once it can be played, one tap to open', async () => {
    testAuth.client = fakeClient({ ...base, 'GET /games/availability?dialect=kmr': availability('kmr') });
    renderWithProviders(<GamesView />);
    const card = await screen.findByTestId('game-memory-thief');
    expect(card.getAttribute('aria-label')).toBe('The Memory Thief, Solo. Study a real passage, then give back the words the thief took.');
    fireEvent.click(card);
    expect(navigation.navigate).toHaveBeenCalledWith('MemoryThief');
  });
});
