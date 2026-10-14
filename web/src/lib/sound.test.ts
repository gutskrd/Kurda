import { describe, it, expect, vi, beforeAll } from 'vitest';

class FakeAudio extends EventTarget {
  src = '';
  playbackRate = 1;
  defaultPlaybackRate = 1;
  play(): Promise<void> {
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  pause(): void {
    this.dispatchEvent(new Event('pause'));
  }
}

const made: FakeAudio[] = [];
beforeAll(() => {
  vi.stubGlobal(
    'Audio',
    class extends FakeAudio {
      constructor() {
        super();
        made.push(this);
      }
    },
  );
});

describe('the one player', () => {
  it('tells who listens when a clip plays to its end, and not when it is stopped', async () => {
    const { play, stop, onEnded } = await import('./sound');
    const ended: string[] = [];
    const off = onEnded((src) => ended.push(src));
    play('https://cdn.test/a.m4a');
    stop();
    expect(ended).toEqual([]);
    play('https://cdn.test/b.m4a');
    made[0]!.dispatchEvent(new Event('ended'));
    expect(ended).toEqual(['https://cdn.test/b.m4a']);
    off();
    made[0]!.dispatchEvent(new Event('ended'));
    expect(ended).toHaveLength(1);
  });

  it('changes the speed of what is playing', async () => {
    const { play, setRate } = await import('./sound');
    play('https://cdn.test/c.m4a');
    setRate(0.75);
    expect(made[0]!.playbackRate).toBe(0.75);
    expect(made[0]!.defaultPlaybackRate).toBe(0.75);
  });
});
