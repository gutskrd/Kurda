// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { decodeLipsync } from '@kurda/shared';
import { encodeWav } from '../audioClip';
import type { Item, Listing, Usage } from '../lessonAudio';
import { fakeDecoder, speechPcm } from '../test/audio';
import { failure, fakeApi, json, on, type Call } from '../test/fetch';
import { renderUi } from '../test/render';
import { AudioStudio } from './AudioStudio';

// the microphone and the trimming are the browser's: here a take is three bytes, ready at once
// (or, for a test of its timeline, a real WAV)
const take = vi.hoisted(() => ({ wav: new Uint8Array([82, 73, 70]) as Uint8Array }));
vi.mock('../micCapture', async (original) => ({
  ...(await original<typeof import('../micCapture')>()),
  micPermission: async () => 'granted',
  startCapture: async () => ({ level: () => 0.4, stop: async () => new ArrayBuffer(3), cancel: () => {} }),
}));
vi.mock('../audioClip', async (original) => ({
  ...(await original<typeof import('../audioClip')>()),
  prepare: async () => ({ wav: take.wav, url: 'blob:take', seconds: 1.2 }),
}));

function usage(over: Partial<Usage>): Usage {
  return {
    courseId: 'c1',
    courseTitle: 'Kurmancî for beginners',
    unitId: 'u1',
    unitTitle: 'Basics',
    skillId: 's1',
    skillTitle: 'Greetings',
    lessonPosition: 1,
    lessonId: 'l1',
    lessonTitle: 'Saying hello',
    lessonStatus: 'published',
    lessonVersion: 1,
    live: true,
    exerciseTypes: ['translate'],
    listeningNeedsIt: false,
    ...over,
  };
}
const story = usage({ courseId: 'stories:kurmanci', courseTitle: 'Stories — Kurmancî', skillId: 'st-1', unitId: 'st-1', lessonId: 'st-1', lessonTitle: 'Şorbeya Nîskê', lessonPosition: 0, exerciseTypes: [] });
const other = usage({ courseId: 'stories:kurmanci', courseTitle: 'Stories — Kurmancî', skillId: 'st-2', unitId: 'st-2', lessonId: 'st-2', lessonTitle: 'Qelema Şîn', lessonPosition: 0, exerciseTypes: [] });

function item(text: string, usedIn: Usage[], recorded = false): Item {
  return {
    key: text.toLowerCase(),
    text,
    recorded,
    url: recorded ? `https://cdn.test/${text}.wav` : null,
    durationMs: recorded ? 900 : null,
    updatedAt: recorded ? '2026-10-01T10:00:00.000Z' : null,
    usedIn,
    unused: false,
  };
}

const LISTING: Listing = {
  items: [
    item('Silav', [usage({})], true),
    item('Spas', [usage({})]),
    item('Dayika min şorbe çêdike', [story]),
    item('Ez birçî me', [story], true),
    item('Qelema min şîn e', [other]),
  ],
  summary: { needed: 5, recorded: 2, missing: 3, unused: 0 },
};

