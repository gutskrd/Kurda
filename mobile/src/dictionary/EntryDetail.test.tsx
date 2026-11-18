// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
// Android's back, pressed by the test (`pressBack`).
vi.mock('../navigation/hardwareBack', () => import('../navigation/testing/hardwareBack'));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Alert } from 'react-native';
import { encodeLipsync, type DictionaryAudio } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { characterLayers } from '../characters/layers';
import { FakeAudio, fakeFrames, type Frames } from '../characters/testing/audio';
import { pressBack, resetHardwareBack } from '../navigation/testing/hardwareBack';
import { PALETTES } from '../theme/palette';
import { EntryDetail } from './EntryDetail';
import type { Entry } from './types';

function entry(audio: DictionaryAudio[]): Entry {
  return {
    id: 'e1',
    headword: 'mal',
    dialect: 'kurmanji',
    senses: [{ id: 's1', position: 1, pos: 'noun', definitionEn: 'house, home', definitionKu: null, examples: [] }],
    audio,
    xrefs: [],
  };
}

const SAID = encodeLipsync({
  durationMs: 600,
  cues: [
    { startMs: 0, viseme: 'mbp' },
    { startMs: 120, viseme: 'a' },
    { startMs: 400, viseme: 'l' },
  ],
});

let frames: Frames;

beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  FakeAudio.made = [];
  vi.stubGlobal('Audio', FakeAudio);
  frames = fakeFrames();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function open(e: Entry): void {
  testAuth.client = fakeClient({ 'GET /dictionary/entries/e1': ok(e) });
  renderWithProviders(<EntryDetail entryId="e1" onBack={() => undefined} />);
}

describe('a dictionary entry’s pronunciations', () => {
  it('puts the character who says a pronunciation beside its own play button, saying the word with it', async () => {
    open(entry([{ id: 'a1', url: 'https://media.test/mal.wav', dialect: 'kurmanji', speaker: 'hamo', lipsync: SAID }]));
    expect(await screen.findByRole('img', { name: 'Said by Hamo' })).toBeTruthy();
    expect(screen.getByText('Hamo')).toBeTruthy();
    const play = screen.getAllByRole('button', { name: 'Play pronunciation' });
    expect(play).toHaveLength(1);

    fireEvent.click(play[0]!);
    // The player starts on a later tick and may be recreated as the screen settles: seek every one made for the
    // word to 0.2 s and draw frames until the character shows that moment's mouth.
    await waitFor(() => {
      const clips = FakeAudio.made.filter((a) => a.src === 'https://media.test/mal.wav');
      if (clips.length === 0) throw new Error('no player yet');
      for (const clip of clips) clip.currentTime = 0.2;
      act(() => frames.step());
      const drawn = [...document.querySelectorAll('svg[data-markup]')].map((el) => el.getAttribute('data-markup'));
      expect(drawn).toContain(characterLayers('hamo', 'bust').mouths.a);
    });
  });

  it('gives each pronunciation its own row and character, and none to the one nobody was chosen for', async () => {
    open(
      entry([
        { id: 'a1', url: 'https://media.test/mal-1.wav', dialect: 'kurmanji', speaker: 'xezo' },
        { id: 'a2', url: 'https://media.test/mal-2.wav', dialect: 'sorani' },
      ]),
    );
    expect(await screen.findByRole('img', { name: 'Said by Xezo' })).toBeTruthy();
    expect(screen.getAllByRole('img', { name: /^Said by/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Play pronunciation' })).toHaveLength(2);
  });

  it('keeps the one play button by the word, and no character, when nobody says any of them', async () => {
    open(entry([{ id: 'a1', url: 'https://media.test/mal.wav', dialect: 'kurmanji' }]));
    expect(await screen.findByRole('button', { name: 'Play pronunciation' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: /^Said by/ })).toBeNull();
    expect(screen.queryByText('Hamo')).toBeNull();
  });
});

describe('a saved word', () => {
  it('is marked in the violet of what is on, as a bookmarked story is, and in the page’s quiet ink when it is not', async () => {
    testAuth.client = fakeClient({
      'GET /dictionary/entries/e1': ok({ ...entry([]), saved: true }),
      'DELETE /dictionary/entries/e1/save': ok({ saved: false }),
    });
    renderWithProviders(<EntryDetail entryId="e1" onBack={() => undefined} />);
    // The app opens by night until the reader chooses otherwise, and nobody has here.
    const night = PALETTES.dark;
    const mark = (name: string): string | null | undefined => screen.getByRole('button', { name }).querySelector('path')?.getAttribute('fill');
    await waitFor(() => expect(mark('Remove bookmark')).toBe(night.primary));
    fireEvent.click(screen.getByRole('button', { name: 'Remove bookmark' }));
    await waitFor(() => expect(mark('Bookmark word')).toBe(night.textSecondary));
  });
});

describe('saving a word', () => {
  it('shows the bookmark before the server answers, and ends rapid taps on the last one', async () => {
    const answers: ((r: unknown) => void)[] = [];
    const later = () => new Promise((resolve) => answers.push(resolve));
    const client = fakeClient({
      'GET /dictionary/entries/e1': ok(entry([])),
      'PUT /dictionary/entries/e1/save': later,
      'DELETE /dictionary/entries/e1/save': later,
    } as never);
    testAuth.client = client;
    renderWithProviders(<EntryDetail entryId="e1" onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bookmark word' }));
    expect(screen.getByRole('button', { name: 'Remove bookmark' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove bookmark' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bookmark word' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove bookmark' }));
    expect(screen.getByRole('button', { name: 'Bookmark word' })).toBeTruthy();
    const writes = () => client.calls.filter((c) => c.method !== 'GET').map((c) => c.method);
    expect(writes()).toEqual(['PUT']);
    await act(async () => answers[0]!(ok({ saved: true })));
    // The server now has it saved and the last tap did not want it: that is sent next.
    expect(writes()).toEqual(['PUT', 'DELETE']);
    await act(async () => answers[1]!(ok({ saved: false })));
    expect(screen.getByRole('button', { name: 'Bookmark word' })).toBeTruthy();
  });

  it('puts the bookmark back when the server refuses, and says why', async () => {
    const said = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let answer: (r: unknown) => void = () => undefined;
    testAuth.client = fakeClient({
      'GET /dictionary/entries/e1': ok(entry([])),
      'PUT /dictionary/entries/e1/save': () => new Promise((resolve) => (answer = resolve)),
    } as never);
    renderWithProviders(<EntryDetail entryId="e1" onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bookmark word' }));
    expect(screen.getByRole('button', { name: 'Remove bookmark' })).toBeTruthy();
    await act(async () => answer({ ok: false, error: { kind: 'client', status: 403, code: 'LIMIT', message: 'Your vocabulary is full.' } }));
    expect(screen.getByRole('button', { name: 'Bookmark word' })).toBeTruthy();
    expect(said).toHaveBeenCalledWith('Your vocabulary is full.');
    said.mockRestore();
  });
});

/* The entry replaces the results rather than being pushed over them, so Android's back must return to the results. */
describe('a dictionary entry and Android’s back', () => {
  it('goes back to the results, the way its chevron does', async () => {
    resetHardwareBack();
    const onBack = vi.fn();
    testAuth.client = fakeClient({ 'GET /dictionary/entries/e1': ok(entry([])) });
    renderWithProviders(<EntryDetail entryId="e1" onBack={onBack} />);
    expect(await screen.findByText('mal')).toBeTruthy();
    // Taken by the entry, and not left to leave the screen.
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

