// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** expo-audio's player, as the phone path makes it */
const phone = vi.hoisted(() => ({
  made: [] as Array<{ uri: string; calls: string[]; status: ((s: { playing: boolean; error: string | null }) => void) | null; removed: boolean }>,
}));

vi.mock('react-native', () => import('react-native-web'));
vi.mock('expo-audio', () => ({
  createAudioPlayer: ({ uri }: { uri: string }) => {
    const made = { uri, calls: [] as string[], status: null as never, removed: false };
    phone.made.push(made);
    return {
      currentTime: 0.25,
      duration: 1.5,
      playing: false,
      addListener: (_event: string, listener: never) => {
        made.status = listener;
        return { remove: () => made.calls.push('unsubscribe') };
      },
      setPlaybackRate: (rate: number) => made.calls.push(`rate ${rate}`),
      seekTo: async (s: number) => {
        made.calls.push(`seek ${s}`);
      },
      play: () => made.calls.push('play'),
      remove: () => {
        made.removed = true;
      },
    };
  },
}));

import { act, cleanup, render } from '@testing-library/react';
import { Platform } from 'react-native';
import { FakeAudio } from '../characters/testing/audio';
import { useAudio, type AudioControls } from './useAudio';

let controls: AudioControls;
function Probe({ url }: { url?: string }): null {
  controls = useAudio(url);
  return null;
}

const os = Platform.OS;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
});

describe('useAudio in a browser', () => {
  beforeEach(() => {
    FakeAudio.made = [];
    vi.stubGlobal('Audio', FakeAudio);
  });

  it('hands out the element as the clock, and says when it plays', async () => {
    render(<Probe url="https://media.test/a.wav" />);
    await act(async () => undefined);
    const el = FakeAudio.of('https://media.test/a.wav')!;
    el.load(2);
    el.currentTime = 0.5;
    expect(controls.clock).toMatchObject({ currentTime: 0.5, duration: 2, playing: false });
    // which recording the clock is, for a screen with one player and many sounds
    expect(controls.source).toBe('https://media.test/a.wav');

    act(() => controls.play(0.75));
    expect(el.playbackRate).toBe(0.75);
    expect(controls.playing).toBe(true);
    expect(controls.clock?.playing).toBe(true);

    act(() => el.finish());
    expect(controls.playing).toBe(false);
  });
});

describe('useAudio on a phone', () => {
  beforeEach(() => {
    phone.made = [];
    vi.stubGlobal('Audio', undefined);
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  });

  it('plays through expo-audio, whose player is the clock', async () => {
    const view = render(<Probe url="https://media.test/b.wav" />);
    expect(controls.supported).toBe(true);
    await act(async () => undefined);
    const made = phone.made[0]!;
    expect(made.uri).toBe('https://media.test/b.wav');
    expect(controls.clock).toMatchObject({ currentTime: 0.25, duration: 1.5 });

    act(() => controls.play(1));
    expect(made.calls).toEqual(['rate 1', 'seek 0', 'play']);
    act(() => made.status?.({ playing: true, error: null }));
    expect(controls.playing).toBe(true);

    view.unmount();
    expect(made.calls).toContain('unsubscribe');
    expect(made.removed).toBe(true);
  });

  /** another recording asked for: the last one goes, and the clock and its source are the new one's */
  it('lets the last recording go when asked for another', async () => {
    const view = render(<Probe url="https://media.test/e.wav" />);
    await act(async () => undefined);
    expect(controls.source).toBe('https://media.test/e.wav');
    view.rerender(<Probe url="https://media.test/f.wav" />);
    expect(phone.made[0]!.removed).toBe(true);
    await act(async () => undefined);
    expect(controls.source).toBe('https://media.test/f.wav');
    expect(phone.made[1]!.uri).toBe('https://media.test/f.wav');
  });

  it('turns a player that cannot load into the error the exercise skips on', async () => {
    render(<Probe url="https://media.test/c.wav" />);
    await act(async () => undefined);
    act(() => phone.made[0]!.status?.({ playing: false, error: 'not found' }));
    expect(controls.error).toBe(true);
  });

  it('lets go of a player that arrives after the screen has gone', async () => {
    const view = render(<Probe url="https://media.test/d.wav" />);
    view.unmount();
    await act(async () => undefined);
    expect(phone.made[0]?.removed ?? true).toBe(true);
  });
});