beforeEach(() => {
  take.wav = new Uint8Array([82, 73, 70]);
  try {
    localStorage.clear();
  } catch {
    // nothing to clear
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  location.hash = '';
});

function rowTexts(): string[] {
  return [...document.querySelectorAll('.la-text')].map((el) => el.textContent ?? '');
}

describe('the audio studio', () => {
  it('records story sentences on a side of its own, opening on what is missing', async () => {
    fakeApi(on('GET', '/admin/lesson-audio', json(LISTING)));
    location.hash = '#/audio/stories?show=missing';
    renderUi(<AudioStudio />);
    expect(screen.getByRole('heading', { level: 1, name: 'Record story sentences' })).toBeInTheDocument();
    await waitFor(() => expect(rowTexts()).toEqual(['Dayika min şorbe çêdike', 'Qelema min şîn e']));
    // the counts are the stories' own
    expect(screen.getByText('1 of 3 recorded')).toBeInTheDocument();
    const tabs = screen.getByRole('tablist', { name: 'What to record' });
    expect(within(tabs).getByRole('tab', { name: 'Story sentences' })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs).getByRole('tab', { name: 'Lesson sentences' })).toHaveAttribute('href', '#/audio/lessons');
  });

  it('opens on one story from its Record link, and offers the way back to every story', async () => {
    fakeApi(on('GET', '/admin/lesson-audio', json(LISTING)));
    location.hash = '#/audio/stories?story=st-1';
    renderUi(<AudioStudio />);
    await waitFor(() => expect(screen.getByText('Only “Şorbeya Nîskê”')).toBeInTheDocument());
    expect(rowTexts()).toEqual(['Dayika min şorbe çêdike']);
    expect(screen.getByRole('link', { name: 'Show every story' })).toHaveAttribute('href', '#/audio/stories');
  });

  it('walks the missing sentences: record, stop, listen back, save, and the next comes up', async () => {
    const user = userEvent.setup();
    const api = fakeApi(
      on('GET', '/admin/lesson-audio', json(LISTING)),
      on('PUT', /^\/admin\/lesson-audio\?text=/, json({ key: 'spas', url: 'https://cdn.test/spas.wav', durationMs: 1200, updatedAt: '2026-10-13T10:00:00.000Z' })),
    );
    location.hash = '#/audio/lessons';
    renderUi(<AudioStudio />);
    await waitFor(() => expect(rowTexts()).toEqual(['Spas']));
    await user.click(screen.getByRole('button', { name: 'Record next missing' }));
    const studio = screen.getByRole('group', { name: 'Record “Spas”' });
    await user.click(within(studio).getByRole('button', { name: 'Record' }));
    await user.click(await within(studio).findByRole('button', { name: 'Stop' }));
    await user.click(await within(studio).findByRole('button', { name: 'Save' }));
    // with who says it; a take this browser cannot decode, and whose length is unknown, goes up without a timeline
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT' && c.path === '/admin/lesson-audio?text=Spas&speaker=hevalo')).toBe(true));
    // nothing else is missing on the lessons' side
    expect(await screen.findByText('That was the last one: everything here is recorded.')).toBeInTheDocument();
  });

  it('remembers the side used last when the address names none', async () => {
    fakeApi(on('GET', '/admin/lesson-audio', json(LISTING)), on('GET', '/admin/alphabet/audio', json({ recordings: [] })));
    localStorage.setItem('kurda_admin_audio_tab', 'stories');
    location.hash = '#/audio';
    renderUi(<AudioStudio />);
    await waitFor(() => expect(location.hash).toBe('#/audio/stories'));
  });

  it('asks before removing a recording, in a dialog rather than the browser’s', async () => {
    const user = userEvent.setup();
    const api = fakeApi(on('GET', '/admin/lesson-audio', json(LISTING)), on('DELETE', /^\/admin\/lesson-audio\?key=silav/, json({ ok: true })));
    location.hash = '#/audio/lessons?show=recorded';
    renderUi(<AudioStudio />);
    await user.click(await screen.findByRole('button', { name: /^Silav/ }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Remove the recording of “Silav”?' });
    expect(dialog).toHaveTextContent('The exercises that use it go without a recording until a new one is saved.');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'DELETE')).toBe(true));
  });
});

