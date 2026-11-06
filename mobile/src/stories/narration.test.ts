import { describe, expect, it, vi } from 'vitest';
import { lessonAudioKey, type StoryNarration } from '@kurda/shared';
import { Narrator, clockText, narrationItems, narrationLine, narrationTrack, trackAt, trackLength, type NarrationState, type PlayerLike, type PlayerStatus } from './narration';
import { NARRATION_RATES, nextRate } from './prefs';

// the speeds live beside the stored preferences, which read the platform and its keystore; neither is wanted here
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => undefined }));

const paragraphs = ['Rojda çû sûkê. Ew sêv kirî!', 'Bavê wê li malê bû.'];
const audio = {
  [lessonAudioKey('Rojda çû sûkê.')]: 'a.m4a',
  [lessonAudioKey('Ew sêv kirî!')]: 'b.m4a',
  [lessonAudioKey('Bavê wê li malê bû.')]: 'c.m4a',
};

/** The server's stitched track for the same three sentences: 2 s, 3 s and 4 s long. */
const narration: StoryNarration = {
  sentences: [
    { paragraph: 0, sentence: 0, key: lessonAudioKey('Rojda çû sûkê.'), url: 'a.m4a', durationMs: 2000, startMs: 0 },
    { paragraph: 0, sentence: 1, key: lessonAudioKey('Ew sêv kirî!'), url: 'b.m4a', durationMs: 3000, startMs: 2000 },
    { paragraph: 1, sentence: 0, key: lessonAudioKey('Bavê wê li malê bû.'), url: 'c.m4a', durationMs: 4000, startMs: 5000 },
  ],
  totalMs: 9000,
  complete: true,
};

function fakePlayer() {
  const log: string[] = [];
  let ended: () => void = () => undefined;
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
    onEnded: (l) => {
      ended = l;
      return () => undefined;
    },
    onStatus: (l) => {
      status = l;
      return () => undefined;
    },
    release: () => log.push('release'),
    clock,
  };
  return { player, log, clock, end: () => ended(), report: (s: PlayerStatus) => status(s) };
}

describe('narrationItems', () => {
  it('lists the recorded sentences in reading order, by paragraph and sentence', () => {
    expect(narrationItems(paragraphs, audio)).toEqual([
      { paragraph: 0, sentence: 0, url: 'a.m4a', key: lessonAudioKey('Rojda çû sûkê.') },
      { paragraph: 0, sentence: 1, url: 'b.m4a', key: lessonAudioKey('Ew sêv kirî!') },
      { paragraph: 1, sentence: 0, url: 'c.m4a', key: lessonAudioKey('Bavê wê li malê bû.') },
    ]);
  });

  it('skips a sentence nobody has recorded yet', () => {
    const partial = Object.fromEntries(Object.entries(audio).filter(([k]) => k !== lessonAudioKey('Ew sêv kirî!')));
    expect(narrationItems(paragraphs, partial).map((i) => i.url)).toEqual(['a.m4a', 'c.m4a']);
  });
});

describe('the stitched track', () => {
  it('takes the server’s sentences with their places, and knows its length', () => {
    const track = narrationTrack(narration);
    expect(track.map((i) => [i.paragraph, i.sentence, i.startMs, i.durationMs])).toEqual([
      [0, 0, 0, 2000],
      [0, 1, 2000, 3000],
      [1, 0, 5000, 4000],
    ]);
    expect(trackLength(track)).toBe(9000);
    expect(trackLength([])).toBe(0);
  });

  it('finds the sentence at a point on the track, and lands at either edge somewhere playable', () => {
    const track = narrationTrack(narration);
    expect(trackAt(track, -5)).toEqual({ index: 0, offsetMs: 0 });
    expect(trackAt(track, 1999)).toEqual({ index: 0, offsetMs: 1999 });
    expect(trackAt(track, 2000)).toEqual({ index: 1, offsetMs: 0 });
    expect(trackAt(track, 6500)).toEqual({ index: 2, offsetMs: 1500 });
    expect(trackAt(track, 9000)).toEqual({ index: 2, offsetMs: 4000 });
    expect(trackAt([], 10)).toEqual({ index: -1, offsetMs: 0 });
  });

  it('writes a time as minutes and seconds', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(9000)).toBe('0:09');
    expect(clockText(65_400)).toBe('1:05');
  });
});

