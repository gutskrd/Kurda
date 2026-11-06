import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { SYNTHESISED_WORD_CLIPS } from '@kurda/shared';
import { WordSet } from './WordSet';
import { jsonResponse, renderApp } from '../test/utils';

/*
 * A word set as a visitor meets it: the tiles, each with its own play button
 * where there is a sound, the card a word opens into with its sound and its
 * meaning, and the round at the foot. jsdom has no layout, so the card opens
 * in the sheet, as on a phone. The recordings winning over the synthesised
 * clips are in WordSet.voices.test.tsx: a page asks for them once and keeps
 * them, so that needs a file of its own.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

/** The file a word's synthesised clip is in, which jsdom resolves against its own origin. */
const synthesised = (key: string): RegExp => new RegExp(`/audio/words/${SYNTHESISED_WORD_CLIPS[key]}$`);

/** Where the router is; a span, not an <output>, which would be a second status beside the round's verdict. */
function Where(): React.JSX.Element {
  const { pathname } = useLocation();
  return <span data-testid="where">{pathname}</span>;
}

function show(path: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (String(url).endsWith('/alphabet/audio') ? jsonResponse(200, { clips: {} }) : jsonResponse(401, {}))),
  );
  return renderApp(
    <>
      <Routes>
        <Route path="/app/learn/words" element={<h1>Words to know</h1>} />
        <Route path="/app/learn/words/:set" element={<WordSet />} />
      </Routes>
      <Where />
    </>,
    [path],
  );
}

/** Every sound played, by its source, as a browser would report it. */
function hearing(): string[] {
  const heard: string[] = [];
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    heard.push(this.src);
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  });
  return heard;
}

const card = () => screen.findByRole('dialog');

