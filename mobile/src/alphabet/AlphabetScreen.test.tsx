// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ALPHABET_CLIPS, SYNTHESISED_ALPHABET_CLIPS, encodeLipsync, type AlphabetAudioResponse } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { navigation } from '../play/testing/navigation';
import { FakeAudio, fakeFrames } from '../characters/testing/audio';
import { onHaptic, setHapticDriver } from '../feedback/haptics';
import { AlphabetScreen } from './AlphabetScreen';

/** Where the phone plays a synthesised clip from: the website, under the file the manifest names. */
const synthesised = (key: string) => `https://hevalo.app/audio/alphabet/${SYNTHESISED_ALPHABET_CLIPS[key]}`;

const SAID = encodeLipsync({ durationMs: 600, cues: [{ startMs: 0, viseme: 'a' }] });

function serve(answer: AlphabetAudioResponse | null = { clips: {} }): void {
  testAuth.client = fakeClient(answer ? { 'GET /alphabet/audio': ok(answer) } : {});
}

async function show(): Promise<void> {
  renderWithProviders(<AlphabetScreen onExit={() => undefined} />);
  // the recordings' answer, and the stored ticks, arrive on later turns
  await act(async () => undefined);
}

/** Press a button (or a radio) once it is there and can be pressed. */
async function press(name: string | RegExp, { role = 'button', inside = document.body }: { role?: 'button' | 'radio'; inside?: HTMLElement } = {}): Promise<void> {
  const target = await waitFor(() => {
    const found = within(inside).getAllByRole(role, { name })[0]!;
    expect(found.getAttribute('aria-disabled')).not.toBe('true');
    return found;
  });
  await act(async () => {
    fireEvent.click(target);
  });
}

/** The sheet a letter opens in: the modal over the screen. */
const sheet = (): Promise<HTMLElement> =>
  waitFor(() => {
    const modal = document.querySelector<HTMLElement>('[aria-modal="true"]');
    expect(modal).not.toBeNull();
    return modal!;
  });

let restoreHaptics: () => void;
beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  localStorage.clear();
  FakeAudio.made = [];
  vi.stubGlobal('Audio', FakeAudio);
  fakeFrames();
  navigation.navigate.mockReset();
  restoreHaptics = setHapticDriver(() => undefined);
});
afterEach(() => {
  cleanup();
  restoreHaptics();
  vi.unstubAllGlobals();
});

