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
import { SYNTHESISED_WORD_CLIPS, type AlphabetAudioResponse, type AlphabetScript, type WordSetId } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { navigation } from '../play/testing/navigation';
import { FakeAudio, fakeFrames } from '../characters/testing/audio';
import { onHaptic, setHapticDriver } from '../feedback/haptics';
import { WordSetScreen } from './WordSetScreen';
import { WordsScreen } from './WordsScreen';

/** Where the phone plays a word's synthesised clip from: the website, under the file the manifest names. */
const synthesised = (key: string) => `https://hevalo.app/audio/words/${SYNTHESISED_WORD_CLIPS[key]}`;

function serve(answer: AlphabetAudioResponse = { clips: {} }): void {
  testAuth.client = fakeClient({ 'GET /alphabet/audio': ok(answer) });
}

async function show(set: WordSetId, script?: AlphabetScript): Promise<void> {
  renderWithProviders(<WordSetScreen set={set} script={script} onExit={() => undefined} />);
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

/** The sheet a word opens in: the modal over the screen. */
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
  vi.useRealTimers();
});

describe('words to know', () => {
  it('lists the four sets with how many of each have been opened, and opens one', async () => {
    localStorage.setItem('hevalo_words_colours_seen_v1', JSON.stringify({ kmr: ['red', 'blue'], ckb: ['red'] }));
    renderWithProviders(<WordsScreen onExit={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Colours, 2 of 11 explored' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Numbers, 0 of 30 explored' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Days of the week, 0 of 7 explored' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Months, 0 of 24 explored' })).toBeTruthy();
    await press('Days of the week, 0 of 7 explored');
    expect(navigation.navigate).toHaveBeenCalledWith('WordSet', { set: 'days' });
  });
});

