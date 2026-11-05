// @vitest-environment jsdom
/**
 * Record by person against a fake API: the people's cards, one person's
 * lines in order, and the recorder that keeps a take and moves on — by
 * button and by key — sending each take where the studio files it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { setToken } from '../api';
import { AuthProvider } from '../auth';
import type { Line, LinesPage, PeopleListing, Person } from '../recordingPeople';
import { failure, fakeApi, json, on, type Route } from '../test/fetch';
import { renderUi } from '../test/render';
import { RecordByPerson } from './RecordByPerson';

// the microphone and the trimming are the browser's: here a take is three bytes, ready at once
vi.mock('../micCapture', async (original) => ({
  ...(await original<typeof import('../micCapture')>()),
  micPermission: async () => 'granted',
  startCapture: async () => ({ level: () => 0.4, stop: async () => new ArrayBuffer(3), cancel: () => {} }),
}));
vi.mock('../audioClip', async (original) => ({
  ...(await original<typeof import('../audioClip')>()),
  prepare: async () => ({ wav: new Uint8Array([82, 73, 70]), url: 'blob:take', seconds: 1.2 }),
}));

const CONV = 'roadu03s1l2a';
const WJ = '⁠';

function person(over: Partial<Person> & Pick<Person, 'id' | 'name'>): Person {
  return { kind: 'character', speaker: null, about: null, dialect: null, total: 0, done: 0, todo: 0, dialects: [], linked: [], ...over };
}

const XEZAL = person({ id: 'xezo', name: 'Xezal', speaker: 'xezo', about: 'Hamo’s niece, who studies in Amed.', total: 3, done: 1, todo: 2, dialects: [{ dialect: 'kmr', total: 3, done: 1, todo: 2 }] });
const HAMO = person({ id: 'hamo', name: 'Hamo', speaker: 'hamo', total: 4, done: 0, todo: 4, dialects: [{ dialect: 'kmr', total: 4, done: 0, todo: 4 }], linked: [{ id: 'u-9', username: 'dilan' }] });
const NARRATOR = person({ id: 'narrator-kmr', kind: 'narrator', name: 'Narrator · Kurmancî', dialect: 'kmr', total: 1, done: 0, todo: 1, dialects: [{ dialect: 'kmr', total: 1, done: 0, todo: 1 }] });

function line(over: Partial<Line> & Pick<Line, 'id' | 'seq' | 'text'>): Line {
  return {
    store: 'lesson',
    key: over.text.toLowerCase(),
    dialect: 'kmr',
    voice: 'xezo',
    speaker: 'xezo',
    meaning: null,
    hint: null,
    cue: null,
    conversation: null,
    before: null,
    section: { id: 'kurmanji-road:3', label: 'Unit 3 · At home' },
    places: [{ kind: 'lesson', label: 'Unit 3 · Lesson 2 · exercise 4 (translate)', status: 'published', voice: 'xezo', ref: null }],
    live: true,
    take: null,
    ...over,
  };
}

const LINES: Line[] = [
  line({
    id: `lesson|${CONV}${WJ}1${WJ}silav, xalo`,
    seq: 10,
    text: 'Silav, xalo!',
    conversation: { id: CONV, part: 1, title: 'Nexşeya kevn', name: 'Xezo' },
    places: [{ kind: 'conversation', label: 'Unit 3 · Lesson 2 · conversation ‘Nexşeya kevn’, line 2', status: 'published', voice: 'xezo', ref: null }],
    take: { url: 'https://cdn.test/silav.wav', durationMs: 900, updatedAt: '2026-10-01T10:00:00.000Z', speaker: 'xezo', by: 'rojda' },
  }),
  line({
    id: `lesson|${CONV}${WJ}1${WJ}ev nexşe kevn e`,
    seq: 11,
    text: 'Ev nexşe kevn e!',
    meaning: 'This map is old!',
    conversation: { id: CONV, part: 1, title: 'Nexşeya kevn', name: 'Xezo' },
    before: { name: 'Hamo', text: 'Xezo, binêre!', meaning: 'Xezo, look!' },
    places: [
      { kind: 'conversation', label: 'Unit 3 · Lesson 2 · conversation ‘Nexşeya kevn’, line 4', status: 'published', voice: 'xezo', ref: null },
      { kind: 'game', label: 'What Would You Say? · ‘In the attic’ · the line heard', status: 'draft', voice: 'xezo', ref: null },
    ],
  }),
  line({
    id: 'lesson|ez li malê me',
    seq: 14,
    text: 'Ez li malê me.',
    meaning: 'I am at home.',
    section: { id: 'kurmanji-road:4', label: 'Unit 4 · The market' },
    places: [{ kind: 'lesson', label: 'Unit 4 · Lesson 1 · exercise 2 (listening)', status: 'draft', voice: 'xezo', ref: null }],
    live: false,
  }),
];

const LETTER = line({
  id: 'alphabet|kmr:sound:a',
  seq: 900,
  store: 'alphabet',
  key: 'kmr:sound:a',
  text: 'a',
  voice: 'narrator-kmr',
  speaker: null,
  hint: 'the vowel alone, held briefly',
  section: { id: 'alphabet:kmr-sound', label: 'Alphabet · Kurmancî letters' },
  places: [{ kind: 'alphabet', label: 'Alphabet · Kurmancî letters · A a', status: 'published', voice: 'narrator-kmr', ref: null }],
});

function page(who: Person, lines: Line[], next: string | null = null): LinesPage {
  return { person: who, lines, next, total: lines.length, sections: [] };
}

/** Xezal's lines in two pages, as the API pages them. */
const xezalLines: Route = on('GET', /^\/admin\/recording\/people\/xezo\?/, (c) =>
  json(c.path.includes('cursor=11') ? page(XEZAL, LINES.slice(2)) : page(XEZAL, LINES.slice(0, 2), '11')),
);
const me: Route = on('GET', '/me', json({ user: { id: 'u-1', username: 'gulistan', roles: ['voice_actor'] } }));

