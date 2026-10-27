import { describe, expect, it } from 'vitest';
import {
  COMPANION_DOZE_MS,
  COMPANION_VIEW,
  CompanionMotion,
  companionLook,
  companionSvg,
  companionTransforms,
  type CompanionFrame,
  type CompanionLooks,
  type CompanionTone,
  type EyeState,
} from './index.js';

const NONE: CompanionLooks = { pointer: null, caret: null };

/** Frames every 16 ms from `from` for `ms`, as a browser would draw them. */
function run(m: CompanionMotion, from: number, ms: number, looks: CompanionLooks = NONE, still = false): CompanionFrame[] {
  const frames: CompanionFrame[] = [];
  for (let t = 0; t <= ms; t += 16) frames.push(m.step(from + t, looks, still));
  return frames;
}

const last = (frames: CompanionFrame[]): CompanionFrame => frames[frames.length - 1]!;

/** A companion that has arrived and settled, at 10 s on the clock. */
function settled(tone: CompanionTone = 'playful'): CompanionMotion {
  const m = new CompanionMotion(tone, () => 0.5);
  m.arrive(0);
  run(m, 0, 10_000);
  return m;
}

const NOW = 10_000;

describe('companionSvg', () => {
  const playful = companionSvg({ prefix: 'one', tone: 'playful' });
  const calm = companionSvg({ prefix: 'two', tone: 'calm' });
  const ids = (svg: string): string[] => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);

  it('has a group for every moving part, every eye state and every sign', () => {
    for (const part of ['body', 'head', 'ear-left', 'ear-right', 'pupil-left', 'pupil-right', 'nose', 'hoof-left', 'hoof-right', 'emotes']) {
      expect(playful).toContain(`data-cp="${part}"`);
    }
    for (const side of ['left', 'right']) expect(playful).toContain(`data-eye="${side}"`);
    for (const lid of ['half', 'closed', 'happy']) expect(playful.split(`data-lid="${lid}" visibility="hidden"`)).toHaveLength(3);
    for (const sign of ['think', 'question', 'spark', 'heart', 'sleep']) expect(playful).toContain(`data-emote="${sign}" visibility="hidden"`);
    expect(playful).toMatch(/data-mouth="rest">/);
  });

  it('is decorative, and two on a page share no id', () => {
    expect(playful).toContain('aria-hidden="true"');
    expect(new Set(ids(playful)).size).toBe(ids(playful).length);
    const both = [...ids(playful), ...ids(calm)];
    expect(new Set(both).size).toBe(both.length);
    expect(ids(playful).every((id) => id.startsWith('one-'))).toBe(true);
  });

  it('gives reading glasses to the console only', () => {
    expect(calm).toContain('data-cp="glasses"');
    expect(playful).not.toContain('data-cp="glasses"');
  });
});

