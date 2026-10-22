import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { encodeLipsync, visemeAt, voiceTimeline, type LipsyncTimeline, type RecordingVoice } from '@kurda/shared';
import { I18nProvider } from '../i18n/I18nProvider';
import { SpeakingCharacter, type SpeakingCharacterProps } from './SpeakingCharacter';

/*
 * The speaking face against a fake <audio> and a frame loop the test turns by
 * hand: what it shows is read straight off the drawing's groups, which is
 * all a viewer sees.
 */

const CLIP = 'https://cdn.test/silav.m4a';

/** An <audio> that does only what the face reads: where it is, whether it plays, how long it is, and its events. */
class FakeMedia extends EventTarget {
  src = '';
  currentTime = 0;
  paused = true;
  ended = false;
  duration = Number.NaN;
  readyState = 0;
  /** start playing `src` at `seconds` */
  start(src = CLIP, seconds = 0): void {
    this.src = src;
    this.currentTime = seconds;
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    this.dispatchEvent(new Event('playing'));
  }
  stop(): void {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}

const TIMELINE: LipsyncTimeline = {
  durationMs: 900,
  cues: [
    { startMs: 0, viseme: 'rest' },
    { startMs: 100, viseme: 'mbp' },
    { startMs: 200, viseme: 'a' },
    { startMs: 600, viseme: 'rest' },
  ],
};
const SAVED: RecordingVoice = { speaker: 'hamo', lipsync: encodeLipsync(TIMELINE) };

// a frame loop turned by hand
let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
let clock = 1000;
function step(): void {
  const run = [...frames.values()];
  frames = new Map();
  act(() => run.forEach((cb) => cb(clock)));
}

beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function face(media: FakeMedia, props: Partial<SpeakingCharacterProps> = {}): { root: HTMLElement; unmount: () => void } {
  const { container, unmount } = render(
    <I18nProvider>
      <SpeakingCharacter speaker="hamo" audio={media as unknown as HTMLAudioElement} src={CLIP} voice={SAVED} {...props} />
    </I18nProvider>,
  );
  return { root: container.querySelector<HTMLElement>('.speaking-character')!, unmount };
}

/** The one mouth on show. */
function mouth(root: HTMLElement): string {
  const shown = [...root.querySelectorAll('[data-mouth]')].filter((g) => !g.hasAttribute('visibility'));
  expect(shown).toHaveLength(1);
  return shown[0]!.getAttribute('data-mouth')!;
}

const at = (media: FakeMedia, seconds: number): void => {
  media.currentTime = seconds;
  step();
};

describe('SpeakingCharacter', () => {
  it('draws every mouth and both eyes once, showing the resting mouth and open eyes', () => {
    const { root } = face(new FakeMedia());
    expect(root.querySelectorAll('svg')).toHaveLength(1);
    expect(root.querySelectorAll('[data-mouth]')).toHaveLength(10);
    expect(mouth(root)).toBe('rest');
    expect(root.querySelector('[data-eyes="open"]')).not.toHaveAttribute('visibility');
    expect(root.querySelector('[data-eyes="closed"]')).toHaveAttribute('visibility', 'hidden');
  });

  it('moves its mouth with the saved timeline as the recording plays, and rests when it stops', () => {
    const media = new FakeMedia();
    const { root } = face(media);
    act(() => media.start());
    at(media, 0.15);
    expect(mouth(root)).toBe('mbp');
    at(media, 0.3);
    expect(mouth(root)).toBe('a');
    at(media, 0.7);
    expect(mouth(root)).toBe('rest');
    at(media, 0.25);
    act(() => media.stop());
    step();
    expect(mouth(root)).toBe('rest');
  });

  it('makes a timeline from the words once the recording’s length is known', () => {
    const media = new FakeMedia();
    const voice: RecordingVoice = { speaker: 'xezo' };
    const { root } = face(media, { speaker: 'xezo', voice, text: 'Rojbaş' });
    media.src = CLIP;
    media.duration = 1.2;
    media.readyState = 1;
    act(() => media.dispatchEvent(new Event('loadedmetadata')));
    act(() => media.start());
    const expected = voiceTimeline(voice, 'Rojbaş', 1200)!;
    const seen = new Set<string>();
    for (let ms = 0; ms < 1200; ms += 40) {
      at(media, ms / 1000);
      expect(mouth(root)).toBe(visemeAt(expected, ms));
      seen.add(mouth(root));
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it('keeps its mouth at rest with neither a timeline nor words', () => {
    const media = new FakeMedia();
    const { root } = face(media, { voice: { speaker: 'hamo' } });
    media.duration = 1;
    media.readyState = 1;
    act(() => media.start());
    for (const s of [0.1, 0.3, 0.6]) {
      at(media, s);
      expect(mouth(root)).toBe('rest');
    }
  });

  it('listens, mouth at rest, while the player says another recording', () => {
    const media = new FakeMedia();
    const { root } = face(media);
    act(() => media.start('https://cdn.test/another.m4a'));
    at(media, 0.3);
    expect(mouth(root)).toBe('rest');
    expect(root).not.toHaveAttribute('data-speaking');
  });

  it('nods while it speaks, and not for a reader who asked for less motion', () => {
    const media = new FakeMedia();
    const head = (root: HTMLElement): Element => root.querySelector('[data-sc="head"]')!;
    const first = face(media);
    act(() => media.start());
    at(media, 0.3);
    expect(head(first.root).getAttribute('transform')).toMatch(/^rotate\(-?[\d.]+ [\d.]+ [\d.]+\)$/);
    first.unmount();

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
    const calm = new FakeMedia();
    const second = face(calm);
    act(() => calm.start());
    at(calm, 0.3);
    expect(mouth(second.root)).toBe('a');
    expect(head(second.root)).not.toHaveAttribute('transform');
  });

  it('stops its frame loop a moment after the recording pauses, and blinks on a timer instead', () => {
    const intervals = vi.spyOn(window, 'setInterval');
    const media = new FakeMedia();
    face(media);
    act(() => media.start());
    step();
    expect(frames.size).toBe(1);
    act(() => media.stop());
    step();
    clock += 2000;
    step();
    expect(frames.size).toBe(0);
    expect(intervals).toHaveBeenCalled();
  });

  it('stops everything when it goes', () => {
    const cleared = vi.spyOn(window, 'clearInterval');
    const media = new FakeMedia();
    const { unmount } = face(media);
    act(() => media.start());
    step();
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(cleared).toHaveBeenCalled();
    // and no longer listens
    act(() => media.start());
    expect(frames.size).toBe(0);
  });

  it('stops its loop when it is scrolled out of sight', () => {
    let seen: IntersectionObserverCallback | null = null;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          seen = cb;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    const media = new FakeMedia();
    face(media);
    act(() => media.start());
    step();
    expect(frames.size).toBe(1);
    act(() => seen!([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(frames.size).toBe(0);
    act(() => seen!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(frames.size).toBe(1);
  });

  it('gives two characters on one page ids of their own, each drawing pointing only at its own', () => {
    const { container } = render(
      <I18nProvider>
        <SpeakingCharacter speaker="xezo" audio={null} />
        <SpeakingCharacter speaker="xezo" audio={null} />
      </I18nProvider>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const root of container.querySelectorAll('.speaking-character')) {
      const own = new Set([...root.querySelectorAll('[id]')].map((el) => el.id));
      const refs = [...root.innerHTML.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)].map((m) => m[1] ?? m[2]);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) expect(own.has(ref!)).toBe(true);
    }
  });

  it('is named for a screen reader, and says when it speaks; decorative beside a play button', () => {
    const media = new FakeMedia();
    face(media);
    expect(screen.getByRole('img', { name: 'Hamo' })).toBeInTheDocument();
    act(() => media.start());
    expect(screen.getByRole('img', { name: 'Hamo speaking' })).toHaveAttribute('data-speaking');
    act(() => media.stop());
    expect(screen.getByRole('img', { name: 'Hamo' })).not.toHaveAttribute('data-speaking');

    const quiet = face(new FakeMedia(), { speaker: 'hevalo', decorative: true });
    expect(quiet.root).toHaveAttribute('aria-hidden', 'true');
    expect(quiet.root).not.toHaveAttribute('role');
  });

  it('has its shape from the first paint', () => {
    const bust = face(new FakeMedia(), { size: 96 }).root;
    expect(bust.style.width).toBe('96px');
    expect(bust.style.height).toBe('96px');
    const full = face(new FakeMedia(), { crop: 'full' }).root;
    expect(full.style.aspectRatio).toMatch(/^\d+(\.\d+)? \/ \d+(\.\d+)?$/);
  });

  it('takes up an element that only exists once something has played', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      let made: FakeMedia | null = null;
      const { root } = face(new FakeMedia(), { audio: () => made as unknown as HTMLAudioElement | null });
      made = new FakeMedia();
      made.start(CLIP, 0.3);
      act(() => vi.advanceTimersByTime(100));
      expect(root).toHaveAttribute('data-speaking');
      step();
      expect(mouth(root)).toBe('a');
    } finally {
      vi.useRealTimers();
    }
  });

  it('follows the element a ref or a function finds', () => {
    const media = new FakeMedia();
    const { root } = face(new FakeMedia(), { audio: () => media as unknown as HTMLAudioElement });
    act(() => media.start(CLIP, 0.3));
    step();
    expect(mouth(root)).toBe('a');
    const held = new FakeMedia();
    const second = face(new FakeMedia(), { audio: { current: held as unknown as HTMLAudioElement } });
    act(() => held.start(CLIP, 0.15));
    step();
    expect(mouth(second.root)).toBe('mbp');
  });

  it('draws the deer’s ears, pupils and nose as groups of their own, so they can move', () => {
    const { root } = face(new FakeMedia(), { speaker: 'hevalo', voice: { speaker: 'hevalo' }, crop: 'full' });
    for (const part of ['ear-left', 'ear-right', 'nose', 'hop', 'tilt', 'shadow']) expect(root.querySelector(`[data-sc="${part}"]`), part).not.toBeNull();
    expect(root.querySelector('[data-pupil="left"]')).not.toBeNull();
    expect(root.querySelector('[data-pupil="right"]')).not.toBeNull();
    // every way the eyes can be, one shown at a time
    for (const state of ['open', 'half', 'closed', 'happy']) expect(root.querySelector(`[data-eyes="${state}"]`), state).not.toBeNull();
    expect([...root.querySelectorAll('[data-eyes]')].filter((g) => !g.hasAttribute('visibility'))).toHaveLength(1);
  });

  it('looks where the pointer is', () => {
    const { root } = face(new FakeMedia(), { speaker: 'hevalo', voice: { speaker: 'hevalo' } });
    root.getBoundingClientRect = () => ({ left: 100, top: 100, width: 100, height: 100, right: 200, bottom: 200, x: 100, y: 100, toJSON: () => ({}) });
    act(() => {
      window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 900, clientY: 150, pointerType: 'mouse' }));
    });
    const left = root.querySelector<SVGGElement>('[data-pupil="left"]')!;
    const moved = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(left.style.transform);
    expect(moved).not.toBeNull();
    // far off to the right: the pupil goes right
    expect(Number(moved![1])).toBeGreaterThan(0);
  });

  it('beams at a right answer, eyes smiling and mouth open, even for a reader who asked for less motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query, addEventListener() {}, removeEventListener() {} }));
    const { root } = face(new FakeMedia(), { reaction: 'cheer' });
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(root.querySelector('[data-eyes="happy"]')).not.toHaveAttribute('visibility');
    expect(mouth(root)).toBe('a');
  });

  it('rests where there is nothing to do yet: eyes shut, head dipped, z’s beside it, still under the pointer', () => {
    const { root } = face(new FakeMedia(), { speaker: 'hevalo', voice: { speaker: 'hevalo' }, crop: 'full', resting: true });
    expect(screen.getByRole('img', { name: 'Hevalo is resting' })).toBe(root);
    expect(root).toHaveClass('is-resting');
    expect(root.querySelector('[data-eyes="closed"]')).not.toHaveAttribute('visibility');
    expect(root.querySelector('[data-sc="head"]')?.getAttribute('transform')).toMatch(/^rotate\(5 /);
    // three z's for the stylesheet to float up, inside the drawing a screen reader already skips
    expect(root.querySelectorAll('.sc-z')).toHaveLength(3);
    expect(root.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // a slower, deeper breath than awake
    expect(root.style.getPropertyValue('--sc-breath-ms')).toBe('5600ms');
    // the eyes do not follow the pointer while it sleeps
    root.getBoundingClientRect = () => ({ left: 100, top: 100, width: 100, height: 100, right: 200, bottom: 200, x: 100, y: 100, toJSON: () => ({}) });
    act(() => {
      window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 900, clientY: 150, pointerType: 'mouse' }));
    });
    expect(root.querySelector<SVGGElement>('[data-pupil="left"]')!.style.transform).toBe('');
    // awake, none of it
    const awake = face(new FakeMedia(), { speaker: 'hevalo', voice: { speaker: 'hevalo' } }).root;
    expect(awake.querySelectorAll('.sc-z')).toHaveLength(0);
    expect(awake.querySelector('[data-eyes="open"]')).not.toHaveAttribute('visibility');
  });

  it('greets a click, and then does what the page asked', async () => {
    const again = vi.fn();
    const { root } = face(new FakeMedia(), { onPress: again });
    act(() => root.click());
    expect(again).toHaveBeenCalledTimes(1);
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(root.querySelector('[data-eyes="happy"]')).not.toHaveAttribute('visibility');
  });
});

