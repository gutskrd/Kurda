// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { BLINK_MS, type LipsyncData } from '@kurda/shared';
import { renderUi } from '../test/render';
import { SpeakingPreview } from './SpeakingPreview';

// rest from 0, the open a from 100 ms, the lips pressed from 300 ms, rest from 600 ms
const TIMELINE: LipsyncData = { v: 1, d: 1000, k: [[0, 0], [100, 5], [300, 1], [600, 0]] };

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;

/** One animation frame at `now` ms: every callback asked for since the last. */
function frame(now: number): void {
  const due = [...frames.values()];
  frames = new Map();
  act(() => due.forEach((cb) => cb(now)));
}

beforeEach(() => {
  frames = new Map();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      frames.set(nextFrame, cb);
      return nextFrame++;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      frames.delete(id);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

/** The preview's audio element, its clock moved by hand. */
function clock(container: HTMLElement): { audio: HTMLAudioElement; at: (seconds: number) => void } {
  const audio = container.querySelector('audio')!;
  let t = 0;
  Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => t, set: (v: number) => (t = v) });
  return { audio, at: (seconds) => (t = seconds) };
}

/** The mouths drawn, and which of them shows. */
function shownMouths(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-mouth]')].filter((m) => m.getAttribute('display') !== 'none').map((m) => m.getAttribute('data-mouth')!);
}

const head = (container: HTMLElement): Element => container.querySelector('[data-head]')!;

describe('the speaking preview', () => {
  it('draws all ten mouths and shows the one the recording is at, moving with currentTime', async () => {
    const user = userEvent.setup();
    const { container } = renderUi(<SpeakingPreview speaker="hamo" url="https://media.test/silav.wav" text="Silav" lipsync={TIMELINE} durationMs={1000} />);
    const { audio, at } = clock(container);
    expect(container.querySelectorAll('[data-mouth]')).toHaveLength(10);
    frame(0);
    expect(shownMouths(container)).toEqual(['rest']);

    await user.click(screen.getByRole('button', { name: 'Play with Hamo' }));
    act(() => void audio.dispatchEvent(new Event('play')));
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();

    at(0.15);
    frame(16);
    expect(shownMouths(container)).toEqual(['a']);
    at(0.35);
    frame(32);
    expect(shownMouths(container)).toEqual(['mbp']);
    // a small nod while the words come, about the neck
    expect(head(container).getAttribute('transform')).toMatch(/^rotate\(-?\d/);

    act(() => void audio.dispatchEvent(new Event('pause')));
    frame(48);
    expect(shownMouths(container)).toEqual(['rest']);
    expect(head(container).hasAttribute('transform')).toBe(false);
    // with a stored timeline there is nothing to explain
    expect(screen.queryByText(/timed from the words/)).toBeNull();
  });

  it('keeps the head still when less motion is asked for, and the mouth still moves', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }),
    });
    const { container } = renderUi(<SpeakingPreview speaker="xezo" url="https://media.test/silav.wav" text="Silav" lipsync={TIMELINE} durationMs={1000} />);
    const { audio, at } = clock(container);
    act(() => void audio.dispatchEvent(new Event('play')));
    for (const [t, now] of [
      [0.15, 0],
      [0.35, 16],
      [0.5, 32],
    ] as const) {
      at(t);
      frame(now);
      expect(head(container).hasAttribute('transform')).toBe(false);
    }
    expect(shownMouths(container)).toEqual(['mbp']);
  });

  it('blinks now and then while it is on screen', () => {
    const { container } = renderUi(<SpeakingPreview speaker="hevalo" url="https://media.test/a.wav" text="a" />);
    // a timeline not known here is not said to be missing
    expect(screen.queryByText(/timed from the words/)).toBeNull();
    const shut = (): boolean => container.querySelector('[data-eyes="closed"]')!.getAttribute('display') !== 'none';
    frame(0);
    expect(shut()).toBe(false);
    // the first blink ends the first gap, 3.2 s in
    frame(3200 - BLINK_MS / 2);
    expect(shut()).toBe(true);
    expect(container.querySelector('[data-eyes="open"]')!.getAttribute('display')).toBe('none');
    frame(3300);
    expect(shut()).toBe(false);
  });

  it('times the mouth from the words when no timeline is stored, once the recording’s length is known', () => {
    const { container } = renderUi(<SpeakingPreview speaker="hamo" url="https://media.test/silav.wav" text="Silav" lipsync={null} />);
    const { audio, at } = clock(container);
    expect(screen.getByText('No timeline yet: the mouth is timed from the words.')).toBeInTheDocument();
    Object.defineProperty(audio, 'duration', { configurable: true, value: 1.2 });
    act(() => {
      audio.dispatchEvent(new Event('loadedmetadata'));
      audio.dispatchEvent(new Event('play'));
    });
    const seen = new Set<string>();
    for (let ms = 0; ms < 1200; ms += 40) {
      at(ms / 1000);
      frame(ms);
      seen.add(shownMouths(container)[0]!);
    }
    expect([...seen].filter((m) => m !== 'rest').length).toBeGreaterThan(1);
  });

  it('stops the frame loop and the sound when it goes', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const { unmount } = renderUi(<SpeakingPreview speaker="hamo" url="https://media.test/silav.wav" text="Silav" lipsync={TIMELINE} />);
    frame(0);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
  });
});