describe('the speeds', () => {
  it('cycles slower, as spoken, a little faster, and round again', () => {
    expect(NARRATION_RATES).toEqual([0.75, 1, 1.25]);
    expect(nextRate(0.75)).toBe(1);
    expect(nextRate(1)).toBe(1.25);
    expect(nextRate(1.25)).toBe(0.75);
  });
});

describe('narrationLine', () => {
  it('says what a recorded sentence says, and who says it when somebody was chosen', () => {
    const [first, second] = narrationItems(paragraphs, audio);
    const voices = { [lessonAudioKey('Rojda çû sûkê.')]: { speaker: 'xezo' as const } };
    expect(narrationLine(paragraphs, voices, first!)).toEqual({ text: 'Rojda çû sûkê.', voice: { speaker: 'xezo' } });
    expect(narrationLine(paragraphs, voices, second!)).toEqual({ text: 'Ew sêv kirî!', voice: null });
    expect(narrationLine(paragraphs, undefined, first!).voice).toBeNull();
  });

  it('finds nobody in what an object inherits, or in a speaker this app cannot draw', () => {
    const item = { paragraph: 0, sentence: 0, url: 'a.m4a' };
    const lines = ['constructor.'];
    expect(narrationLine(lines, {}, item)).toEqual({ text: 'constructor.', voice: null });
    const stranger = { [lessonAudioKey('constructor.')]: { speaker: 'somebody' } } as never;
    expect(narrationLine(lines, stranger, item).voice).toBeNull();
  });
});