describe('CompanionMotion', () => {
  it('covers his eyes with his hooves for a password, and peeks with one when it is shown', () => {
    const m = settled();
    m.set({ field: 'secret' }, NOW);
    const covered = last(run(m, NOW, 1200));
    expect(covered.hoofLeft).toBeCloseTo(1, 2);
    expect(covered.hoofRight).toBeCloseTo(1, 2);
    expect(covered.eyes).toEqual(['closed', 'closed']);

    m.set({ shown: true }, NOW + 1300);
    const peeking = last(run(m, NOW + 1300, 1200));
    expect(peeking.hoofLeft).toBeCloseTo(1, 2);
    expect(peeking.hoofRight).toBeCloseTo(0.5, 2);
    expect(peeking.eyes).toEqual(['closed', 'half']);

    m.set({ field: 'none', shown: false }, NOW + 2600);
    const down = last(run(m, NOW + 2600, 1200));
    expect(down.hoofLeft).toBeCloseTo(0, 2);
    expect(down.eyes).toEqual(['open', 'open']);
  });

  it('never opens or shuts an eye without passing half shut', () => {
    const m = settled();
    const seen: (readonly [EyeState, EyeState])[] = [];
    const watch = (frames: CompanionFrame[]): void => void frames.forEach((f) => seen.push(f.eyes));
    m.set({ field: 'secret' }, NOW);
    watch(run(m, NOW, 600));
    m.set({ field: 'none' }, NOW + 700);
    watch(run(m, NOW + 700, 600));
    m.set({ status: 'success' }, NOW + 1400);
    watch(run(m, NOW + 1400, 2000));
    for (let i = 1; i < seen.length; i++) {
      for (const k of [0, 1]) {
        const from = seen[i - 1]![k]!;
        const to = seen[i]![k]!;
        if (from !== to) expect([from, to]).toContain('half');
      }
    }
    expect(seen.some((e) => e[0] === 'half')).toBe(true);
  });

  it('watches the caret along a box being typed in, ears up, leaning after it', () => {
    const m = settled();
    m.set({ field: 'text' }, NOW);
    const f = last(run(m, NOW, 800, { pointer: null, caret: { x: -0.8, y: 0.5 } }));
    expect(f.look.x).toBeCloseTo(-0.8, 2);
    expect(f.look.y).toBeCloseTo(0.5, 2);
    expect(f.focus).toBeCloseTo(1, 2);
    expect(f.earLeft).toBeGreaterThan(3);
    expect(f.tilt).toBeLessThan(0);
  });

  it('flicks an ear every few keys while he watches, and never with his eyes covered', () => {
    const m = settled();
    m.set({ field: 'text' }, NOW);
    run(m, NOW, 800);
    const before = m.step(NOW + 820).earLeft;
    for (let i = 0; i < 4; i++) m.react('keystroke', NOW + 830);
    expect(Math.max(...run(m, NOW + 840, 260).map((f) => f.earLeft))).toBeGreaterThan(before + 1);

    const s = settled();
    s.set({ field: 'secret' }, NOW);
    run(s, NOW, 1200);
    for (let i = 0; i < 8; i++) s.react('keystroke', NOW + 1210);
    const ears = run(s, NOW + 1220, 300).map((f) => f.earLeft);
    expect(Math.max(...ears) - Math.min(...ears)).toBeLessThan(0.01);
  });

  it('looks up and thinks while the form is sent', () => {
    const m = settled();
    m.set({ status: 'busy' }, NOW);
    const f = last(run(m, NOW, 800));
    expect(f.emote).toBe('think');
    expect(f.look.y).toBeLessThan(-0.5);
  });

  it('meets a mistake with a curious tilt and a question that goes away by itself', () => {
    const m = settled();
    m.set({ status: 'busy' }, NOW);
    run(m, NOW, 400);
    m.set({ status: 'error' }, NOW + 500);
    const frames = run(m, NOW + 500, 1600);
    expect(frames[1]!.emote).toBe('question');
    expect(Math.max(...frames.map((f) => Math.abs(f.tilt)))).toBeGreaterThan(3);
    expect(last(run(m, NOW + 2200, 400)).emote).toBeNull();
  });

  it('is pleased at getting in: happy eyes, sparkles, a hop and, on the website, a word', () => {
    const m = settled();
    m.set({ status: 'success' }, NOW, 'welcome');
    const frames = run(m, NOW, 1000);
    expect(last(frames).eyes).toEqual(['happy', 'happy']);
    expect(frames[2]!.emote).toBe('spark');
    expect(frames[2]!.say).toBe('welcome');
    expect(Math.max(...frames.map((f) => f.rise))).toBeGreaterThan(0.02);

    const c = settled('calm');
    c.set({ status: 'success' }, NOW, 'welcome');
    const quiet = run(c, NOW, 1000);
    expect(quiet.every((f) => f.say === null)).toBe(true);
    expect(Math.max(...quiet.map((f) => f.rise))).toBeLessThan(Math.max(...frames.map((f) => f.rise)));
  });

  it('greets a tap with a heart and a hello on the website, with less in the console', () => {
    const m = settled();
    m.react('greet', NOW);
    const f = run(m, NOW, 200)[3]!;
    expect(f.emote).toBe('heart');
    expect(f.say).toBe('hello');

    const c = settled('calm');
    c.react('greet', NOW);
    expect(run(c, NOW, 200)[3]!.emote).toBeNull();
  });

  it('says hello a moment after he arrives, on the website only', () => {
    const m = new CompanionMotion('playful', () => 0.5);
    m.arrive(0);
    expect(m.step(100).say).toBeNull();
    expect(m.step(900).say).toBe('hello');
    const c = new CompanionMotion('calm', () => 0.5);
    c.arrive(0);
    expect(c.step(900).say).toBeNull();
  });

  it('dozes when left alone long enough on the website, and wakes at once', () => {
    const m = settled();
    const awake = last(run(m, NOW, 1000));
    expect(awake.asleep).toBe(false);
    const dozing = last(run(m, NOW + COMPANION_DOZE_MS, 600));
    expect(dozing.asleep).toBe(true);
    expect(dozing.emote).toBe('sleep');
    expect(dozing.eyes).toEqual(['closed', 'closed']);
    m.react('greet', NOW + COMPANION_DOZE_MS + 700);
    expect(m.step(NOW + COMPANION_DOZE_MS + 716).asleep).toBe(false);

    const c = settled('calm');
    expect(last(run(c, NOW + COMPANION_DOZE_MS, 600)).asleep).toBe(false);
    const typing = settled();
    typing.set({ field: 'text' }, NOW);
    expect(last(run(typing, NOW + COMPANION_DOZE_MS, 600)).asleep).toBe(false);
  });

  it('sleeps while sign-in is paused, in either tone', () => {
    const c = settled('calm');
    c.set({ status: 'waiting' }, NOW);
    const f = last(run(c, NOW, 800));
    expect(f.emote).toBe('sleep');
    expect(f.eyes).toEqual(['closed', 'closed']);
  });

  it('keeps the console reactions smaller than the website ones', () => {
    const tilt = (tone: CompanionTone): number => {
      const m = settled(tone);
      m.set({ status: 'error' }, NOW);
      return Math.max(...run(m, NOW, 1700).map((f) => Math.abs(f.tilt)));
    };
    expect(tilt('calm')).toBeLessThan(tilt('playful') * 0.7);
  });

  it('goes still between things, saying when to look again', () => {
    const m = settled();
    const frames = run(m, NOW, 6000);
    const still = frames.find((f) => !f.moving);
    expect(still).toBeDefined();
    expect(still!.wakeAt).toBeGreaterThan(NOW);
    // a blink comes round within the habit's longest wait
    expect(frames.some((f) => f.eyes[0] === 'closed')).toBe(true);
  });

  it('for whoever asks for less motion goes straight to each pose, with no acts, habits or doze, keeping his signs and words', () => {
    const m = new CompanionMotion('playful', () => 0.5);
    m.arrive(0);
    m.set({ field: 'secret' }, 0);
    const f = m.step(16, NONE, true);
    expect(f.hoofLeft).toBe(1);
    expect(f.eyes).toEqual(['closed', 'closed']);
    expect(f.moving).toBe(false);
    m.set({ field: 'none', status: 'success' }, 32, 'welcome');
    const pleased = m.step(48, NONE, true);
    expect(pleased.eyes).toEqual(['happy', 'happy']);
    expect(pleased.rise).toBe(0);
    expect(pleased.emote).toBe('spark');
    expect(pleased.say).toBe('welcome');
    m.set({ status: 'idle' }, 64);
    const later = run(m, 80, COMPANION_DOZE_MS + 2000, NONE, true);
    expect(later.every((x) => !x.asleep && !x.moving && x.eyes[0] === 'open')).toBe(true);
    // with the word and the sparkles gone by themselves, nothing is left to wake for
    expect(last(later).say).toBeNull();
    expect(last(later).wakeAt).toBeNull();
  });
});