describe('who says each recording', () => {
  const saidBy = (speaker: Item['speaker']): Listing => ({
    ...LISTING,
    items: LISTING.items.map((i) => (i.key === 'silav' ? { ...i, speaker, hasLipsync: false } : i)),
  });
  const SAVED = { key: 'spas', url: 'https://cdn.test/spas.wav', durationMs: 1200, updatedAt: '2026-10-13T10:00:00.000Z', speaker: 'xezo', lipsync: null };
  const lipsyncOf = (call: Call | undefined) => {
    const raw = new URLSearchParams(call!.path.split('?')[1]).get('lipsync');
    return raw === null ? null : decodeLipsync(JSON.parse(raw));
  };

  async function recordSpas(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    const studio = screen.getByRole('group', { name: 'Record “Spas”' });
    await user.click(within(studio).getByRole('button', { name: 'Record' }));
    await user.click(await within(studio).findByRole('button', { name: 'Stop' }));
    await user.click(await within(studio).findByRole('button', { name: 'Save' }));
  }

  it('sends a new recording up with the character picked for it, and keeps the pick for the next one', async () => {
    const user = userEvent.setup();
    const api = fakeApi(on('GET', '/admin/lesson-audio', json(LISTING)), on('PUT', /^\/admin\/lesson-audio\?text=Spas&/, json(SAVED)));
    location.hash = '#/audio/lessons';
    renderUi(<AudioStudio />);
    await user.click(await screen.findByRole('button', { name: /^Spas/ }));
    const picker = screen.getByRole('radiogroup', { name: 'Who says it' });
    // Hevalo, until the editor has picked someone
    expect(within(picker).getByRole('radio', { name: 'Hevalo' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(picker).getByRole('radio', { name: 'Xezo' }));
    expect(localStorage.getItem('kurda_admin_speaker')).toBe('xezo');
    await recordSpas(user);
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(api.calls.find((c) => c.method === 'PUT')!.path).toBe('/admin/lesson-audio?text=Spas&speaker=xezo');
    // nothing was recorded to change
    expect(api.calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('changes who says a saved recording at once, before the server has answered', async () => {
    const user = userEvent.setup();
    const api = fakeApi(on('GET', '/admin/lesson-audio', json(saidBy('hevalo'))), on('PATCH', '/admin/audio/lesson?key=silav', json({ speaker: 'hamo', lipsync: null })));
    // the server takes its time
    let answer = (): void => {};
    const held = new Promise<void>((resolve) => (answer = resolve));
    const served = fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init: RequestInit = {}) => {
        if (init.method === 'PATCH') await held;
        return served(input, init);
      }),
    );
    location.hash = '#/audio/lessons?show=recorded';
    renderUi(<AudioStudio />);
    expect(await screen.findByRole('img', { name: 'Said by Hevalo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Silav/ }));
    expect(screen.getByRole('button', { name: 'Play with Hevalo' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Hamo' }));
    expect(screen.getByRole('radio', { name: 'Hamo' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('img', { name: 'Said by Hamo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play with Hamo' })).toBeInTheDocument();
    answer();
    await waitFor(() => expect(api.calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ speaker: 'hamo' }]));
    // a change to a saved recording is not a pick for the next new one
    expect(localStorage.getItem('kurda_admin_speaker')).toBeNull();
  });

  it('puts the choice back, and says so, when the server refuses it', async () => {
    const user = userEvent.setup();
    fakeApi(on('GET', '/admin/lesson-audio', json(saidBy('hevalo'))), on('PATCH', /^\/admin\/audio\/lesson\?key=silav/, failure(500, 'INTERNAL', 'boom')));
    location.hash = '#/audio/lessons?show=recorded';
    renderUi(<AudioStudio />);
    await user.click(await screen.findByRole('button', { name: /^Silav/ }));
    await user.click(screen.getByRole('radio', { name: 'None' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Hevalo' })).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('img', { name: 'Said by Hevalo' })).toBeInTheDocument();
    expect(await screen.findByText(/Who says “Silav” was not changed\./)).toBeInTheDocument();
  });

  it('makes the mouth timeline from the take and sends it with it', async () => {
    const user = userEvent.setup();
    take.wav = encodeWav(speechPcm(1.2));
    const { decoded } = fakeDecoder({ seconds: 1.2 });
    const api = fakeApi(on('GET', '/admin/lesson-audio', json(LISTING)), on('PUT', /^\/admin\/lesson-audio\?text=Spas&/, json({ ...SAVED, speaker: 'hevalo' })));
    location.hash = '#/audio/lessons';
    renderUi(<AudioStudio />);
    await user.click(await screen.findByRole('button', { name: /^Spas/ }));
    await recordSpas(user);
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = api.calls.find((c) => c.method === 'PUT');
    expect(put!.path).toMatch(/^\/admin\/lesson-audio\?text=Spas&speaker=hevalo&lipsync=/);
    expect(decoded).toHaveLength(1);
    const timeline = lipsyncOf(put)!;
    expect(timeline.durationMs).toBe(1200);
    expect(timeline.cues.some((c) => c.viseme !== 'rest')).toBe(true);
  });

  it('times the take from its words when the browser cannot decode it', async () => {
    const user = userEvent.setup();
    take.wav = encodeWav(speechPcm(0.8));
    fakeDecoder({ fail: true });
    const api = fakeApi(on('GET', '/admin/lesson-audio', json(LISTING)), on('PUT', /^\/admin\/lesson-audio\?text=Spas&/, json(SAVED)));
    location.hash = '#/audio/lessons';
    renderUi(<AudioStudio />);
    await user.click(await screen.findByRole('button', { name: /^Spas/ }));
    await recordSpas(user);
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true));
    const timeline = lipsyncOf(api.calls.find((c) => c.method === 'PUT'))!;
    // the length of the WAV, read from its header, with the words spread over it
    expect(timeline.durationMs).toBe(800);
    expect(timeline.cues.map((c) => c.viseme)).toContain('a');
  });

  it('reads the stored timelines only when an opened recording needs one, once, and previews with them', async () => {
    const user = userEvent.setup();
    const STORED = { v: 1, d: 900, k: [[0, 0], [90, 5], [500, 0]] };
    const listed: Listing = {
      ...LISTING,
      items: LISTING.items.map((i) => (i.key === 'silav' ? { ...i, speaker: 'hevalo', hasLipsync: true } : i)),
    };
    const api = fakeApi(
      on('GET', '/admin/lesson-audio', json(listed)),
      on('GET', '/admin/lesson-audio?withLipsync=1', json({ ...listed, items: listed.items.map((i) => ({ ...i, lipsync: i.key === 'silav' ? STORED : null })) })),
    );
    location.hash = '#/audio/lessons?show=recorded';
    renderUi(<AudioStudio />);
    await user.click(await screen.findByRole('button', { name: /^Silav/ }));
    await waitFor(() => expect(api.calls.filter((c) => c.path === '/admin/lesson-audio?withLipsync=1')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Play with Hevalo' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/timed from the words/)).toBeNull());
    await user.click(screen.getByRole('button', { name: /^Silav/ }));
    await user.click(screen.getByRole('button', { name: /^Silav/ }));
    expect(api.calls.filter((c) => c.path.includes('withLipsync'))).toHaveLength(1);
  });

  it('asks for no timelines when the opened recording has none, and says the mouth follows the words', async () => {
    const user = userEvent.setup();
    const api = fakeApi(on('GET', '/admin/lesson-audio', json(saidBy('hamo'))));
    location.hash = '#/audio/lessons?show=recorded';
    renderUi(<AudioStudio />);
    await user.click(await screen.findByRole('button', { name: /^Silav/ }));
    expect(screen.getByText('No timeline yet: the mouth is timed from the words.')).toBeInTheDocument();
    expect(api.calls.map((c) => c.path)).toEqual(['/admin/lesson-audio']);
  });

  it('previews an alphabet sound with the timeline its list carries', async () => {
    const user = userEvent.setup();
    fakeApi(
      on(
        'GET',
        '/admin/alphabet/audio',
        json({
          recordings: [
            { key: 'kmr:sound:a', url: 'https://cdn.test/a.wav', durationMs: 900, updatedAt: '2026-10-01T10:00:00.000Z', speaker: 'xezo', hasLipsync: true, lipsync: { v: 1, d: 900, k: [[0, 0], [90, 5], [500, 0]] } },
          ],
        }),
      ),
    );
    location.hash = '#/audio/letters?show=recorded';
    renderUi(<AudioStudio />);
    await user.click(await screen.findByRole('button', { name: /^a/ }));
    const studio = screen.getByRole('complementary', { name: 'Record this sound' });
    expect(within(studio).getByRole('button', { name: 'Play with Xezo' })).toBeInTheDocument();
    expect(within(studio).queryByText(/timed from the words/)).toBeNull();
  });

  it('sends an alphabet sound up with its character and a timeline read in its own script', async () => {
    const user = userEvent.setup();
    take.wav = encodeWav(speechPcm(0.9));
    fakeDecoder({ seconds: 0.9 });
    const api = fakeApi(
      on('GET', '/admin/alphabet/audio', json({ recordings: [] })),
      on('PUT', /^\/admin\/alphabet\/audio\?key=/, json({ key: 'kmr:sound:a', url: 'https://cdn.test/a.wav', durationMs: 900, speaker: 'hamo', lipsync: null })),
    );
    location.hash = '#/audio/letters';
    renderUi(<AudioStudio />);
    const studio = await screen.findByRole('complementary', { name: 'Record this sound' });
    await user.click(within(studio).getByRole('radio', { name: 'Hamo' }));
    await user.click(within(studio).getByRole('button', { name: 'Record' }));
    await user.click(await within(studio).findByRole('button', { name: 'Stop' }));
    await user.click(await within(studio).findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = api.calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toMatch(/^\/admin\/alphabet\/audio\?key=kmr%3Asound%3Aa&speaker=hamo&lipsync=/);
    expect(lipsyncOf(put)!.durationMs).toBe(900);
  });

  it('records the colours, numbers, days and months in groups of their own, and says which have no sound yet', async () => {
    const user = userEvent.setup();
    fakeApi(on('GET', '/admin/alphabet/audio', json({ recordings: [] })));
    location.hash = '#/audio/letters';
    renderUi(<AudioStudio />);
    for (const title of ['Colours', 'Numbers', 'Days of the week', 'Months']) expect(await screen.findByText(title)).toBeInTheDocument();

    // a word is said as it is written, with what it is beside it, and plays in the synthesised voice until recorded
    await user.click(screen.getByRole('button', { name: /^Duşem/ }));
    let studio = screen.getByRole('complementary', { name: 'Record this sound' });
    expect(within(studio).getByText('Days of the week')).toBeInTheDocument();
    expect(within(studio).getByText('Monday')).toBeInTheDocument();
    expect(within(studio).getByText('Synthesised voice')).toBeInTheDocument();
    expect(within(studio).queryByText(/for the letter/)).toBeNull();

    // one no voice could say accurately has no sound at all until it is recorded
    await user.click(screen.getByRole('button', { name: /^خۆڵەمێشی/ }));
    studio = screen.getByRole('complementary', { name: 'Record this sound' });
    expect(within(studio).getByText('No sound yet')).toBeInTheDocument();
    expect(within(studio).getByText('xołemêşî — the colour grey')).toBeInTheDocument();
  });
});
