// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { Item, Listing } from '../lessonAudio';
import type { AlphabetRecording } from '../voiceBatch';
import { fakeDecoder } from '../test/audio';
import { failure, fakeApi, json, on, type Call, type Route } from '../test/fetch';
import { renderUi } from '../test/render';
import { Characters } from './Characters';

function item(text: string, over: Partial<Item> = {}): Item {
  return {
    key: text.toLowerCase(),
    text,
    recorded: true,
    url: `https://media.test/${text.toLowerCase()}.wav`,
    durationMs: 900,
    updatedAt: '2026-10-01T10:00:00.000Z',
    speaker: null,
    hasLipsync: false,
    usedIn: [],
    unused: true,
    ...over,
  };
}

function sound(key: string, over: Partial<AlphabetRecording> = {}): AlphabetRecording {
  return { key, url: `https://media.test/${encodeURIComponent(key)}.wav`, durationMs: 800, updatedAt: '2026-10-01T10:00:00.000Z', speaker: null, hasLipsync: false, ...over };
}

const listing = (items: Item[]): Listing => ({ items, summary: { needed: 0, recorded: 0, missing: 0, unused: 0 } });

const LESSONS = listing([
  item('Silav'),
  item('Spas', { speaker: 'hamo' }),
  item('Roj', { speaker: 'xezo', hasLipsync: true }),
  item('Nan', { recorded: false, url: null }),
]);
const LETTERS = { recordings: [sound('kmr:sound:b'), sound('kmr:word:a', { speaker: 'hevalo' }), sound('kmr:word:b', { speaker: 'hamo', hasLipsync: true })] };

/**
 * The fake API behind the page, with the media host in front of it: a file on
 * media.test downloads, one on elsewhere.test is refused as a cross-origin
 * read is, and a PATCH can be held until the test lets it go.
 */
function server(lessons: Listing, letters: { recordings: AlphabetRecording[] }, ...routes: Route[]) {
  const api = fakeApi(on('GET', '/admin/lesson-audio', json(lessons)), on('GET', '/admin/alphabet/audio', json(letters)), on('PATCH', /^\/admin\/audio\//, json({ speaker: null, lipsync: null })), ...routes);
  const served = fetch;
  const held: Array<() => void> = [];
  let holding = false;
  let inFlight = 0;
  let most = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      if (input.startsWith('https://elsewhere.test/')) throw new TypeError('Failed to fetch');
      if (input.startsWith('https://media.test/')) return new Response(new Uint8Array([1, 2, 3]));
      if (init.method === 'PATCH') {
        inFlight += 1;
        most = Math.max(most, inFlight);
        if (holding) await new Promise<void>((resolve) => held.push(resolve));
        inFlight -= 1;
      }
      return served(input, init);
    }),
  );
  return {
    patches: (): Call[] => api.calls.filter((c) => c.method === 'PATCH'),
    hold: (on: boolean) => (holding = on),
    held: () => held.length,
    release: () => held.splice(0).forEach((go) => go()),
    most: () => most,
  };
}

beforeEach(() => {
  localStorage.clear();
  fakeDecoder({ seconds: 0.8 });
});
afterEach(() => vi.unstubAllGlobals());

const giveSection = (): HTMLElement => screen.getByRole('region', { name: 'Give recordings a character' });
const timeSection = (): HTMLElement => screen.getByRole('region', { name: 'Make mouth timelines' });