function show(voice: string | null, ...routes: Route[]): ReturnType<typeof fakeApi> {
  setToken('tok');
  const api = fakeApi(me, ...routes);
  renderUi(
    <AuthProvider>
      <RecordByPerson voice={voice} />
    </AuthProvider>,
  );
  return api;
}

function stage(): HTMLElement {
  return screen.getByRole('article');
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // nothing to clear
  }
});

afterEach(() => {
  setToken(null);
  vi.unstubAllGlobals();
});

describe('the people', () => {
  it('shows a card for each voice, the account’s own first, with what is left for each', async () => {
    const listing: PeopleListing = { people: [HAMO, XEZAL, NARRATOR], mine: ['xezo'], ownVoicesOnly: false };
    show(null, on('GET', '/admin/recording/people', json(listing)));
    const yours = await screen.findByRole('region', { name: 'Your voice' });
    expect(within(yours).getByRole('heading', { name: 'Xezal' })).toBeInTheDocument();
    expect(within(yours).getByText('2 lines left of 3')).toBeInTheDocument();
    expect(within(yours).getByRole('img', { name: '1 of 3 recorded' })).toBeInTheDocument();
    expect(within(yours).getByRole('link', { name: 'Record Xezal’s lines' })).toHaveAttribute('href', '#/record/xezo');
    const others = screen.getByRole('region', { name: 'Everyone else' });
    expect(within(others).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Hamo', 'Narrator · Kurmancî']);
    expect(within(others).getByText('Recorded by @dilan')).toBeInTheDocument();
    expect(screen.getByText('7 lines still to record across every voice.')).toBeInTheDocument();
  });

  it('tells a voice actor with no voice linked yet who links one', async () => {
    show(null, on('GET', '/admin/recording/people', json({ people: [], mine: [], ownVoicesOnly: true })));
    expect(await screen.findByText('No voice is linked to your account yet')).toBeInTheDocument();
  });

  it('downloads a person’s script, every line in order, to rehearse from', async () => {
    const user = userEvent.setup();
    const saved: Blob[] = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => (saved.push(b), 'blob:script'), revokeObjectURL: () => {} }));
    // the browser saves the file; here the link is only clicked
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    show(null, on('GET', '/admin/recording/people', json({ people: [XEZAL], mine: ['xezo'], ownVoicesOnly: true })), xezalLines);
    await user.click(await screen.findByRole('button', { name: 'Download script' }));
    await user.click(await screen.findByRole('menuitem', { name: 'To read and rehearse (Markdown)' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(saved[0]!);
    });
    expect(text).toContain('# Xezal: lines to record');
    expect(text.indexOf('Silav, xalo!')).toBeLessThan(text.indexOf('Ez li malê me.'));
    expect(text).toContain('   - Before it: Hamo: “Xezo, binêre!” (Xezo, look!)');
    expect(text).toContain('   - Unit 4 · Lesson 1 · exercise 2 (listening) — draft');
  });
});