describe('a word set', () => {
  it('draws the colours as swatches with their names, and opens one with its sound, its meaning and a phrase', async () => {
    serve();
    await show('colours');
    expect(screen.getByRole('radio', { name: 'Kurmancî' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('A colour comes after the word it describes.')).toBeTruthy();
    await press('sor, red');
    const card = await sheet();
    expect(within(card).getByRole('heading', { name: 'sor, red' })).toBeTruthy();
    expect(within(card).getByText('Means')).toBeTruthy();
    expect(within(card).getByText('سوور')).toBeTruthy();
    expect(within(card).getByText('sûr')).toBeTruthy();
    expect(within(card).getByText('gula sor')).toBeTruthy();
    expect(within(card).getByText('a red rose')).toBeTruthy();
    expect(within(card).getByText('Computer voice — a guide, not a native speaker.')).toBeTruthy();
    await waitFor(() => expect(FakeAudio.of(synthesised('words:colours:kmr:red'))?.paused).toBe(false));

    // stepping on is a tick, as moving through a picker is, and the next word says itself
    const felt: string[] = [];
    const stop = onHaptic((e) => felt.push(e));
    await press('Next word', { inside: card });
    expect(felt).toEqual(['select']);
    expect(within(card).getByRole('heading', { name: 'şîn, blue' })).toBeTruthy();
    await waitFor(() => expect(FakeAudio.of(synthesised('words:colours:kmr:blue'))?.paused).toBe(false));
    stop();

    // both are ticked, and kept on this phone
    await waitFor(() => expect(JSON.parse(localStorage.getItem('hevalo_words_colours_seen_v1')!)).toEqual({ kmr: ['red', 'blue'], ckb: [] }));
    expect(screen.getByText('2 of 11 explored')).toBeTruthy();
  });

  it('switches to Soranî: the script with its Latin letters, and no play button where there is no sound yet', async () => {
    serve();
    await show('colours');
    await press('Soranî', { role: 'radio' });
    await press('ڕەش, black');
    let card = await sheet();
    expect(within(card).getByText('řeş')).toBeTruthy();
    expect(within(card).getByText('reş')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Listen' })).toBeTruthy();
    await press('Close', { inside: card });

    // grey's dark ł has no synthesised voice: nothing to press until it is recorded
    await press('خۆڵەمێشی, grey');
    card = await sheet();
    expect(within(card).getByText('xołemêşî')).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Listen' })).toBeNull();
    expect(within(card).queryByText('Computer voice — a guide, not a native speaker.')).toBeNull();
  });

  it('plays a recording an editor made, said by its character', async () => {
    serve({ clips: { 'words:colours:kmr:red': 'https://media.test/sor.wav' }, voices: { 'words:colours:kmr:red': { speaker: 'hevalo' } } });
    await show('colours');
    await press('sor, red');
    const card = await sheet();
    await waitFor(() => expect(FakeAudio.of('https://media.test/sor.wav')?.paused).toBe(false));
    expect(await within(card).findByRole('img', { name: 'Said by Hevalo' })).toBeTruthy();
    expect(within(card).queryByText('Computer voice — a guide, not a native speaker.')).toBeNull();
  });

  it('shows a number in both kinds of digit for Soranî, and spells any number typed', async () => {
    serve();
    await show('numbers', 'ckb');
    expect(screen.getByText('Tens, then “and”, then ones: 21 is بیست و یەک.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Eleven to nineteen' })).toBeTruthy();
    await press('حەوت, 7');
    const card = await sheet();
    expect(within(card).getAllByText('٧').length).toBeGreaterThan(0);
    expect(within(card).getByText('heft')).toBeTruthy();
    expect(within(card).getByText('Type any number up to 9,999.')).toBeTruthy();
    const field = within(card).getByLabelText('Make a number');
    await act(async () => {
      fireEvent.change(field, { target: { value: '٢٠٢٤' } });
    });
    expect(within(card).getByText('دوو هەزار و بیست و چوار')).toBeTruthy();
    expect(within(card).getByText('dû hezar û bîst û çwar')).toBeTruthy();
  });

  it('runs the week from Saturday, marks the number inside each name, and says which day is today', async () => {
    // a Monday
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 2, 12));
    serve();
    await show('days');
    const tiles = screen.getAllByRole('button').filter((b) => /, (Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)/.test(b.getAttribute('aria-label') ?? ''));
    expect(tiles.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Şemî, Saturday',
      'Yekşem, Sunday',
      'Duşem, Monday, today',
      'Sêşem, Tuesday',
      'Çarşem, Wednesday',
      'Pêncşem, Thursday',
      'În, Friday',
    ]);
    // the number inside the name, picked out on its own
    expect(within(tiles[1]!).getByText('Yek')).toBeTruthy();
    expect(within(tiles[2]!).getByText('îro')).toBeTruthy();

    await press('Duşem, Monday, today');
    const card = await sheet();
    expect(within(card).getByText('If today is Duşem')).toBeTruthy();
    expect(within(card).getByLabelText('duh Yekşem, yesterday')).toBeTruthy();
    expect(within(card).getByLabelText('sibe Sêşem, tomorrow')).toBeTruthy();
  });

  it('shows both calendars, the Kurdish one starting at Newroz, each month in its season', async () => {
    serve();
    await show('months');
    expect(screen.getByRole('heading', { name: 'On the calendar' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'The Kurdish months' })).toBeTruthy();
    expect(screen.getByText('The year starts at Newroz, on 21 March. Three months to each season.')).toBeTruthy();
    expect(screen.getByLabelText('bihar, spring')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xakelêwe, About 21 March to 20 April' })).toBeTruthy();

    await press('Adar, March');
    const card = await sheet();
    expect(within(card).getByText('Season')).toBeTruthy();
    expect(within(card).getByText('bihar')).toBeTruthy();
    expect(within(card).getByText('Newroz, the Kurdish new year, is on 21 March.')).toBeTruthy();
    await press('Next word', { inside: card });
    // and the other name Kurmancî has for some of them
    await press('Previous word', { inside: card });
    await press('Previous word', { inside: card });
    expect(within(card).getByText('Also called')).toBeTruthy();
    expect(within(card).getByText('Reşemî')).toBeTruthy();
  });
});

describe('check yourself, with words', () => {
  it('runs a round of eight, buzzes for the outcome, explains, and goes on', async () => {
    const felt: string[] = [];
    const stop = onHaptic((e) => felt.push(e));
    serve();
    await show('numbers');
    await press('Start');
    expect(await screen.findByLabelText('Question 1 of 8')).toBeTruthy();
    // a number heard is answered with its digits, and the word plays by itself
    expect(screen.getByText('Listen. Which number is it?')).toBeTruthy();
    await waitFor(() => expect(FakeAudio.made.some((a) => !a.paused)).toBe(true));

    const options = within(screen.getByTestId('word-options')).getAllByRole('button');
    expect(options).toHaveLength(3);
    await act(async () => {
      fireEvent.click(options[0]!);
    });
    const [verdict] = await screen.findAllByText(/^(Right\.|Not quite: it’s)/);
    expect(felt.at(-1)).toMatch(/correct|wrong/);
    if (/Not quite/.test(verdict!.textContent ?? '')) expect(screen.getByText(/It comes back later in this round\./)).toBeTruthy();
    for (const o of options) expect(o.getAttribute('aria-disabled')).toBe('true');

    await press('Next');
    expect(await screen.findByLabelText('Question 2 of 8')).toBeTruthy();
    stop();
  });

  it('ends with a score, the words to look at again, and a new round', async () => {
    serve();
    await show('days');
    await press('Start');
    for (let i = 0; i < 20 && !screen.queryByText(/right first time/); i++) {
      const first = await waitFor(() => {
        const open = within(screen.getByTestId('word-options'))
          .getAllByRole('button')
          .filter((b) => b.getAttribute('aria-disabled') !== 'true');
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
  }, 20_000);
});
