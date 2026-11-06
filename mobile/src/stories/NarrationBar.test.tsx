// @vitest-environment jsdom
import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoryNarration } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { onHaptic } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { Narrator, narrationTrack, type NarrationState, type PlayerLike, type PlayerStatus } from './narration';
import { NarrationBar, lineTime, rateLabel } from './NarrationBar';
import type { NarrationRate } from './prefs';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
// the bar's position hook lives beside the phone's player; nothing here plays
vi.mock('expo-audio', () => ({ createAudioPlayer: () => ({}) }));

patchReactNativeWeb({ reduceMotion: true });

const narration: StoryNarration = {
  sentences: [
    { paragraph: 0, sentence: 0, key: 'k1', url: 'a.m4a', durationMs: 2000, startMs: 0 },
    { paragraph: 0, sentence: 1, key: 'k2', url: 'b.m4a', durationMs: 3000, startMs: 2000 },
    { paragraph: 1, sentence: 0, key: 'k3', url: 'c.m4a', durationMs: 60_000, startMs: 5000 },
  ],
  totalMs: 65_000,
  complete: false,
};

function fakePlayer() {
  const log: string[] = [];
  let status: (s: PlayerStatus) => void = () => undefined;
  const clock = { currentTime: 0, duration: 0, playing: false };
  const player: PlayerLike = {
    load: (url) => {
      clock.currentTime = 0;
      log.push(`load ${url}`);
    },
    play: () => log.push('play'),
    pause: () => log.push('pause'),
    seek: (seconds) => {
      clock.currentTime = seconds;
      log.push(`seek ${seconds}`);
    },
    setRate: (r) => log.push(`rate ${r}`),
    onEnded: () => () => undefined,
    onStatus: (l) => {
      status = l;
      return () => undefined;
    },
    release: () => log.push('release'),
    clock,
  };
  return { player, log, clock, report: (s: PlayerStatus) => status(s) };
}

/** Each narrator's way of telling its bar about a change, as useNarration wires it. */
const listeners = new Map<Narrator, (s: NarrationState) => void>();

/** The bar with a live narrator behind it, the way the reader mounts it. */
function Harness({ narrator, rate, onRate, speaker }: { narrator: Narrator; rate: NarrationRate; onRate: (r: NarrationRate) => void; speaker: string | null }) {
  const [state, setState] = useState<NarrationState>(narrator.state);
  useEffect(() => {
    listeners.set(narrator, setState);
    return () => {
      listeners.delete(narrator);
    };
  }, [narrator]);
  return <NarrationBar narrator={narrator} state={state} items={narrationTrack(narration)} rate={rate} onRate={onRate} speaker={speaker} recorded={{ recorded: 3, total: 5 }} />;
}

function mount(rate: NarrationRate = 1, onRate = vi.fn(), speaker: string | null = null) {
  const f = fakePlayer();
  const narrator: Narrator = new Narrator(
    () => f.player,
    (s) => listeners.get(narrator)?.(s),
  );
  renderWithProviders(<Harness narrator={narrator} rate={rate} onRate={onRate} speaker={speaker} />);
  return { f, narrator, onRate };
}

describe('rateLabel', () => {
  it('writes the speed with the times sign', () => {
    expect(rateLabel(0.75)).toBe('0.75×');
    expect(rateLabel(1)).toBe('1×');
    expect(rateLabel(1.25)).toBe('1.25×');
  });
});

describe('lineTime', () => {
  it('reads a tap on the line as a point on the track, from the screen and the line’s place on it', () => {
    // a line 300 wide starting 40 in, over a story of a minute
    expect(lineTime(40 + 225, 40, 300, 60_000)).toBe(45_000);
    expect(lineTime(40, 40, 300, 60_000)).toBe(0);
    // a finger a little past either end is that end
    expect(lineTime(10, 40, 300, 60_000)).toBe(0);
    expect(lineTime(400, 40, 300, 60_000)).toBe(60_000);
    // nothing to read yet: no line measured, no story, no point
    expect(lineTime(100, 40, 0, 60_000)).toBeNull();
    expect(lineTime(100, 40, 300, 0)).toBeNull();
    expect(lineTime(Number.NaN, 40, 300, 60_000)).toBeNull();
  });
});

describe('NarrationBar', () => {
  afterEach(cleanup);

  it('plays the whole story from its button, says where it is, and times the stitched track', async () => {
    const { f, narrator } = mount();
    expect(screen.getByText('The whole story')).toBeTruthy();
    expect(screen.getAllByText('0:00')).toHaveLength(1);
    expect(screen.getByText('1:05')).toBeTruthy();
    expect(screen.getByText('3 of 5 sentences recorded')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Listen to the whole story' }));
    expect(f.log).toContain('load a.m4a');
    expect(await screen.findByText('Sentence 1 of 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    // the sound moves on; the line reads where it is from the track
    act(() => narrator.next());
    expect(await screen.findByText('Sentence 2 of 3')).toBeTruthy();
    expect(screen.getByText('0:02')).toBeTruthy();
    expect(screen.getByLabelText('Position in the story').getAttribute('aria-valuenow')).toBe('2000');
    expect(screen.getByLabelText('Position in the story').getAttribute('aria-valuetext')).toBe('0:02 of 1:05');
  });

  it('follows a seek into another sentence, and the line with it', async () => {
    const { f, narrator } = mount();
    act(() => narrator.play(narrationTrack(narration), 'story'));
    f.log.length = 0;
    act(() => narrator.seek(10_000));
    expect(f.log).toEqual(['load c.m4a', 'rate 1', 'seek 5', 'play']);
    expect(await screen.findByText('Sentence 3 of 3')).toBeTruthy();
    expect(screen.getByText('0:10')).toBeTruthy();
  });

  it('goes on from inside the sentence it was stopped in, and shows that place on the line meanwhile', async () => {
    const { f, narrator } = mount();
    act(() => narrator.play(narrationTrack(narration), 'story', 2));
    f.clock.currentTime = 4;
    act(() => narrator.stop());
    expect(await screen.findByText('0:09')).toBeTruthy();
    expect(screen.getByLabelText('Position in the story').getAttribute('aria-valuenow')).toBe('9000');
    f.log.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Listen to the whole story' }));
    expect(f.log).toEqual(['load c.m4a', 'rate 1', 'play', 'seek 4', 'play']);
    expect(await screen.findByText('Sentence 3 of 3')).toBeTruthy();
  });

  it('cycles the speed with a tick, and names who reads', () => {
    const felt: HapticEvent[] = [];
    const stop = onHaptic((event) => felt.push(event));
    const { onRate } = mount(1, vi.fn(), 'Hamo');
    expect(screen.getByText('Read by Hamo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Speed: 1×' }));
    expect(onRate).toHaveBeenCalledWith(1.25);
    expect(felt).toEqual(['select']);
    stop();
  });

  it('shows the wait for sound in the play button, and says when a part would not play', async () => {
    const { f, narrator } = mount();
    act(() => narrator.play(narrationTrack(narration), 'story'));
    act(() => f.report({ buffering: true, error: false }));
    expect(await screen.findByLabelText('Loading…')).toBeTruthy();
    act(() => f.report({ buffering: false, error: true }));
    expect(await screen.findByText('This part couldn’t play. Try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Listen to the whole story' })).toBeTruthy();
  });
});