describe('recording one person’s lines', () => {
  it('opens on the first line still to record, with the line before it and what it means', async () => {
    show('xezo', xezalLines);
    const here = await screen.findByRole('article', { name: 'Ev nexşe kevn e!' });
    expect(within(here).getByText('Line 2 of 3')).toBeInTheDocument();
    expect(within(here).getByText('Hamo says')).toBeInTheDocument();
    expect(within(here).getByText('Xezo, binêre!')).toBeInTheDocument();
    expect(within(here).getByText('This map is old!')).toBeInTheDocument();
    // where it comes from, then every place it is said
    expect(within(here).getAllByText('Unit 3 · Lesson 2 · conversation ‘Nexşeya kevn’, line 4')).toHaveLength(2);
    expect(within(here).getByText('What Would You Say? · ‘In the attic’ · the line heard — draft')).toBeInTheDocument();
    expect(within(here).getByText('Said in 2 places: one take serves them all')).toBeInTheDocument();
    // every page was read: the list has the line from the second one
    expect(screen.getByRole('navigation', { name: 'Lines' })).toHaveTextContent('Ez li malê me.');
  });

  it('records, stops, hears it back and keeps it, filed as the studio files the line, then brings up the next', async () => {
    const user = userEvent.setup();
    const api = show(
      'xezo',
      xezalLines,
      on('PUT', /^\/admin\/lesson-audio\?/, json({ key: 'k', text: 'Ev nexşe kevn e!', url: 'https://cdn.test/nexse.wav', durationMs: 1200, updatedAt: '2026-11-05T10:00:00.000Z', speaker: 'xezo' }, 201)),
    );
    await screen.findByRole('article', { name: 'Ev nexşe kevn e!' });
    await user.click(within(stage()).getByRole('button', { name: 'Record' }));
    await user.click(await within(stage()).findByRole('button', { name: 'Stop' }));
    expect(await within(stage()).findByText('Listen back · 1.2 s')).toBeInTheDocument();
    await user.click(within(stage()).getByRole('button', { name: 'Keep' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true));
    // a conversation's line under its conversation and part, said by its character; this take cannot be timed, so no timeline
    expect(api.calls.find((c) => c.method === 'PUT')!.path).toBe(
      `/admin/lesson-audio?text=${encodeURIComponent('Ev nexşe kevn e!')}&line=${encodeURIComponent(`${CONV}:1`)}&speaker=xezo`,
    );
    expect(await screen.findByRole('article', { name: 'Ez li malê me.' })).toBeInTheDocument();
    expect(within(stage()).getByText('Draft')).toBeInTheDocument();
    // what is left counts the take kept
    expect(screen.getByText('1 line left of 3')).toBeInTheDocument();
  });

  it('works from a laptop’s keys: Space records and stops, Enter keeps, the arrows move', async () => {
    const user = userEvent.setup();
    const api = show('xezo', xezalLines, on('PUT', /^\/admin\/lesson-audio\?/, json({ key: 'k', url: 'https://cdn.test/x.wav', durationMs: 800, speaker: 'xezo' }, 201)));
    await screen.findByRole('article', { name: 'Ev nexşe kevn e!' });
    await user.keyboard('{ArrowRight}');
    expect(await screen.findByRole('article', { name: 'Ez li malê me.' })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(await screen.findByRole('article', { name: 'Ev nexşe kevn e!' })).toBeInTheDocument();
    await user.keyboard(' ');
    expect(await within(stage()).findByRole('button', { name: 'Stop' })).toBeInTheDocument();
    await user.keyboard(' ');
    expect(await within(stage()).findByRole('button', { name: 'Keep' })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(api.calls.filter((c) => c.method === 'PUT')).toHaveLength(1));
    expect(await screen.findByRole('article', { name: 'Ez li malê me.' })).toBeInTheDocument();
  });

  it('picks up on the line the person was on last time', async () => {
    localStorage.setItem('kurda_admin_record_at:xezo', 'lesson|ez li malê me');
    show('xezo', xezalLines);
    expect(await screen.findByRole('article', { name: 'Ez li malê me.' })).toBeInTheDocument();
  });

  it('lets the person jump around the list, and narrow it to what is done, to one unit or to drafts', async () => {
    const user = userEvent.setup();
    show('xezo', xezalLines);
    await screen.findByRole('article', { name: 'Ev nexşe kevn e!' });
    const list = screen.getByRole('navigation', { name: 'Lines' });
    await user.click(within(list).getByRole('button', { name: /Ez li malê me\./ }));
    expect(await screen.findByRole('article', { name: 'Ez li malê me.' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /^Done/ }));
    // the line on screen stays listed; the done one joins it
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([expect.stringContaining('Silav, xalo!'), expect.stringContaining('Ez li malê me.')]);
    await user.click(screen.getByRole('tab', { name: /^All/ }));
    await user.selectOptions(screen.getByLabelText('Where'), 'kurmanji-road:3');
    expect(within(list).getAllByRole('button')).toHaveLength(3);
    await user.selectOptions(screen.getByLabelText('Where'), '');
    await user.selectOptions(screen.getByLabelText('Source'), 'published');
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('Silav, xalo!'),
      expect.stringContaining('Ev nexşe kevn e!'),
      expect.stringContaining('Ez li malê me.'),
    ]);
    // a recorded line plays back what was kept, and says by whom
    await user.click(within(list).getByRole('button', { name: /Silav, xalo!/ }));
    expect(await within(stage()).findByText(/Recorded @rojda · 0\.9 s/)).toBeInTheDocument();
    expect(within(stage()).getByRole('button', { name: 'Record it again' })).toBeInTheDocument();
  });

  it('records a narrator’s letter in the alphabet’s store, timed in its script, leaving who is drawn as it was', async () => {
    const user = userEvent.setup();
    const api = show(
      'narrator-kmr',
      on('GET', /^\/admin\/recording\/people\/narrator-kmr\?/, json(page(NARRATOR, [LETTER]))),
      on('PUT', /^\/admin\/alphabet\/audio\?/, json({ key: 'kmr:sound:a', url: 'https://cdn.test/a.wav', durationMs: 700, speaker: null }, 201)),
    );
    const here = await screen.findByRole('article', { name: 'a' });
    expect(within(here).getByText('How: the vowel alone, held briefly')).toBeInTheDocument();
    await user.click(within(here).getByRole('button', { name: 'Record' }));
    await user.click(await within(stage()).findByRole('button', { name: 'Stop' }));
    await user.click(await within(stage()).findByRole('button', { name: 'Keep' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(api.calls.find((c) => c.method === 'PUT')!.path).toBe(`/admin/alphabet/audio?key=${encodeURIComponent('kmr:sound:a')}`);
    expect(await screen.findByText('Everything here is recorded.')).toBeInTheDocument();
  });

  it('keeps the take and says why when the server refuses a line that is not theirs', async () => {
    const user = userEvent.setup();
    show('xezo', xezalLines, on('PUT', /^\/admin\/lesson-audio\?/, failure(403, 'NOT_YOUR_LINE', 'this line is not one of the voices linked to your account')));
    await screen.findByRole('article', { name: 'Ev nexşe kevn e!' });
    await user.click(within(stage()).getByRole('button', { name: 'Record' }));
    await user.click(await within(stage()).findByRole('button', { name: 'Stop' }));
    await user.click(await within(stage()).findByRole('button', { name: 'Keep' }));
    expect(await within(stage()).findByRole('alert')).toHaveTextContent('this line is not one of the voices linked to your account');
    expect(within(stage()).getByRole('button', { name: 'Keep' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Ev nexşe kevn e!' })).toBeInTheDocument();
  });
});
