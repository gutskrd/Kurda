// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { ConversationRecording } from '../conversations';
import type { Listing } from '../lessonAudio';
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

const rojdaTake = { url: 'https://cdn.test/rojda.wav', durationMs: 1400, updatedAt: '2026-10-22T10:00:00.000Z', speaker: 'xezo', hasLipsync: true, recordedBy: { id: 'u1', username: 'rojda' } };

function recording(azadDone = false): ConversationRecording {
  return {
    lesson: { id: 'l1', titleEn: 'Meeting someone', titleKu: 'Em hevdu nas dikin', status: 'draft', version: 1, skillId: 's1', position: 3, exercisePosition: 3 },
    conversation: {
      id: 'kmrnasin01',
      title: 'Li parkê',
      speakers: [
        { name: 'Xezo', character: 'xezo' },
        { name: 'Hamo', character: 'hamo' },
      ],
      lines: [
        { speaker: 0, text: 'Silav! Navê min Xezo ye.', en: 'Hello! My name is Xezo.' },
        { speaker: 1, text: 'Silav Xezo! Navê min Hamo ye.', en: 'Hi Xezo! My name is Hamo.' },
        { speaker: 0, text: 'Tu çawa yî, Hamo?' },
        { speaker: 1, text: 'Ez baş im, spas.' },
      ],
      prompt: 'Hamo çawa ye?',
      options: ['Baş e', 'Nexweş e'],
      correctIndex: 0,
    },
    lines: [
      { index: 0, part: 0, key: 'k0', recording: rojdaTake as never },
      { index: 1, part: 1, key: 'k1', recording: azadDone ? ({ ...rojdaTake, url: 'https://cdn.test/azad.wav', speaker: 'hamo', recordedBy: { id: 'u2', username: 'azad' } } as never) : null },
      { index: 2, part: 0, key: 'k2', recording: null },
      { index: 3, part: 1, key: 'k3', recording: null },
    ],
  };
}

const PAGE = /^\/admin\/lesson-audio\/conversations\/kmrnasin01/;

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

describe('recording a conversation', () => {
  it('opens on the part its link names, at that part’s first line, with the line before it to hear', async () => {
    fakeApi(on('GET', PAGE, json(recording())));
    location.hash = '#/audio/conversations/kmrnasin01?lesson=l1&part=1';
    renderUi(<AudioStudio />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Li parkê' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Hamo/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Xezo/ })).toHaveTextContent('1 of 2 recorded · by rojda');
    // Hamo's first line is open to record, after Xezo's, which can be heard first
    expect(screen.getByRole('group', { name: 'Record “Silav Xezo! Navê min Hamo ye.”' })).toBeInTheDocument();
    expect(screen.getByText('Before you: Xezo says “Silav! Navê min Xezo ye.”')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hear it first' })).toBeInTheDocument();
    // the other part's line still to record waits for them
    expect(screen.getAllByText('Waiting for Xezo')).toHaveLength(1);
  });

  it('saves a take as this part’s own line, with its character, and moves on to the next of theirs', async () => {
    const user = userEvent.setup();
    let saved = false;
    const api = fakeApi(
      on('GET', PAGE, () => json(recording(saved))),
      on('PUT', /^\/admin\/lesson-audio\?text=/, () => {
        saved = true;
        return json({ key: 'k1', url: 'https://cdn.test/azad.wav', durationMs: 1400, updatedAt: '2026-10-22T10:01:00.000Z' }, 201);
      }),
    );
    location.hash = '#/audio/conversations/kmrnasin01?lesson=l1&part=1';
    renderUi(<AudioStudio />);
    const studio = await screen.findByRole('group', { name: 'Record “Silav Xezo! Navê min Hamo ye.”' });
    await user.click(within(studio).getByRole('button', { name: 'Record' }));
    await user.click(await within(studio).findByRole('button', { name: 'Stop' }));
    await user.click(await within(studio).findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = api.calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toContain(`text=${encodeURIComponent('Silav Xezo! Navê min Hamo ye.')}`);
    expect(put.path).toContain('&line=kmrnasin01%3A1');
    expect(put.path).toContain('speaker=hamo');
    // on to Hamo's next line
    expect(await screen.findByRole('group', { name: 'Record “Ez baş im, spas.”' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Hamo/ })).toHaveTextContent('1 of 2 recorded · by azad');
  });

  it('sends the other person a link to their own part', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    fakeApi(on('GET', PAGE, json(recording())));
    location.hash = '#/audio/conversations/kmrnasin01?lesson=l1&part=1';
    renderUi(<AudioStudio />);
    await user.click(await screen.findByRole('button', { name: 'Send Xezo’s part' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/#\/audio\/conversations\/kmrnasin01\?lesson=l1&part=0$/));
    expect(await screen.findByText('Link to Xezo’s part copied. Send it to whoever records Xezo.')).toBeInTheDocument();
  });

  it('lists every conversation in the lessons, each part with how far it has got', async () => {
    const use = {
      courseId: 'c1',
      courseTitle: 'Kurmanji for Beginners',
      unitId: 'u1',
      unitTitle: 'Basics',
      skillId: 's1',
      skillTitle: 'Introductions',
      lessonPosition: 3,
      lessonId: 'l1',
      lessonTitle: 'Meeting someone',
      lessonStatus: 'draft' as const,
      lessonVersion: 1,
      live: false,
      exerciseTypes: ['conversation' as const],
      listeningNeedsIt: false,
    };
    const listing: Listing = {
      items: [
        { key: 'k0', text: 'Silav!', recorded: true, url: 'https://cdn.test/a.wav', durationMs: 900, updatedAt: null, usedIn: [use], unused: false, line: { conversation: 'kmrnasin01', part: 0, name: 'Xezo', character: 'xezo' } },
        { key: 'k1', text: 'Silav!', recorded: false, url: null, durationMs: null, updatedAt: null, usedIn: [use], unused: false, line: { conversation: 'kmrnasin01', part: 1, name: 'Hamo', character: 'hamo' } },
      ],
      summary: { needed: 2, recorded: 1, missing: 1, unused: 0 },
    };
    fakeApi(on('GET', '/admin/lesson-audio', json(listing)));
    location.hash = '#/audio/conversations';
    renderUi(<AudioStudio />);
    expect(await screen.findByRole('link', { name: 'Meeting someone' })).toHaveAttribute('href', '#/audio/conversations/kmrnasin01?lesson=l1');
    expect(screen.getByRole('link', { name: 'Record Hamo’s part: 0 of 1 lines recorded' })).toHaveAttribute('href', '#/audio/conversations/kmrnasin01?lesson=l1&part=1');
    expect(screen.getByText('1 of 2 lines still to record')).toBeInTheDocument();
  });
});
