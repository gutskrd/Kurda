import { describe, expect, it } from 'vitest';
import { lessonAudioKey } from '@kurda/shared';
import { Narrator, narrationItems, narrationLine, type NarrationState, type PlayerLike } from './narration';

const paragraphs = ['Rojda çû sûkê. Ew sêv kirî!', 'Bavê wê li malê bû.'];
const audio = {
  [lessonAudioKey('Rojda çû sûkê.')]: 'a.m4a',
  [lessonAudioKey('Ew sêv kirî!')]: 'b.m4a',
  [lessonAudioKey('Bavê wê li malê bû.')]: 'c.m4a',
};

function fakePlayer() {
  const log: string[] = [];
  let ended: () => void = () => undefined;
  const player: PlayerLike = {
    load: (url) => log.push(`load ${url}`),
    play: () => log.push('play'),
    pause: () => log.push('pause'),
    setRate: (r) => log.push(`rate ${r}`),
    onEnded: (l) => {
      ended = l;
      return () => undefined;
    },
    release: () => log.push('release'),
  };
  return { player, log, end: () => ended() };
}

describe('narrationItems', () => {
  it('lists the recorded sentences in reading order, by paragraph and sentence', () => {
    expect(narrationItems(paragraphs, audio)).toEqual([
      { paragraph: 0, sentence: 0, url: 'a.m4a' },
      { paragraph: 0, sentence: 1, url: 'b.m4a' },
      { paragraph: 1, sentence: 0, url: 'c.m4a' },
    ]);
  });

  it('skips a sentence nobody has recorded yet', () => {
    const partial = Object.fromEntries(Object.entries(audio).filter(([k]) => k !== lessonAudioKey('Ew sêv kirî!')));
    expect(narrationItems(paragraphs, partial).map((i) => i.url)).toEqual(['a.m4a', 'c.m4a']);
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
    expect(n.state.current).toEqual({ paragraph: 0, sentence: 0, url: 'a.m4a' });
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
    n.next();
    n.next();
    expect(n.state.current?.url).toBe('c.m4a');
    n.next(); // already on the last
    expect(n.state.current?.url).toBe('c.m4a');
    n.previous();
    expect(n.state.current?.url).toBe('b.m4a');
    expect(f.log).toContain('rate 0.75');
    expect(f.log.filter((l) => l.startsWith('rate')).every((l) => l === 'rate 0.75')).toBe(true);
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
    expect(f.log).toEqual([]);
  });
});
