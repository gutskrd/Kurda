// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));

/** The page's audio elements, which play nothing in jsdom: each is told what it was asked. */
const played = vi.hoisted(() => ({ els: [] as Array<{ src: string; volume: number; paused: boolean; fire: (type: string) => void }> }));

import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactionTake } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { setSounds } from '../feedback/soundPref';
import { setCharacterVoices } from '../feedback/voicesPref';
import { ReactionCaption } from './ReactionCaption';
import { REACTION_VOLUME, hushReactions, resetReactions, sayReaction } from './reactions';

/* Hevalo’s and Xezal’s recorded reactions on the phone: when one is heard, on what, and its caption. */

const take = (character: 'hevalo' | 'xezo', id: string): ReactionTake => ({ character, id, src: `https://cdn.test/${character}-${id}.wav`, voice: { speaker: character } });
const TAKES = [take('hevalo', 'miss-1'), take('xezo', 'promoted-1')];

class FakeAudio {
  volume = 1;
  currentTime = 0;
  duration = 1;
  paused = true;
  ended = false;
  private readonly on = new Map<string, Array<() => void>>();
  constructor(public src: string) {
    played.els.push(this as never);
    (this as unknown as { fire: (type: string) => void }).fire = (type) => this.on.get(type)?.forEach((cb) => cb());
  }
  addEventListener(type: string, cb: () => void): void {
    this.on.set(type, [...(this.on.get(type) ?? []), cb]);
  }
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
    this.on.get('pause')?.forEach((cb) => cb());
  }
}

beforeEach(() => {
  played.els = [];
  vi.stubGlobal('Audio', FakeAudio);
  resetReactions(TAKES);
  void setSounds(true);
  void setCharacterVoices(true);
});

afterEach(() => {
  cleanup();
  resetReactions();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('sayReaction', () => {
  it('plays a recorded variant a little quieter, in the moment’s own voice, one line at a time', () => {
    expect(sayReaction({ moment: 'promoted' })).toBe(true);
    expect(played.els.map((e) => [e.src, e.volume, e.paused])).toEqual([['https://cdn.test/xezo-promoted-1.wav', REACTION_VOLUME, false]]);
    // another moment waits for this one, and for the gap after it
    expect(sayReaction({ moment: 'miss' })).toBe(false);
    act(() => played.els[0]!.fire('ended'));
    expect(sayReaction({ moment: 'miss' })).toBe(false);
  });

  it('says nothing with no take recorded, with Character voices or Sounds off, or while a lesson is hushed', () => {
    expect(sayReaction({ moment: 'perfect' })).toBe(false);
    void setCharacterVoices(false);
    expect(sayReaction({ moment: 'miss' })).toBe(false);
    void setCharacterVoices(true);
    void setSounds(false);
    expect(sayReaction({ moment: 'miss' })).toBe(false);
    void setSounds(true);
    hushReactions(true);
    expect(sayReaction({ moment: 'miss' })).toBe(false);
    hushReactions(false);
    expect(sayReaction({ moment: 'miss' })).toBe(true);
    expect(played.els).toHaveLength(1);
  });

  it('stops the line when the lesson is hushed while it plays', () => {
    sayReaction({ moment: 'miss' });
    hushReactions(true);
    expect(played.els[0]!.paused).toBe(true);
  });
});

describe('the caption', () => {
  it('shows the line with the speaker’s face when nobody is drawn, and what it means on a tap', async () => {
    renderWithProviders(<ReactionCaption />);
    act(() => void sayReaction({ moment: 'promoted' }));
    const caption = await screen.findByRole('button', { name: 'Xezal says “Pîroz be!”' });
    expect(screen.getByText('Pîroz be!')).toBeTruthy();
    expect(screen.queryByText('Congratulations!')).toBeNull();
    fireEvent.click(caption);
    expect(await screen.findByText('Congratulations!')).toBeTruthy();
    expect(screen.getByTestId('reaction-caption-face')).toBeTruthy();
  });

  it('leaves the face out when the character says it on screen', async () => {
    renderWithProviders(<ReactionCaption />);
    act(() => void sayReaction({ moment: 'miss', character: 'hevalo', drawn: true }));
    await screen.findByRole('button', { name: 'Hevalo says “Ne xem e!”' });
    expect(screen.queryByTestId('reaction-caption-face')).toBeNull();
  });
});
