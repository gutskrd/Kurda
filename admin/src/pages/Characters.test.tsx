// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { DictionaryAudioAdminItem, SpeakerId } from '@kurda/shared';
import type { Item, Listing } from '../lessonAudio';
import type { AlphabetRecording } from '../voiceBatch';
import { fakeDecoder } from '../test/audio';
import { failure, fakeApi, json, on, type Call, type Reply, type Route } from '../test/fetch';
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
  return { key, url: `https://media.test/${encodeURIComponent(key)}.wav`, durationMs: 800, updatedAt: '2026-10-01T10:00:00.000Z', speaker: null, hasLipsync: false, lipsync: null, ...over };
}

function word(headword: string, over: Partial<DictionaryAudioAdminItem> = {}): DictionaryAudioAdminItem {
  return {
    // ASCII, as a uuid is, so it reads the same in an address
    id: `id-${Array.from(headword, (c) => c.codePointAt(0)!.toString(16)).join('-')}`,
    entryId: `entry-${headword}`,
    headword,
    dialect: 'kurmanji',
    url: `https://upload.wikimedia.org/${encodeURIComponent(headword)}.ogg`,
    speaker: null,
    hasLipsync: false,
    lipsync: null,
    ...over,
  };
}

const listing = (items: Item[]): Listing => ({ items, summary: { needed: 0, recorded: 0, missing: 0, unused: 0 } });

const LESSONS = listing([
  item('Silav'),
  item('Spas', { speaker: 'hamo' }),
  item('Roj', { speaker: 'xezo', hasLipsync: true }),
  item('Nan', { recorded: false, url: null }),
]);
const LETTERS = { recordings: [sound('kmr:sound:b'), sound('kmr:word:a', { speaker: 'hevalo' }), sound('kmr:word:b', { speaker: 'hamo', hasLipsync: true })] };
const WORDS = [word('av'), word('bav'), word('dar', { speaker: 'hamo' }), word('gul', { speaker: 'xezo', hasLipsync: true }), word('mal')];

/**
 * The API behind the page: the three lists (the dictionary's paged two at a
 * time, filtered as the server filters it, its saved changes kept), each
 * recording's file, and PATCH, which can be held until the test lets it go.
 */
function server(lessons: Listing, letters: { recordings: AlphabetRecording[] }, words: DictionaryAudioAdminItem[], ...routes: Route[]) {
  const dict = words.map((w) => ({ ...w })).sort((a, b) => a.headword.localeCompare(b.headword));
  const counts = () => ({
    total: dict.length,
    noSpeaker: dict.filter((w) => w.speaker === null).length,
    speakerNoTimeline: dict.filter((w) => w.speaker !== null && !w.hasLipsync).length,
  });
  const page = (call: Call): Reply => {
    const q = new URLSearchParams(call.path.split('?')[1]);
    const speaker = q.get('speaker');
    const after = q.get('cursor');
    const matching = dict.filter(
      (w) =>
        (speaker === null || (speaker === 'none' ? w.speaker === null : speaker === 'any' ? w.speaker !== null : w.speaker === speaker)) &&
        (q.get('lipsync') !== 'missing' || !w.hasLipsync) &&
        (after === null || w.headword > after),
    );
    const size = Math.min(Number(q.get('limit') ?? 100), 2);
    const items = matching.slice(0, size);
    return json({ items, nextCursor: matching.length > size ? items.at(-1)!.headword : null, counts: counts() });
  };
  const patch = (call: Call): Reply => {
    const q = new URLSearchParams(call.path.split('?')[1]);
    const body = call.body as { speaker?: SpeakerId | null; lipsync?: unknown };
    const found = dict.find((w) => w.id === q.get('key'));
    if (found && body.speaker !== undefined) found.speaker = body.speaker;
    if (found && body.lipsync !== undefined) found.hasLipsync = body.lipsync !== null;
    return json({ speaker: body.speaker ?? null, lipsync: body.lipsync ?? null });
  };
  const fake = fakeApi(
    on('GET', '/admin/lesson-audio', json(lessons)),
    on('GET', '/admin/alphabet/audio', json(letters)),
    on('GET', /^\/admin\/dictionary\/audio\?/, page),
    on('GET', /^\/admin\/audio\/(lesson|alphabet|dictionary)\/file\?key=/, json('bytes')),
    on('PATCH', /^\/admin\/audio\//, patch),
    ...routes,
  );
  const served = fetch;
  const held: Array<() => void> = [];
  let holding = false;
  let inFlight = 0;
  let most = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
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
    calls: (): Call[] => fake.calls,
    patches: (): Call[] => fake.calls.filter((c) => c.method === 'PATCH'),
    hold: (on: boolean) => (holding = on),
    held: () => held.length,
    release: () => held.splice(0).forEach((go) => go()),
    most: () => most,
    dict,
  };
}