describe('companionTransforms', () => {
  const numbers = (s: string): number[] => (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

  it('turns every frame into finite transforms', () => {
    const m = settled();
    m.set({ field: 'secret', shown: true }, NOW);
    for (const f of run(m, NOW, 600)) {
      for (const value of Object.values(companionTransforms(f))) {
        expect(value).not.toMatch(/NaN|Infinity/);
        expect(numbers(value).every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('rests the hooves on the edge, and brings each over its own eye', () => {
    const base: CompanionFrame = {
      hoofLeft: 0,
      hoofRight: 1,
      earLeft: 0,
      earRight: 0,
      tilt: 0,
      rise: 0,
      stretch: 1,
      sniff: 1,
      look: { x: 0, y: 0 },
      focus: 0,
      eyes: ['open', 'open'],
      mouth: 'rest',
      emote: null,
      say: null,
      asleep: false,
      moving: false,
      wakeAt: null,
    };
    const t = companionTransforms(base);
    const [lx, ly] = numbers(t.hoofLeft);
    const [rx, ry] = numbers(t.hoofRight);
    expect(ly).toBeGreaterThan(480);
    expect(lx).toBeLessThan(255);
    expect(ry).toBeLessThan(300);
    expect(rx).toBeGreaterThan(255);
    expect(t.body).toContain('translate(0 0)');
  });
});

describe('companionLook', () => {
  const box = { left: 100, top: 100, width: COMPANION_VIEW.w / 2, height: COMPANION_VIEW.h / 2 };

  it('is straight ahead at his eyes, and full stretch far to one side', () => {
    const ahead = companionLook(box, 100 + box.width / 2 - 0.5, 100 + (box.height * (281 - COMPANION_VIEW.y)) / COMPANION_VIEW.h);
    expect(Math.abs(ahead.x)).toBeLessThan(0.02);
    expect(Math.abs(ahead.y)).toBeLessThan(0.02);
    const right = companionLook(box, 5000, 100 + box.height / 2);
    expect(right.x).toBeGreaterThan(0.95);
    const below = companionLook(box, 100 + box.width / 2, 2000);
    expect(below.y).toBeGreaterThan(0.95);
  });
});
