// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Share } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { RiddlesScreen } from './RiddlesScreen';
import { RiddleScreen } from './RiddleScreen';
import { RiddleAnswerScreen } from './RiddleAnswerScreen';
import { rememberAnswer, rememberList, resetLoreStore } from './store';
import { ANSWER, HINT, HINT_2, QUESTION, QUESTION_EN, RIDDLES, SPOILERS, card } from './test/fixtures';

// Jsdom has no matchMedia, and react-native-web reads the colour scheme and Reduce Motion through it.
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
vi.mock('../net/usePullRefresh', () => import('../net/testing/pullRefresh'));

/**
 * A server that sends a hint, the answer and the explanation only from the calls meant to (the hint route, a right
 * guess, a reveal); the list and the riddle's page carry only what the API sends.
 */
function server(extra: Parameters<typeof fakeClient>[0] = {}) {
  return fakeClient({
    'GET /riddles?dialect=kmr': ok(RIDDLES),
    'GET /riddles/kmr-mum': ok({ riddle: { ...card(), hintsUsed: [] } }),
    'POST /riddles/kmr-mum/hint': (body) => ok({ hint: (body as { index: number }).index === 0 ? HINT : HINT_2 }),
    'POST /riddles/kmr-mum/guess': (body) => ((body as { guess: string }).guess === 'mûm' ? ok({ correct: true, answer: ANSWER, xp: 3 }) : ok({ correct: false })),
    'POST /riddles/kmr-mum/reveal': ok({ answer: ANSWER }),
    ...extra,
  });
}

const posts = (client: ReturnType<typeof fakeClient>) => client.calls.filter((c) => c.method !== 'GET');
const pageText = (): string => document.body.textContent ?? '';
const pageMarkup = (): string => document.body.innerHTML;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  testAuth.user = { ...testAuth.user, guest: false };
});
afterEach(() => {
  cleanup();
  resetLoreStore();
});

describe('nothing spoils a riddle before it is asked for', () => {
  it('the list and the riddle’s page hold no answer, hint or explanation, and ask for none', async () => {
    const client = server();
    testAuth.client = client;
    renderWithProviders(<RiddlesScreen dialect="kmr" onExit={() => undefined} />);
    await screen.findByTestId('riddle-daily');
    // The translations too, which a reader may turn on.
    fireEvent.click(screen.getByRole('switch', { name: 'Show translations' }));
    await screen.findAllByText(QUESTION_EN);
    for (const spoiler of SPOILERS) {
      expect(pageText()).not.toContain(spoiler);
      expect(pageMarkup()).not.toContain(spoiler);
    }
    cleanup();

    renderWithProviders(<RiddleScreen slug="kmr-mum" onExit={() => undefined} />);
    await screen.findByTestId('riddle-question');
    fireEvent.click(screen.getByRole('button', { name: 'Translation' }));
    await screen.findByText(QUESTION_EN);
    for (const spoiler of SPOILERS) {
      expect(pageText()).not.toContain(spoiler);
      expect(pageMarkup()).not.toContain(spoiler);
    }
    // Read only: no hint, guess or reveal was asked for on anyone's behalf.
    expect(posts(client)).toEqual([]);
    expect(client.calls.map((c) => c.path)).toEqual(['/riddles?dialect=kmr', '/riddles/kmr-mum']);
  });
});