beforeEach(() => {
  localStorage.clear();
  fakeDecoder({ seconds: 0.8 });
});
afterEach(() => vi.unstubAllGlobals());

const giveSection = (): HTMLElement => screen.getByRole('region', { name: 'Give recordings a character' });
const timeSection = (): HTMLElement => screen.getByRole('region', { name: 'Make mouth timelines' });
const keyOf = (c: Call): string => decodeURIComponent(c.path.split('key=')[1]!);

describe('the characters side of the studio', () => {
  it('counts, kind by kind, what has no character and what has one but no timeline, the dictionary’s too', async () => {
    server(LESSONS, LETTERS, WORDS);
    renderUi(<Characters />);
    const table = await screen.findByRole('table', { name: 'Recordings by kind' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(4));
    const cells = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
    expect(cells).toEqual([
      ['Lesson and story sentences', '3', '1', '1'],
      ['Alphabet sounds', '3', '1', '1'],
      ['Dictionary pronunciations', '5', '3', '1'],
    ]);
  });

  it('gives a character only to recordings with none, of the kind chosen', async () => {
    const user = userEvent.setup();
    const api = server(LESSONS, LETTERS, WORDS);
    renderUi(<Characters />);
    const give = giveSection();
    await within(give).findByRole('button', { name: 'Give 5 recordings to Hevalo' });
    await user.selectOptions(within(give).getByLabelText('Which recordings'), 'alphabet');
    await user.click(within(give).getByRole('radio', { name: 'Xezo' }));
    await user.click(within(give).getByRole('button', { name: 'Give 1 recording to Xezo' }));
    expect(await within(give).findByText('Finished: 1 saved')).toBeInTheDocument();
    expect(api.patches().map((c) => [c.path, c.body])).toEqual([['/admin/audio/alphabet?key=kmr%3Asound%3Ab', { speaker: 'xezo' }]]);
    // the counts follow: the sentence and the three words without a character are left
    await user.selectOptions(within(give).getByLabelText('Which recordings'), 'all');
    expect(within(give).getByRole('button', { name: 'Give 4 recordings to Xezo' })).toBeEnabled();
  });

  it('works through the dictionary a page at a time, touching only the words with no character', async () => {
    const user = userEvent.setup();
    const api = server(LESSONS, LETTERS, WORDS);
    renderUi(<Characters />);
    const give = giveSection();
    await within(give).findByRole('button', { name: /^Give 5/ });
    await user.selectOptions(within(give).getByLabelText('Which recordings'), 'dictionary');
    await user.click(within(give).getByRole('radio', { name: 'Hamo' }));
    await user.click(within(give).getByRole('button', { name: 'Give 3 recordings to Hamo' }));
    expect(await within(give).findByText('Finished: 3 saved')).toBeInTheDocument();
    expect(api.patches().map((c) => api.dict.find((w) => w.id === keyOf(c))?.headword).sort()).toEqual(['av', 'bav', 'mal']);
    // only the words with no character were asked for, a page at a time
    const lists = api.calls().filter((c) => c.path.startsWith('/admin/dictionary/audio?') && c.path.includes('speaker=none'));
    expect(lists.length).toBeGreaterThan(1);
    expect(api.dict.map((w) => w.speaker)).toEqual(['hamo', 'hamo', 'hamo', 'xezo', 'hamo']);
    const table = screen.getByRole('table', { name: 'Recordings by kind' });
    expect(within(table).getAllByRole('row')[3]).toHaveTextContent(/Dictionary pronunciations5\s*0\s*4/);
  });

  it('makes timelines from files read through the API, only for recordings with a character and none yet, unless asked to remake them', async () => {
    const user = userEvent.setup();
    const api = server(LESSONS, LETTERS, WORDS);
    renderUi(<Characters />);
    const time = timeSection();
    await user.click(await within(time).findByRole('button', { name: 'Make 3 timelines' }));
    expect(await within(time).findByText('Finished: 3 saved')).toBeInTheDocument();
    const dar = api.dict.find((w) => w.headword === 'dar')!;
    expect(api.patches().map((c) => c.path).sort()).toEqual(
      ['/admin/audio/alphabet?key=kmr%3Aword%3Aa', `/admin/audio/dictionary?key=${dar.id}`, '/admin/audio/lesson?key=spas'].sort(),
    );
    for (const c of api.patches()) expect(c.body).toEqual({ lipsync: expect.objectContaining({ v: 1, d: 800 }) });
    // every file came through the API, never from where the recording is kept
    const files = api.calls().filter((c) => c.path.includes('/file?'));
    expect(files.map((c) => c.path).sort()).toEqual(
      ['/admin/audio/alphabet/file?key=kmr%3Aword%3Aa', `/admin/audio/dictionary/file?key=${dar.id}`, '/admin/audio/lesson/file?key=spas'].sort(),
    );
    expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).startsWith('/admin/'))).toBe(true);
    // nothing is left without one, and those that have one are not touched…
    expect(within(time).getByRole('button', { name: 'Every recording here has a timeline' })).toBeDisabled();
    // …until the editor asks for them to be made again
    await user.click(within(time).getByRole('checkbox', { name: 'Remake existing timelines' }));
    await user.click(within(time).getByRole('button', { name: 'Make 6 timelines' }));
    expect(await within(time).findByText('Finished: 6 saved')).toBeInTheDocument();
    const gul = api.dict.find((w) => w.headword === 'gul')!;
    expect(api.patches().slice(3).map(keyOf).sort()).toEqual(['kmr:word:a', 'kmr:word:b', 'roj', 'spas', dar.id, gul.id].sort());
  });

  it('works two at a time, and can be paused, resumed and cancelled', async () => {
    const user = userEvent.setup();
    const many = listing(['Yek', 'Du', 'Sê', 'Çar', 'Pênc', 'Şeş'].map((t) => item(t, { speaker: 'hamo' })));
    const api = server(many, { recordings: [] }, []);
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
    expect(api.patches().map(keyOf).sort()).toEqual(['du', 'sê', 'yek', 'çar']);
    expect(within(time).getByRole('button', { name: 'Make 2 timelines' })).toBeEnabled();
  });

  it('sets aside what failed, with why, carries on with the rest, and retries one at a time', async () => {
    const user = userEvent.setup();
    let refusals = 1;
    const far = word('kêr', { speaker: 'xezo' });
    const api = server(
      listing([item('Spas', { speaker: 'hamo' }), item('Roj', { speaker: 'hamo' })]),
      { recordings: [] },
      [far],
      on('PATCH', '/admin/audio/lesson?key=spas', () => (refusals-- > 0 ? failure(500, 'INTERNAL', 'boom') : json({ speaker: 'hamo', lipsync: null }))),
      on('GET', `/admin/audio/dictionary/file?key=${far.id}`, failure(502, 'AUDIO_UNREACHABLE', 'upload.wikimedia.org answered 404', { reason: 'status' })),
    );
    renderUi(<Characters />);
    const time = timeSection();
    await user.click(await within(time).findByRole('button', { name: 'Make 3 timelines' }));
    expect(await within(time).findByText('Finished: 1 saved, 2 failed')).toBeInTheDocument();
    const failures = within(time).getByRole('list');
    const [spas, ker] = within(failures).getAllByRole('listitem');
    expect(spas).toHaveTextContent('Spas');
    expect(spas).toHaveTextContent('The server had a problem.');
    expect(ker).toHaveTextContent('kêr · Dictionary pronunciations');
    expect(ker).toHaveTextContent('Could not get the file: upload.wikimedia.org answered 404.');
    expect(api.patches().map((c) => c.path)).toContain('/admin/audio/lesson?key=roj');

    await user.click(within(failures).getByRole('button', { name: 'Retry “Spas”' }));
    expect(await within(time).findByText('Finished: 1 saved, 1 failed')).toBeInTheDocument();
    expect(within(time).getAllByRole('listitem').map((li) => li.querySelector('.vc-fail-what')?.textContent)).toEqual(['kêr']);
    expect(api.patches().filter((c) => c.path === '/admin/audio/lesson?key=spas')).toHaveLength(2);
  });

  it('waits when the server asks it to slow down, then carries on, failing nothing', async () => {
    const user = userEvent.setup();
    let refusals = 1;
    const api = server(
      listing([item('Yek', { speaker: 'hamo' }), item('Du', { speaker: 'hamo' }), item('Sê', { speaker: 'hamo' })]),
      { recordings: [] },
      [],
      on('PATCH', '/admin/audio/lesson?key=du', () =>
        refusals-- > 0 ? { ...failure(429, 'RATE_LIMITED', 'too many requests'), headers: { 'retry-after': '1' } } : json({ speaker: 'hamo', lipsync: null }),
      ),
    );
    renderUi(<Characters />);
    const time = timeSection();
    await user.click(await within(time).findByRole('button', { name: 'Make 3 timelines' }));
    expect(await within(time).findByRole('status')).toHaveTextContent('Waiting: the server asked to slow down');
    expect(within(time).getByText(/carrying on in 1 s/)).toBeInTheDocument();
    expect(await within(time).findByText('Finished: 3 saved', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(within(time).queryByRole('list')).toBeNull();
    expect(api.patches().filter((c) => keyOf(c) === 'du')).toHaveLength(2);
  });
});
