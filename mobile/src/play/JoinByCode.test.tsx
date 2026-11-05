// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { navigation } from './testing/navigation';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { JOIN_CODE_LENGTH } from '@kurda/shared';
import { FLIP_MS, FLIP_STAGGER_MS, JoinCodeCard, JoinCodeSheet, SUCCESS_MS, SUCCESS_REDUCED_MS } from './JoinByCode';

// jsdom has no matchMedia, and react-native-web reads the colour scheme through it
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

vi.mock('react-native', () => import('./testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('./testing/navigation'));

const LOBBY = 'a1b2c3d4-0000-4000-8000-000000000001';

let felt: HapticEvent[] = [];
let stopFeeling: () => void = () => undefined;

beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: false });
  navigation.navigate.mockReset();
  resetHaptics();
  felt = [];
  stopFeeling = onHaptic((event) => felt.push(event));
});
afterEach(() => {
  stopFeeling();
  cleanup();
  vi.useRealTimers();
  testAuth.user = { ...testAuth.user, guest: false };
});

/*
 * Once a code is accepted the sheet runs on the clock: the boxes turn one
 * after another, and the lobby opens after the burst. A test of that moves the
 * clock itself rather than waiting it out, so a busy machine can neither run
 * past "the first box has turned and the last has not" before it is looked at
 * nor stretch the wait for the lobby past the test's own time.
 */
function onTheClock(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
}
/** The server's answer to the code, which arrives as a promise, not on the clock. */
const answered = () => act(async () => undefined);
const after = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

function sheet(routes: Parameters<typeof fakeClient>[0] = {}) {
  const client = fakeClient(routes);
  testAuth.client = client;
  const onClose = vi.fn();
  renderWithProviders(<JoinCodeSheet onClose={onClose} />);
  const field = screen.getByLabelText('Join code') as HTMLInputElement;
  return { client, onClose, field, joins: () => client.calls.filter((c) => c.path === '/play/join') };
}

const type = (field: HTMLInputElement, value: string) => fireEvent.change(field, { target: { value } });