describe('the riddles’ list', () => {
  it('opens on the solved count, the riddle of the day and every riddle by difficulty', async () => {
    testAuth.client = server();
    renderWithProviders(<RiddlesScreen dialect="kmr" onExit={() => undefined} />);
    expect(await screen.findByText('1 of 3 solved')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Metelok, Riddles' })).toBeTruthy();
    const daily = screen.getByTestId('riddle-daily');
    expect(daily.textContent).toContain(QUESTION);
    expect(daily.textContent).toContain('Riddle of the day');
    expect(screen.getAllByRole('heading', { name: 'Easy' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('heading', { name: 'Hard' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Xaniyek heye bê derî, tijî şîrînî ye.' })).toBeTruthy();
  });

  it('keeps to one difficulty when its chip is chosen', async () => {
    testAuth.client = server();
    renderWithProviders(<RiddlesScreen dialect="kmr" onExit={() => undefined} />);
    await screen.findByTestId('riddle-daily');
    fireEvent.click(screen.getByRole('button', { name: 'Hard' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Xaniyek heye bê derî, tijî şîrînî ye.' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Bê bask difire, bê çav digirî.' })).toBeTruthy();
  });

  it('opens a riddle on its own page', async () => {
    testAuth.client = server();
    renderWithProviders(<RiddlesScreen dialect="kmr" onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('riddle-daily'));
    expect(navigation.navigate).toHaveBeenCalledWith('Riddle', { slug: 'kmr-mum' });
  });

  it('says once to a guest that an account keeps their riddles everywhere', async () => {
    testAuth.client = server();
    testAuth.user = { ...testAuth.user, guest: true };
    renderWithProviders(<RiddlesScreen dialect="kmr" onExit={() => undefined} />);
    expect(await screen.findByText(/playing as a guest/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText(/playing as a guest/)).toBeNull());
    cleanup();
    renderWithProviders(<RiddlesScreen dialect="kmr" onExit={() => undefined} />);
    await screen.findByTestId('riddle-daily');
    expect(screen.queryByText(/playing as a guest/)).toBeNull();
  });

  it('says so when a variety has no riddles yet', async () => {
    testAuth.client = fakeClient({ 'GET /riddles?dialect=ckb': ok({ riddles: [], daily: null, solved: 0, total: 0 }) });
    renderWithProviders(<RiddlesScreen dialect="ckb" onExit={() => undefined} />);
    expect(await screen.findByText(/no riddles in Soranî yet/)).toBeTruthy();
  });
});

describe('a riddle’s page', () => {
  it('gives one hint at a time, from the server, when it is asked for', async () => {
    const client = server();
    testAuth.client = client;
    renderWithProviders(<RiddleScreen slug="kmr-mum" onExit={() => undefined} />);
    expect(await screen.findByText('Solve it for 3 XP. Taking a hint halves that.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Take a hint (1 of 2)' }));
    expect(await screen.findByText(HINT.text)).toBeTruthy();
    expect(screen.getByText(HINT.translations.en!)).toBeTruthy();
    expect(screen.queryByText(HINT_2.text)).toBeNull();
    // A hint halves what the solve pays, and says so.
    expect(screen.getByText('Solve it for 2 XP.')).toBeTruthy();
    expect(posts(client)).toEqual([{ method: 'POST', path: '/riddles/kmr-mum/hint', body: { index: 0 } }]);
    fireEvent.click(screen.getByRole('button', { name: 'Take a hint (2 of 2)' }));
    expect(await screen.findByText(HINT_2.text)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Take a hint/ })).toBeNull();
  });

  it('says kindly when a guess is not it, and keeps the guess to change', async () => {
    testAuth.client = server();
    renderWithProviders(<RiddleScreen slug="kmr-mum" onExit={() => undefined} />);
    const field = (await screen.findByLabelText('Your answer')) as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'av' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findAllByText('Not this time. Have another think and try again.')).toBeTruthy();
    expect(field.value).toBe('av');
    expect(pageText()).not.toContain(ANSWER.answer);
  });

  it('says a near guess is near, and sends the reader’s language so a guess in it can be told apart', async () => {
    const client = server({ 'POST /riddles/kmr-mum/guess': ok({ correct: false, near: 'close' }) });
    testAuth.client = client;
    renderWithProviders(<RiddleScreen slug="kmr-mum" onExit={() => undefined} />);
    const field = (await screen.findByLabelText('Your answer')) as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'mom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findAllByText('Close, but not quite. Think again!')).toBeTruthy();
    expect(posts(client).find((c) => c.path.endsWith('/guess'))!.body).toEqual({ guess: 'mom', locale: 'en' });
    expect(pageText()).not.toContain(ANSWER.answer);
  });

  it('celebrates a right guess quietly, with the XP the server paid, and goes on to why', async () => {
    testAuth.client = server();
    renderWithProviders(<RiddleScreen slug="kmr-mum" onExit={() => undefined} />);
    fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value: 'mûm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    const solved = await screen.findByTestId('riddle-solved');
    expect(solved.textContent).toContain('That’s it!');
    expect(solved.textContent).toContain('mûm');
    expect(solved.textContent).toContain('+3 XP');
    fireEvent.click(screen.getByRole('button', { name: 'See why it’s right' }));
    expect(navigation.replace).toHaveBeenCalledWith('RiddleAnswer', { slug: 'kmr-mum' });
  });

  it('asks once before showing the answer, then opens it on its own screen', async () => {
    const client = server();
    testAuth.client = client;
    renderWithProviders(<RiddleScreen slug="kmr-mum" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Show the answer' }));
    expect(await screen.findByText('Show the answer?')).toBeTruthy();
    expect(posts(client)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Keep thinking' }));
    await waitFor(() => expect(screen.queryByText('Show the answer?')).toBeNull());
    expect(posts(client)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Show the answer' }));
    fireEvent.click(await screen.findByTestId('riddle-reveal-confirm'));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('RiddleAnswer', { slug: 'kmr-mum' }));
    expect(posts(client)).toEqual([{ method: 'POST', path: '/riddles/kmr-mum/reveal', body: undefined }]);
  });

  it('challenges a friend with the question and its link, never the answer', async () => {
    const share = vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    testAuth.client = server();
    renderWithProviders(<RiddleScreen slug="kmr-mum" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Challenge a friend' }));
    expect(share).toHaveBeenCalledTimes(1);
    const message = (share.mock.calls[0]![0] as { message: string }).message;
    expect(message).toContain(QUESTION);
    expect(message).toContain('https://hevalo.app/app/learn/riddles/kmr-mum');
    for (const spoiler of SPOILERS) expect(message).not.toContain(spoiler);
  });

  it('keeps the hints already taken, and for a riddle already solved offers its answer instead of the field', async () => {
    testAuth.client = server({ 'GET /riddles/kmr-mum': ok({ riddle: { ...card({ state: 'solved' }), hintsUsed: [HINT] } }) });
    renderWithProviders(<RiddleScreen slug="kmr-mum" onExit={() => undefined} />);
    expect(await screen.findByText(HINT.text)).toBeTruthy();
    expect(screen.getByText('You’ve solved this one.')).toBeTruthy();
    expect(screen.queryByLabelText('Your answer')).toBeNull();
  });

  it('says a riddle that is gone is gone', async () => {
    testAuth.client = fakeClient({ 'GET /riddles/kmr-x': fail({ status: 404, code: 'NOT_FOUND' }) });
    renderWithProviders(<RiddleScreen slug="kmr-x" onExit={() => undefined} />);
    expect(await screen.findByText('This riddle isn’t available any more.')).toBeTruthy();
  });
});

describe('a riddle’s answer', () => {
  it('shows the answer, why it is right, where it comes from, its sources and the next riddle', async () => {
    testAuth.client = fakeClient({});
    rememberList('kmr', RIDDLES.riddles, RIDDLES.daily);
    rememberAnswer('kmr-mum', ANSWER, true, 3);
    renderWithProviders(<RiddleAnswerScreen slug="kmr-mum" onExit={() => undefined} />);
    expect((await screen.findByTestId('riddle-answer')).textContent).toContain('mûm');
    expect(screen.getByText('a candle')).toBeTruthy();
    expect(screen.getByText('You solved it')).toBeTruthy();
    expect(screen.getByText('+3 XP')).toBeTruthy();
    expect(screen.getByText(ANSWER.explanation)).toBeTruthy();
    expect(screen.getByText('Once lit, it burns down and grows shorter.')).toBeTruthy();
    expect(screen.getByText('A riddle as it is told in Behdînan.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mamikên gundê me' })).toBeTruthy();
    // The next one not solved or seen: the hard one, begun.
    fireEvent.click(screen.getByTestId('riddle-next'));
    expect(navigation.replace).toHaveBeenCalledWith('Riddle', { slug: 'kmr-ezman' });
  });

  it('asks for an answer it does not have yet, as when the app comes back to it', async () => {
    const client = fakeClient({
      'POST /riddles/kmr-mum/reveal': ok({ answer: ANSWER }),
      'GET /riddles?dialect=kmr': ok(RIDDLES),
    });
    testAuth.client = client;
    renderWithProviders(<RiddleAnswerScreen slug="kmr-mum" onExit={() => undefined} />);
    expect((await screen.findByTestId('riddle-answer')).textContent).toContain('mûm');
    expect(screen.queryByText('You solved it')).toBeNull();
  });
});
