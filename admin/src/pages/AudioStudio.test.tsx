// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { Item, Listing, Usage } from '../lessonAudio';
import { fakeApi, json, on } from '../test/fetch';
import { renderUi } from '../test/render';
import { AudioStudio } from './AudioStudio';

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
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT' && c.path === '/admin/lesson-audio?text=Spas')).toBe(true));
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