describe('Narrator', () => {
  it('plays a paragraph sentence after sentence and stops at its end, highlight and all', () => {
    const f = fakePlayer();
    const states: NarrationState[] = [];
    const n = new Narrator(() => f.player, (s) => states.push(s));
    const items = narrationItems(paragraphs, audio).filter((i) => i.paragraph === 0);
    n.play(items, 'paragraph');
    expect(n.state.current).toMatchObject({ paragraph: 0, sentence: 0, url: 'a.m4a' });
    expect(n.state.paragraph).toBe(0);
    f.end();
    expect(n.state.current?.url).toBe('b.m4a');
    f.end();
    expect(n.state).toMatchObject({ playing: false, current: null, scope: null });
    expect(f.log.filter((l) => l.startsWith('load'))).toEqual(['load a.m4a', 'load b.m4a']);
  });

  it('pauses and carries on, moves a sentence either way, and keeps the chosen speed', () => {
    const f = fakePlayer();
    const n = new Narrator(() => f.player, () => undefined);
    n.setRate(0.75);
    n.play(narrationItems(paragraphs, audio), 'story');
    n.toggle();
    expect(n.state.playing).toBe(false);
    n.toggle();
    expect(n.state.playing).toBe(true);
    // carrying on is play, never a reload: the sound goes on from inside the sentence
    expect(f.log.slice(-2)).toEqual(['pause', 'play']);
    n.next();
    n.next();
    expect(n.state.current?.url).toBe('c.m4a');
    n.next(); // already on the last
    expect(n.state.current?.url).toBe('c.m4a');
    n.previous();
    expect(n.state.current?.url).toBe('b.m4a');
    expect(f.log).toContain('rate 0.75');
    expect(f.log.filter((l) => l.startsWith('rate')).every((l) => l === 'rate 0.75')).toBe(true);
    expect(n.state.rate).toBe(0.75);
  });

  it('seeks along the stitched track: into the sentence playing, or to another sentence, paused staying paused', () => {
    const f = fakePlayer();
    const n = new Narrator(() => f.player, () => undefined);
    const track = narrationTrack(narration);
    n.play(track, 'story');
    expect(n.totalMs).toBe(9000);
    // within the first sentence: no reload, just the move
    f.log.length = 0;
    n.seek(1500);
    expect(f.log).toEqual(['seek 1.5', 'play']);
    expect(n.positionMs()).toBe(1500);
    // into the third: loaded, moved, and playing on
    f.log.length = 0;
    n.seek(6500);
    expect(n.state.index).toBe(2);
    expect(f.log).toEqual(['load c.m4a', 'rate 1', 'seek 1.5', 'play']);
    expect(n.positionMs()).toBe(6500);
    // paused: the line moves, the voice waits
    n.toggle();
    f.log.length = 0;
    n.seek(2500);
    expect(n.state).toMatchObject({ index: 1, playing: false });
    expect(f.log).toEqual(['load b.m4a', 'rate 1', 'seek 0.5']);
    // past the end: the last sentence at its end
    n.seek(20_000);
    expect(n.positionMs()).toBe(9000);
  });

  it('says a sentence again from its start, and reads its place on the track from the player', () => {
    const f = fakePlayer();
    const n = new Narrator(() => f.player, () => undefined);
    n.play(narrationTrack(narration), 'story', 1);
    f.clock.currentTime = 1.2;
    expect(n.positionMs()).toBe(3200);
    f.log.length = 0;
    n.replay();
    expect(f.log).toEqual(['load b.m4a', 'rate 1', 'play']);
    expect(n.positionMs()).toBe(2000);
    // a position never runs past the sentence it is in
    f.clock.currentTime = 9;
    expect(n.positionMs()).toBe(5000);
  });

  it('shows the wait for sound, and a recording that would not play, and tries that one again on play', () => {
    const f = fakePlayer();
    const states: NarrationState[] = [];
    const n = new Narrator(() => f.player, (s) => states.push(s));
    n.play(narrationTrack(narration), 'story');
    f.report({ buffering: true, error: false });
    expect(n.state.buffering).toBe(true);
    f.report({ buffering: false, error: false });
    expect(n.state.buffering).toBe(false);
    f.report({ buffering: false, error: true });
    expect(n.state).toMatchObject({ error: true, playing: false, current: { url: 'a.m4a' } });
    f.log.length = 0;
    n.toggle();
    expect(f.log).toEqual(['load a.m4a', 'rate 1', 'play']);
    expect(n.state).toMatchObject({ error: false, playing: true });
    // the same status twice is said once
    const before = states.length;
    f.report({ buffering: false, error: false });
    expect(states.length).toBe(before);
    // a failure stays said while the player goes on reporting quietly; only a new try clears it
    f.report({ buffering: true, error: true });
    expect(n.state).toMatchObject({ error: true, buffering: false, playing: false });
    const after = states.length;
    f.report({ buffering: false, error: false });
    expect(n.state.error).toBe(true);
    expect(states.length).toBe(after);
  });

  it('keeps the story’s place when it is stopped part-way, and forgets it once the story has played to its end', () => {
    const f = fakePlayer();
    const n = new Narrator(() => f.player, () => undefined);
    const track = narrationTrack(narration);
    expect(n.resumeMs).toBeNull();
    n.play(track, 'story', 1);
    f.clock.currentTime = 1.5;
    // a paragraph’s Listen takes over: the story’s place is where it was
    n.play(narrationItems(paragraphs, audio).filter((i) => i.paragraph === 1), 'paragraph');
    expect(n.resumeMs).toBe(3500);
    n.stop();
    expect(n.resumeMs).toBe(3500);
    // the story again from a point, then to its end
    n.play(track, 'story', 2);
    expect(n.resumeMs).toBeNull();
    f.clock.currentTime = 2;
    n.stop();
    expect(n.resumeMs).toBe(7000);
    n.play(track, 'story', 2);
    f.end();
    expect(n.state.scope).toBeNull();
    expect(n.resumeMs).toBeNull();
    // a paragraph’s own queue has no place on the track to keep
    n.play(narrationItems(paragraphs, audio), 'paragraph');
    n.stop();
    expect(n.resumeMs).toBeNull();
  });

  it('falls silent and lets the player go when the screen closes', () => {
    const f = fakePlayer();
    const n = new Narrator(() => f.player, () => undefined);
    n.play(narrationItems(paragraphs, audio), 'story');
    n.dispose();
    expect(f.log.slice(-2)).toEqual(['pause', 'release']);
    expect(n.state.current).toBeNull();
  });

  it('does nothing with an empty queue', () => {
    const f = fakePlayer();
    const n = new Narrator(() => f.player, () => undefined);
    n.play([], 'story');
    n.toggle();
    n.seek(100);
    expect(f.log).toEqual([]);
    expect(n.positionMs()).toBe(0);
  });
});