describe('a word set', () => {
  it('draws the colours as swatches with their names, each with its own play button, and opens one with its sound, meaning and phrase', async () => {
    const heard = hearing();
    show('/app/learn/words/colours');
    expect(await screen.findByRole('heading', { level: 1, name: 'Colours' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Kurmancî', selected: true })).toBeInTheDocument();
    expect(screen.getByText('A colour comes after the word it describes.')).toBeInTheDocument();
    expect(screen.getByText('0 of 11 explored')).toBeInTheDocument();

    // the play button is a button of its own, beside the word, and plays without opening anything
    await userEvent.click(screen.getByRole('button', { name: 'Listen to sor' }));
    expect(heard.at(-1)).toMatch(synthesised('words:colours:kmr:red'));
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'sor, red' }));
    const sheet = await card();
    expect(within(sheet).getByRole('heading', { name: 'sor, red' })).toBeInTheDocument();
    expect(within(sheet).getByText('Means')).toBeInTheDocument();
    expect(within(sheet).getByText('In Soranî')).toBeInTheDocument();
    expect(within(sheet).getByText('سوور')).toBeInTheDocument();
    expect(within(sheet).getByText('sûr')).toBeInTheDocument();
    expect(within(sheet).getByText('gula sor')).toBeInTheDocument();
    expect(within(sheet).getByText('a red rose')).toBeInTheDocument();
    expect(within(sheet).getByText('Computer voice — a guide, not a native speaker.')).toBeInTheDocument();
    expect(sheet.querySelector('.speaking-character')).toBeNull();
    expect(heard.at(-1)).toMatch(synthesised('words:colours:kmr:red'));

    // stepping on opens the next word, which says itself
    await userEvent.click(within(sheet).getByRole('button', { name: 'Next word' }));
    expect(within(sheet).getByRole('heading', { name: 'şîn, blue' })).toBeInTheDocument();
    expect(heard.at(-1)).toMatch(synthesised('words:colours:kmr:blue'));

    // both are ticked, and kept in this browser
    expect(JSON.parse(localStorage.getItem('hevalo_words_colours_seen')!)).toEqual({ kmr: ['red', 'blue'], ckb: [] });
    expect(screen.getByText('2 of 11 explored')).toBeInTheDocument();
  });

  it('switches to Soranî, right to left, with the Latin letters under the script and no play button where there is no sound yet', async () => {
    show('/app/learn/words/colours?script=ckb');
    expect(await screen.findByRole('tab', { name: 'Soranî', selected: true })).toBeInTheDocument();
    expect(document.querySelector('.wd-grid')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('button', { name: 'Listen to ڕەش' })).toBeInTheDocument();
    // grey's dark ł has no synthesised voice: nothing to press until it is recorded
    expect(screen.queryByRole('button', { name: 'Listen to خۆڵەمێشی' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'خۆڵەمێشی, grey' }));
    const sheet = await card();
    expect(within(sheet).getByText('xołemêşî')).toBeInTheDocument();
    expect(within(sheet).getByText('In Kurmancî')).toBeInTheDocument();
    expect(within(sheet).getByText('gewr')).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Listen' })).toBeNull();
    expect(within(sheet).queryByText('Computer voice — a guide, not a native speaker.')).toBeNull();
  });

  it('shows a number in both kinds of digit for Soranî, and spells any number typed', async () => {
    show('/app/learn/words/numbers?script=ckb');
    expect(await screen.findByText('Tens, then “and”, then ones: 21 is بیست و یەک.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Eleven to nineteen/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'حەوت, 7' }));
    const sheet = await card();
    expect(within(sheet).getAllByText('٧').length).toBeGreaterThan(0);
    expect(within(sheet).getByText('heft')).toBeInTheDocument();
    expect(within(sheet).getByText('Type any number up to 9,999.')).toBeInTheDocument();
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Make a number' }), '٢٠٢٤');
    expect(within(sheet).getByText('دوو هەزار و بیست و چوار')).toBeInTheDocument();
    expect(within(sheet).getByText('dû hezar û bîst û çwar')).toBeInTheDocument();
  });

  it('runs the week from Saturday, marks the number inside each name, and says which day is today', async () => {
    // a Monday
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 2, 12));
    show('/app/learn/words/days');
    await screen.findByRole('heading', { level: 1, name: 'Days of the week' });
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
    // the number inside the name, picked out on its own, and today's pill
    expect(within(tiles[1]!).getByText('Yek').tagName).toBe('MARK');
    expect(within(tiles[2]!).getByText('îro')).toBeInTheDocument();

    await userEvent.click(tiles[2]!);
    const sheet = await card();
    expect(within(sheet).getByText('If today is Duşem')).toBeInTheDocument();
    expect(within(sheet).getByText('duh')).toBeInTheDocument();
    expect(within(sheet).getByText('sibe')).toBeInTheDocument();
    expect(within(sheet).getByText('tomorrow')).toBeInTheDocument();
  });

  it('shows both calendars, the Kurdish one starting at Newroz, each month in its season', async () => {
    show('/app/learn/words/months');
    expect(await screen.findByRole('heading', { name: /On the calendar/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /The Kurdish months/ })).toBeInTheDocument();
    expect(screen.getByText('The year starts at Newroz, on 21 March. Three months to each season.')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'bihar, spring' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xakelêwe, About 21 March to 20 April' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Adar, March' }));
    const sheet = await card();
    expect(within(sheet).getByText('Season')).toBeInTheDocument();
    expect(within(sheet).getByText('bihar')).toBeInTheDocument();
    expect(within(sheet).getByText('Newroz, the Kurdish new year, is on 21 March.')).toBeInTheDocument();
    // and the other name Kurmancî has for some of them
    await userEvent.click(within(sheet).getByRole('button', { name: 'Previous word' }));
    expect(within(sheet).getByRole('heading', { name: 'Sibat, February' })).toBeInTheDocument();
    expect(within(sheet).getByText('Also called')).toBeInTheDocument();
    expect(within(sheet).getByText('Reşemî')).toBeInTheDocument();
  });

  it('sends an address naming no set back to the four', async () => {
    show('/app/learn/words/nope');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/app/learn/words'));
    expect(screen.getByRole('heading', { level: 1, name: 'Words to know' })).toBeInTheDocument();
  });
});

describe('check yourself, with words', () => {
  it('runs a round of eight, plays a listening question by itself, explains, and goes on', async () => {
    const heard = hearing();
    show('/app/learn/words/numbers');
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const dots = screen.getByRole('list', { name: 'Question 1 of 8' });
    expect(within(dots).getAllByRole('listitem')).toHaveLength(8);
    // a number heard is answered with its digits, and the word plays by itself
    expect(screen.getByText('Listen. Which number is it?')).toBeInTheDocument();
    expect(heard.at(-1)).toMatch(/\/audio\/words\//);
    expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument();

    const options = screen.getAllByRole('button').filter((b) => b.classList.contains('ab-option'));
    expect(options).toHaveLength(3);
    // answer with the keyboard, the way a desktop reader can
    await userEvent.keyboard('1');
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/Right\.|Not quite: it’s/);
    if (/Not quite/.test(status.textContent ?? '')) expect(status).toHaveTextContent('It comes back later in this round.');
    expect(status.querySelector('.ab-explain')).not.toBeNull();
    for (const o of options) expect(o).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('list', { name: 'Question 2 of 8' })).toBeInTheDocument();
  });

  it('ends with a score, the words to look at again, and a new round', async () => {
    show('/app/learn/words/days');
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    for (let i = 0; i < 20 && !screen.queryByText(/right first time/); i++) {
      await userEvent.keyboard('1');
      await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    }
    expect(screen.getByText(/of 8 right first time/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New round' })).toBeInTheDocument();
  }, 20_000);
});