describe('the alphabet', () => {
  it('shows Kurmancî, false friends first, and Soranî at the switch', async () => {
    serve();
    await show();
    expect(await screen.findByRole('button', { name: 'C, like j' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Look familiar, sound different' })).toBeTruthy();
    expect(screen.getByText(/You already know 16 of these 31 letters/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Kurmancî' }).getAttribute('aria-checked')).toBe('true');

    await press('Soranî', { role: 'radio' });
    expect(await screen.findByRole('button', { name: 'ب, like b' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'From the throat' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Soranî' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('button', { name: 'C, like j' })).toBeNull();
  });

  it('opens on Soranî for a reader of Soranî', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    serve();
    await show();
    await waitFor(() => expect(screen.getByRole('radio', { name: 'سۆرانی' }).getAttribute('aria-checked')).toBe('true'));
    expect(await screen.findByRole('heading', { name: 'لە گەروووە' })).toBeTruthy();
  });

  it('opens a letter with its sound, a word to remember it by, and its Soranî partner — and plays it at once', async () => {
    serve();
    await show();
    await press('C, like j');
    const card = await sheet();
    expect(within(card).getByText('Sounds like')).toBeTruthy();
    expect(within(card).getByText('neighbour')).toBeTruthy();
    expect(within(card).getByText('ج')).toBeTruthy();
    // a computer's voice says so, under the card
    expect(within(card).getByText('Computer voice — a guide, not a native speaker.')).toBeTruthy();

    // the letter's sound, from the website, the moment it opens
    await waitFor(() => expect(FakeAudio.of(synthesised('kmr:sound:c'))?.paused).toBe(false));

    // the word's own button plays the word, in place of the letter
    await press('Listen to the word', { inside: card });
    await waitFor(() => expect(FakeAudio.of(synthesised('kmr:word:c'))?.paused).toBe(false));
    expect(FakeAudio.of(synthesised('kmr:sound:c'))?.paused).toBe(true);

    // the way on: the next letter in the grid, played as it opens
    await press('Next letter', { inside: card });
    await waitFor(() => expect(FakeAudio.of(synthesised('kmr:sound:e'))?.paused).toBe(false));
    expect(within(card).getByRole('heading', { name: 'E e' })).toBeTruthy();
  });

  it('plays a recording an editor made in place of the synthesised clip', async () => {
    serve({ clips: { 'kmr:sound:c': 'https://media.test/c.wav' } });
    await show();
    await press('C, like j');
    const card = await sheet();
    await waitFor(() => expect(FakeAudio.of('https://media.test/c.wav')?.paused).toBe(false));
    const clip = FakeAudio.of('https://media.test/c.wav')!;
    act(() => clip.finish());

    await press('Listen', { inside: card });
    await waitFor(() => expect(clip.paused).toBe(false));
    expect(FakeAudio.made.some((a) => a.src === synthesised('kmr:sound:c'))).toBe(false);
  });

  it('stands the character who says a letter on a stage beside it, whole, and nobody beside one without', async () => {
    serve({
      clips: { 'kmr:sound:c': 'https://media.test/c.wav', 'kmr:word:c': 'https://media.test/ciran.wav', 'kmr:sound:ç': 'https://media.test/ch.wav' },
      voices: { 'kmr:sound:c': { speaker: 'xezo', lipsync: SAID }, 'kmr:word:c': { speaker: 'hamo', lipsyncSource: 'text' } },
    });
    await show();
    await press('C, like j');
    const card = await sheet();
    expect(await within(card).findByRole('img', { name: 'Said by Xezo' })).toBeTruthy();
    expect(within(card).getByTestId('character-stage')).toBeTruthy();
    // one character on the card, who says the word too: nobody squeezed in beside the word's button
    expect(within(card).queryByRole('img', { name: 'Said by Hamo' })).toBeNull();
    // a recording, not a computer: nothing to own up to
    expect(within(card).queryByText('Computer voice — a guide, not a native speaker.')).toBeNull();

    // the word is Hamo's: he takes the stage to say it, and stays there after
    await press('Listen to the word', { inside: card });
    expect(await within(card).findByRole('img', { name: 'Said by Hamo' })).toBeTruthy();
    expect(within(card).queryByRole('img', { name: 'Said by Xezo' })).toBeNull();
    const word = FakeAudio.of('https://media.test/ciran.wav')!;
    await waitFor(() => expect(word.paused).toBe(false));
    await act(async () => word.finish());
    expect(within(card).getByRole('img', { name: 'Said by Hamo' })).toBeTruthy();

    // a tap on him says it again
    await act(async () => {
      fireEvent.click(within(card).getByRole('img', { name: 'Said by Hamo' }));
    });
    await waitFor(() => expect(word.paused).toBe(false));

    // ç has a recording that nobody was chosen for: its button stands alone, with no stage
    await press('Close', { inside: card });
    await press('Ç, like ch');
    const next = await sheet();
    expect(within(next).getByRole('button', { name: 'Listen' })).toBeTruthy();
    expect(within(next).queryByRole('img', { name: /^Said by/ })).toBeNull();
    expect(within(next).queryByTestId('character-stage')).toBeNull();
  });

  it('ticks the letters opened, and keeps them on this phone', async () => {
    serve();
    await show();
    expect(await screen.findByText('0 of 31 explored')).toBeTruthy();
    await press('C, like j');
    expect(await screen.findByText('1 of 31 explored')).toBeTruthy();
    await waitFor(() => expect(JSON.parse(localStorage.getItem('hevalo_alphabet_seen_v1')!)).toEqual({ kmr: ['c'], ckb: [] }));
  });

  it('shows the letters and plays their clips before the server has answered', async () => {
    // a server that never answers
    testAuth.client = fakeClient({ 'GET /alphabet/audio': () => new Promise(() => undefined) });
    await show();
    expect(screen.getByRole('button', { name: 'C, like j' })).toBeTruthy();
    expect(screen.queryByLabelText('Loading')).toBeNull();
    await press('C, like j');
    await waitFor(() => expect(FakeAudio.of(synthesised('kmr:sound:c'))?.paused).toBe(false));
  });

  it('swaps in the recordings, and their characters, when the server answers', async () => {
    let answer: ((result: ReturnType<typeof ok>) => void) | null = null;
    testAuth.client = fakeClient({
      'GET /alphabet/audio': () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    });
    await show();
    await press('C, like j');
    const card = await sheet();
    expect(within(card).queryByRole('img', { name: /^Said by/ })).toBeNull();
    await waitFor(() => expect(FakeAudio.of(synthesised('kmr:sound:c'))?.paused).toBe(false));

    await act(async () => answer!(ok({ clips: { 'kmr:sound:c': 'https://media.test/c.wav' }, voices: { 'kmr:sound:c': { speaker: 'xezo' } } })));
    expect(await within(card).findByRole('img', { name: 'Said by Xezo' })).toBeTruthy();
    await press('Listen', { inside: card });
    await waitFor(() => expect(FakeAudio.of('https://media.test/c.wav')?.paused).toBe(false));
  });

  it('goes on with the generated clips when the server cannot be reached', async () => {
    serve(null);
    await show();
    await act(async () => undefined);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByText('Couldn’t load')).toBeNull();
    await press('Ç, like ch');
    await waitFor(() => expect(FakeAudio.of(synthesised('kmr:sound:ç'))?.paused).toBe(false));
    const card = await sheet();
    expect(within(card).getByText('Computer voice — a guide, not a native speaker.')).toBeTruthy();
    await press('Listen to the word', { inside: card });
    await waitFor(() => expect(FakeAudio.of(synthesised('kmr:word:ç'))?.paused).toBe(false));
  });

  it('sends the reader on to the dictionary and to Peyvok', async () => {
    serve();
    await show();
    await press('Look words up in the dictionary');
    expect(navigation.navigate).toHaveBeenCalledWith('Dictionary');
    await press('Play Peyvok');
    expect(navigation.navigate).toHaveBeenCalledWith('Wordle');
  });
});

describe('check yourself', () => {
  it('runs a round of eight, answers back and explains, and goes on', async () => {
    const felt: string[] = [];
    const stop = onHaptic((e) => felt.push(e));
    serve();
    await show();
    await press('Start');
    expect(await screen.findByLabelText('Question 1 of 8')).toBeTruthy();
    // an English reader starts by listening, and the sound plays by itself
    expect(screen.getByText('Listen. Which letter is it?')).toBeTruthy();
    await waitFor(() => expect(FakeAudio.made.some((a) => !a.paused)).toBe(true));
    expect(screen.getByRole('button', { name: 'Play again' })).toBeTruthy();

    const options = screen.getAllByRole('button').filter((b) => /^[a-zçêîşû]$/.test(b.getAttribute('aria-label') ?? ''));
    expect(options).toHaveLength(3);
    await act(async () => {
      fireEvent.click(options[0]!);
    });
    // said on the screen, and to a screen reader
    const [verdict] = await screen.findAllByText(/^(Right\.|Not quite: it’s)/);
    expect(felt.at(-1)).toMatch(/correct|wrong/);
    if (/Not quite/.test(verdict!.textContent ?? '')) expect(screen.getByText(/It comes back later in this round\./)).toBeTruthy();
    // every option is closed once one is chosen
    for (const o of options) expect(o.getAttribute('aria-disabled')).toBe('true');

    await press('Next');
    expect(await screen.findByLabelText('Question 2 of 8')).toBeTruthy();
    stop();
  });

  it('asks a question out loud from a stage when a character says it', async () => {
    const keys = ALPHABET_CLIPS.map((clip) => clip.key);
    serve({
      clips: Object.fromEntries(keys.map((key, i) => [key, `https://media.test/alphabet/${i}.wav`])),
      voices: Object.fromEntries(keys.map((key) => [key, { speaker: 'hevalo' as const }])),
    });
    await show();
    await press('Start');
    expect(await screen.findByLabelText('Question 1 of 8')).toBeTruthy();
    expect(screen.getByText('Listen. Which letter is it?')).toBeTruthy();
    const stage = await screen.findByTestId('character-stage');
    expect(within(stage).getByRole('img', { name: 'Said by Hevalo' })).toBeTruthy();
    expect(within(stage).getByRole('button', { name: 'Play again' })).toBeTruthy();
  });

  it('ends with a score and a new round', async () => {
    serve();
    await show();
    await press('Start');
    // answer every question with the first option until the round ends
    for (let i = 0; i < 20 && !screen.queryByText(/right first time/); i++) {
      const first = await waitFor(() => {
        const open = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-disabled') !== 'true' && b.closest('[data-testid="alphabet-options"]'));
        expect(open.length).toBeGreaterThan(0);
        return open[0]!;
      });
      await act(async () => {
        fireEvent.click(first);
      });
      await press('Next');
    }
    expect(screen.getByText(/of 8 right first time/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New round' })).toBeTruthy();
    // a whole round, up to sixteen questions each drawn and answered, takes longer than one question's five seconds
  }, 20_000);
});