describe('the characters side of the studio', () => {
  it('counts, kind by kind, what has no character and what has one but no timeline', async () => {
    server(LESSONS, LETTERS);
    renderUi(<Characters />);
    const table = await screen.findByRole('table', { name: 'Recordings by kind' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
    const cells = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
    expect(cells).toEqual([
      ['Lesson and story sentences', '3', '1', '1'],
      ['Alphabet sounds', '3', '1', '1'],
    ]);
  });

  it('gives a character only to recordings with none, of the kind chosen', async () => {
    const user = userEvent.setup();
    const api = server(LESSONS, LETTERS);
    renderUi(<Characters />);
    const give = giveSection();
    await within(give).findByRole('button', { name: 'Give 2 recordings to Hevalo' });
    await user.selectOptions(within(give).getByLabelText('Which recordings'), 'alphabet');
    await user.click(within(give).getByRole('radio', { name: 'Xezo' }));
    await user.click(within(give).getByRole('button', { name: 'Give 1 recording to Xezo' }));
    expect(await within(give).findByText('Finished: 1 saved')).toBeInTheDocument();
    expect(api.patches().map((c) => [c.path, c.body])).toEqual([['/admin/audio/alphabet?key=kmr%3Asound%3Ab', { speaker: 'xezo' }]]);
    // the counts follow: the sentence without a character is all that is left
    await user.selectOptions(within(give).getByLabelText('Which recordings'), 'all');
    expect(within(give).getByRole('button', { name: 'Give 1 recording to Xezo' })).toBeEnabled();
  });

  it('makes timelines only for recordings with a character and none yet, and replaces one only when asked', async () => {
    const user = userEvent.setup();
    const api = server(LESSONS, LETTERS);
    renderUi(<Characters />);
    const time = timeSection();
    await user.click(await within(time).findByRole('button', { name: 'Make 2 timelines' }));
    expect(await within(time).findByText('Finished: 2 saved')).toBeInTheDocument();
    const first = api.patches();
    expect(first.map((c) => c.path).sort()).toEqual(['/admin/audio/alphabet?key=kmr%3Aword%3Aa', '/admin/audio/lesson?key=spas']);
    for (const c of first) expect(c.body).toEqual({ lipsync: expect.objectContaining({ v: 1, d: 800 }) });
    // nothing is left without one, and those that have one are not touched…
    expect(within(time).getByRole('button', { name: 'Every recording here has a timeline' })).toBeDisabled();
    // …until the editor asks for them to be made again
    await user.click(within(time).getByRole('checkbox', { name: 'Remake existing timelines' }));
    await user.click(within(time).getByRole('button', { name: 'Make 4 timelines' }));
    await waitFor(() => expect(api.patches()).toHaveLength(6));
    expect(api.patches().slice(2).map((c) => c.path).sort()).toEqual([
      '/admin/audio/alphabet?key=kmr%3Aword%3Aa',
      '/admin/audio/alphabet?key=kmr%3Aword%3Ab',
      '/admin/audio/lesson?key=roj',
      '/admin/audio/lesson?key=spas',
    ]);
  });

  it('works two at a time, and can be paused, resumed and cancelled', async () => {
    const user = userEvent.setup();
    const many = listing(['Yek', 'Du', 'Sê', 'Çar', 'Pênc', 'Şeş'].map((t) => item(t, { speaker: 'hamo' })));
    const api = server(many, { recordings: [] });
    api.hold(true);
    renderUi(<Characters />);
    const time = timeSection();
    await user.click(await within(time).findByRole('button', { name: 'Make 6 timelines' }));
    await waitFor(() => expect(api.held()).toBe(2));
    await user.click(within(time).getByRole('button', { name: 'Pause' }));
    expect(within(time).getByRole('status')).toHaveTextContent('Paused');
    api.release();
    await waitFor(() => expect(within(time).getByText('2 of 6')).toBeInTheDocument());
    // paused: the two in hand finished, and nothing else began
    expect(api.patches()).toHaveLength(2);
    expect(api.held()).toBe(0);

    await user.click(within(time).getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(api.held()).toBe(2));
    await user.click(within(time).getByRole('button', { name: 'Cancel' }));
    api.release();
    expect(await within(time).findByText('Cancelled: 4 saved')).toBeInTheDocument();
    expect(api.most()).toBe(2);
    // the last two were never touched, and are still to do
    expect(api.patches().map((c) => decodeURIComponent(c.path.split('key=')[1]!)).sort()).toEqual(['du', 'sê', 'yek', 'çar']);
    expect(within(time).getByRole('button', { name: 'Make 2 timelines' })).toBeEnabled();
  });

  it('sets aside what failed, with why, carries on with the rest, and retries one at a time', async () => {
    const user = userEvent.setup();
    let refusals = 1;
    const api = server(
      listing([item('Spas', { speaker: 'hamo' }), item('Roj', { speaker: 'hamo' })]),
      { recordings: [sound('ckb:sound:eyn', { speaker: 'xezo', url: 'https://elsewhere.test/eyn.wav' })] },
      on('PATCH', '/admin/audio/lesson?key=spas', () => (refusals-- > 0 ? failure(500, 'INTERNAL', 'boom') : json({ speaker: 'hamo', lipsync: null }))),
    );
    renderUi(<Characters />);
    const time = timeSection();
    await user.click(await within(time).findByRole('button', { name: 'Make 3 timelines' }));
    expect(await within(time).findByText('Finished: 1 saved, 2 failed')).toBeInTheDocument();
    const failures = within(time).getByRole('list');
    const [spas, eyn] = within(failures).getAllByRole('listitem');
    expect(spas).toHaveTextContent('Spas');
    expect(spas).toHaveTextContent('The server had a problem.');
    expect(eyn).toHaveTextContent('عا');
    expect(eyn).toHaveTextContent('The browser was not allowed to read the file from elsewhere.test');
    expect(api.patches().map((c) => c.path)).toContain('/admin/audio/lesson?key=roj');

    await user.click(within(failures).getByRole('button', { name: 'Retry “Spas”' }));
    expect(await within(time).findByText('Finished: 1 saved, 1 failed')).toBeInTheDocument();
    expect(within(time).getAllByRole('listitem').map((li) => li.querySelector('.vc-fail-what')?.textContent)).toEqual(['عا']);
    expect(api.patches().filter((c) => c.path === '/admin/audio/lesson?key=spas')).toHaveLength(2);
  });
});