describe('JoinCodeSheet', () => {
  it('types into one labelled field, shows it in six boxes, and sends the code by itself as the sixth character arrives', async () => {
    onTheClock();
    const { field, joins, onClose } = sheet({ 'POST /play/join': ok({ game: 'wordle-battle', lobbyId: LOBBY }) });
    fireEvent.focus(field);
    type(field, 'kq7');
    expect(field.value).toBe('KQ7');
    // the box the next character goes to is lit; the boxes themselves are only a picture
    expect(screen.getByTestId('code-box-3-picked')).toBeTruthy();
    expect(screen.getByTestId('code-box-0-idle').closest('[aria-hidden="true"]')).toBeTruthy();
    expect(joins()).toHaveLength(0);

    type(field, 'KQ7m4x');
    expect(joins()[0]?.body).toEqual({ code: 'KQ7M4X' });
    // in: the boxes turn green, the phone says so, and the lobby opens
    await answered();
    after(SUCCESS_MS);
    expect(navigation.navigate).toHaveBeenCalledWith('WordleBattle', { id: LOBBY });
    expect(onClose).toHaveBeenCalled();
    expect(felt).toContain('correct');
    expect(joins()).toHaveLength(1);
  });

  it('reads a code pasted with a dash, spaces or in lower case', async () => {
    onTheClock();
    const { field, joins } = sheet({ 'POST /play/join': ok({ game: 'stories', lobbyId: LOBBY }) });
    type(field, 'abc-234');
    expect(field.value).toBe('ABC234');
    expect(joins()[0]?.body).toEqual({ code: 'ABC234' });
    await answered();
    after(SUCCESS_MS);
    expect(navigation.navigate).toHaveBeenCalledWith('StoryGame', { id: LOBBY });
  });

  it('reads the digits an Arabic or a Soranî keyboard types', async () => {
    const { field, joins } = sheet({ 'POST /play/join': ok({ game: 'rhyme-match', lobbyId: LOBBY }) });
    type(field, 'ab c٢٣۴');
    expect(field.value).toBe('ABC234');
    await waitFor(() => expect(joins()[0]?.body).toEqual({ code: 'ABC234' }));
  });

  it('drops what a code cannot hold, and sends nothing until there are six', async () => {
    const { field, joins } = sheet();
    type(field, 'A0O1');
    expect(field.value).toBe('A');
    await act(async () => undefined);
    expect(joins()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Join' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('takes the code out of the whole message a friend shared', async () => {
    const { field, joins } = sheet({ 'POST /play/join': ok({ game: 'wordle-battle', lobbyId: LOBBY }) });
    type(field, 'Play Peyvok Battle with me on Hevalo! Open Games → Join with a code and type KQ7 M4X');
    await waitFor(() => expect(joins()[0]?.body).toEqual({ code: 'KQ7M4X' }));
  });

  it('opens the lobby of an old invite link pasted in, as the link always did', async () => {
    const { field, joins, onClose } = sheet();
    type(field, `https://hevalo.app/app/games/rhyme-match?id=${LOBBY}`);
    await act(async () => undefined);
    expect(navigation.navigate).toHaveBeenCalledWith('RhymeMatch', { id: LOBBY });
    expect(onClose).toHaveBeenCalled();
    expect(joins()).toHaveLength(0);
  });

  it.each([
    ['nobody’s game', fail({ status: 404, code: 'GAME_NOT_FOUND' }), 'No open game has this code. Check it, or ask your friend for a new one.'],
    ['a full game', fail({ status: 409, code: 'GAME_FULL' }), 'That game is full.'],
    ['a story game already under way', fail({ status: 409, code: 'GAME_STARTED' }), 'That game has already started.'],
    ['ten tries in a minute', fail({ status: 429, kind: 'rate_limited', retryAfterSec: 40 }), 'Too many tries. Wait a minute and try again.'],
    ['no connection', fail({ status: 0, kind: 'network' }), 'Can’t reach Hevalo right now. Check your connection and try again.'],
  ])('says what a refusal means — %s — in red, with a buzz, until typing again clears it', async (_, answer, words) => {
    const { field } = sheet({ 'POST /play/join': answer });
    type(field, 'ZZZ999');
    await waitFor(() => expect(screen.getByTestId('join-message').textContent).toBe(words));
    expect(screen.getByTestId('code-box-0-wrong')).toBeTruthy();
    expect(felt).toEqual(['error']);
    expect(navigation.navigate).not.toHaveBeenCalled();

    // any key is typing again — a seventh character that changes nothing too: the red and the words go
    type(field, 'ZZZ9999');
    expect(screen.queryByTestId('join-message')).toBeNull();
    expect(screen.queryByTestId('code-box-0-wrong')).toBeNull();
    expect(field.value).toBe('ZZZ999');
  });

  it('tries the same code again on Join, after a refusal it may get past', async () => {
    let tries = 0;
    onTheClock();
    const { field, joins } = sheet({
      'POST /play/join': () => (++tries === 1 ? fail({ status: 0, kind: 'network' }) : ok({ game: 'wordle-battle', lobbyId: LOBBY })),
    });
    type(field, 'ZZZ999');
    await answered();
    expect(screen.getByTestId('join-message')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(joins()).toHaveLength(2);
    await answered();
    after(SUCCESS_MS);
    expect(navigation.navigate).toHaveBeenCalledWith('WordleBattle', { id: LOBBY });
  });

  it('turns the boxes green one after another, with a burst', async () => {
    onTheClock();
    const { field } = sheet({ 'POST /play/join': ok({ game: 'wordle-battle', lobbyId: LOBBY }) });
    type(field, 'KQ7M4X');
    await answered();
    // halfway through its flip the first box shows green, and the last has not started
    after(FLIP_MS / 2);
    expect(screen.getByTestId('code-box-0-right')).toBeTruthy();
    expect(screen.queryByTestId('code-box-5-right')).toBeNull();
    expect(screen.getByTestId('join-burst')).toBeTruthy();
    after((JOIN_CODE_LENGTH - 1) * FLIP_STAGGER_MS);
    expect(screen.getByTestId('code-box-5-right')).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('under Reduce Motion turns them all green at once, with no burst, and opens the lobby a beat later', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    onTheClock();
    const { field } = sheet({ 'POST /play/join': ok({ game: 'wordle-battle', lobbyId: LOBBY }) });
    await act(async () => undefined);
    type(field, 'KQ7M4X');
    await answered();
    expect(screen.getByTestId('code-box-0-right')).toBeTruthy();
    expect(screen.getByTestId('code-box-5-right')).toBeTruthy();
    expect(screen.queryByTestId('join-burst')).toBeNull();
    after(SUCCESS_REDUCED_MS - 1);
    expect(navigation.navigate).not.toHaveBeenCalled();
    after(1);
    expect(navigation.navigate).toHaveBeenCalledWith('WordleBattle', { id: LOBBY });
    patchReactNativeWeb({ reduceMotion: false });
  });
});

describe('JoinCodeCard', () => {
  it('says what it is for and opens the boxes', async () => {
    testAuth.client = fakeClient();
    renderWithProviders(<JoinCodeCard />);
    const card = screen.getByTestId('join-with-code');
    expect(card.getAttribute('aria-label')).toBe('Join with a code. Got a code from a friend? Type it in to jump into their game.');
    fireEvent.click(card);
    expect(await screen.findByLabelText('Join code')).toBeTruthy();
  });

  it('offers a guest an account first, as every way into a game with people does', async () => {
    testAuth.client = fakeClient();
    testAuth.user = { ...testAuth.user, guest: true };
    renderWithProviders(<JoinCodeCard />);
    fireEvent.click(screen.getByTestId('join-with-code'));
    await act(async () => undefined);
    expect(screen.queryByLabelText('Join code')).toBeNull();
  });
});
