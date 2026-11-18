import { vi } from 'vitest';

/**
 * A recording and animation frames driven by the test, for the speaking characters' tests. `FakeAudio` stands in
 * for the page's `Audio` element (lesson/useAudio.ts), playing when asked and firing the element's events;
 * `fakeFrames` replaces requestAnimationFrame with a queue the test steps one frame at a time.
 */
export class FakeAudio {
  static made: FakeAudio[] = [];

  playbackRate = 1;
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  ended = false;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(readonly src: string) {
    FakeAudio.made.push(this);
  }

  /** The one made for this URL most lately. */
  static of(src: string): FakeAudio | undefined {
    return [...FakeAudio.made].reverse().find((a) => a.src === src);
  }

  addEventListener(type: string, cb: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }

  removeEventListener(type: string, cb: () => void): void {
    this.listeners.get(type)?.delete(cb);
  }

  play(): Promise<void> {
    this.ended = false;
    if (this.paused) {
      this.paused = false;
      this.emit('play');
    }
    return Promise.resolve();
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.emit('pause');
  }

  /** The recording has loaded and turned out this long. */
  load(seconds: number): void {
    this.duration = seconds;
  }

  finish(): void {
    this.currentTime = this.duration;
    this.paused = true;
    this.ended = true;
    this.emit('pause');
    this.emit('ended');
  }

  private emit(type: string): void {
    for (const cb of this.listeners.get(type) ?? []) cb();
  }
}

export interface Frames {
  /** Callbacks waiting for the next frame. */
  readonly pending: number;
  /** Run the frame everything is waiting for. */
  step: () => void;
}

export function fakeFrames(): Frames {
  const queue = new Map<number, FrameRequestCallback>();
  let next = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = next++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    queue.delete(id);
  });
  return {
    get pending() {
      return queue.size;
    },
    step: () => {
      const due = [...queue.values()];
      queue.clear();
      for (const cb of due) cb(Date.now());
    },
  };
}
