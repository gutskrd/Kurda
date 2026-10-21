// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { encodeLipsync, type DictionaryAudio } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { characterLayers } from '../characters/layers';
import { FakeAudio, fakeFrames, type Frames } from '../characters/testing/audio';
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
    // the player starts on a later turn of the event loop, and the screen may
    // make it afresh as it settles: put every one made for the word at 0.2 s
    // and draw a frame until the character shows that moment's mouth
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
