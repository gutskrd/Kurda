import { describe, expect, it } from 'vitest';
import {
  COMPANION_DOZE_MS,
  COMPANION_EDGE,
  COMPANION_EYES,
  COMPANION_OVERHANG,
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

/** A frame of him sitting still, his forelegs over the sill. */
const sitting = (): CompanionFrame => ({
  hoofLeft: 0,
  hoofRight: 0,
  swingLeft: 0,
  swingRight: 0,
  earLeft: 0,
  earRight: 0,
  tilt: 0,
  rise: 0,
  stretch: 1,
  sniff: 1,
  enter: 0,
  lean: 0,
  turn: 0,
  sway: 0,
  look: { x: 0, y: 0 },
  focus: 0,
  eyes: ['open', 'open'],
  mouth: 'rest',
  emote: null,
  say: null,
  asleep: false,
  moving: false,
  wakeAt: null,
});

describe('companionSvg', () => {
  const playful = companionSvg({ prefix: 'one' });
  const calm = companionSvg({ prefix: 'two' });
  const ids = (svg: string): string[] => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);

  it('has a group for every moving part, every eye state and every sign', () => {
    for (const part of ['body', 'head', 'antler-left', 'antler-right', 'ear-left', 'ear-right', 'cheek-left', 'cheek-right', 'face', 'features', 'gaze', 'pupil-left', 'pupil-right', 'nose', 'legs', 'leg-left', 'leg-right', 'rim-left', 'cast-right', 'hoof-left', 'hoof-right', 'hoof-shadow-left', 'contact-left', 'shade', 'emotes']) {
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

  it('puts him behind the sill and his forelegs over it, in front of the card', () => {
    // his body is cut at the sill, his legs only well below it, where they may hang down the card
    const body = playful.indexOf('data-cp="body"');
    const legs = playful.indexOf('data-cp="legs"');
    expect(body).toBeGreaterThan(-1);
    expect(legs).toBeGreaterThan(body);
    expect(playful).toContain('clip-path="url(#one-edge)"><g data-cp="body"');
    expect(playful).toContain('clip-path="url(#one-legs)"><g data-cp="legs"');
    expect(playful).toContain('data-cp="leg-gate"');
    expect(playful).not.toContain('glasses');
  });

  it('draws each foreleg in the fur of his chest, so it grows out of his side, all of a piece from the shoulder to the hoof', () => {
    // one outline, filled as his chest is, shaded at its rim and casting a shadow, with the hoof on its end
    expect(playful).toMatch(/<path id="one-leg-left" data-cp="leg-left" d="M[^"]+Z"\/>/);
    expect(playful).toContain('<use href="#one-leg-left" fill="url(#one-fur)"/><use href="#one-leg-left" fill="url(#one-side)"/>');
    expect(playful).toContain('<clipPath id="one-in-left"><use href="#one-leg-left"/></clipPath>');
    expect(playful).toMatch(/<g data-cp="hoof-left" transform="translate\([^"]+\)">/);
    // drawn at rest before any frame: the same as a frame at rest
    const rest = companionTransforms(sitting());
    expect(playful).toContain(`data-cp="leg-left" d="${rest.legLeft}"`);
    expect(playful).toContain(`data-cp="hoof-right" transform="${rest.hoofRight}"`);
  });

  it('draws him from the chest up, as the mascot is, his face in layers that turn and kept inside its outline', () => {
    // the sill crosses his chest, under his shoulders: his neck and the top of the cream of his chest show
    expect(COMPANION_EDGE).toBeGreaterThan(COMPANION_EYES.y + 400);
    expect(playful).toMatch(/<g data-cp="head"><g data-cp="antler-left">.*<g data-cp="antler-right">.*<g data-cp="ear-left">.*<g data-cp="ear-right">.*<g data-cp="face">/);
    expect(playful).toMatch(/<g data-cp="face">.*<g clip-path="url\(#one-face\)"><g data-cp="features">.*<ellipse data-cp="cheek-left"/);
    // what turns most is inside what turns least
    const face = playful.indexOf('data-cp="face"');
    expect(playful.indexOf('data-cp="gaze"')).toBeGreaterThan(face);
    expect(playful.indexOf('data-cp="pupil-left"')).toBeGreaterThan(playful.indexOf('data-cp="gaze"'));
  });
});

describe('CompanionMotion', () => {
  it('turns his ears after his head, a moment later and on a little past it, before they settle with it', () => {
    for (const tone of ['playful', 'calm'] as const) {
      const m = settled(tone);
      m.set({ field: 'text' }, NOW);
      const frames = run(m, NOW, 1500, { pointer: null, caret: { x: 1, y: 0 } });
      // his head is most of the way round while his ears are still well behind it
      const turned = frames.find((f) => f.look.x > 0.8)!;
      expect(turned.sway, tone).toBeLessThan(turned.look.x - 0.2);
      expect(last(frames).sway, tone).toBeCloseTo(1, 2);
      if (tone === 'playful') expect(Math.max(...frames.map((f) => f.sway))).toBeGreaterThan(1.05);
    }
  });

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
    expect(peeking.hoofRight).toBeCloseTo(0.8, 2);
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

  it('climbs up from behind the sill as he arrives, his forelegs lifted, then lays them over it', () => {
    const m = new CompanionMotion('playful', () => 0.5);
    m.arrive(0);
    const frames = run(m, 0, 2000);
    expect(frames[0]!.enter).toBeCloseTo(1, 2);
    // a pop: a little past the sill, then settled on it
    expect(Math.min(...frames.map((f) => f.enter))).toBeLessThan(0);
    expect(last(frames).enter).toBeCloseTo(0, 3);
    expect(Math.max(...frames.slice(0, 40).map((f) => f.hoofLeft))).toBeGreaterThan(0.3);
    expect(last(frames).hoofLeft).toBeCloseTo(0, 2);
    // the console's comes up with a smaller bounce
    const c = new CompanionMotion('calm', () => 0.5);
    c.arrive(0);
    const calm = run(c, 0, 2000);
    expect(Math.min(...calm.map((f) => f.enter))).toBeLessThan(0);
    expect(Math.min(...calm.map((f) => f.enter))).toBeGreaterThan(Math.min(...frames.map((f) => f.enter)));
    expect(last(calm).enter).toBeCloseTo(0, 3);
    expect(last(calm).hoofLeft).toBeCloseTo(0, 2);
    // in both, his forelegs stay lifted until he is all the way up
    for (const f of [...frames, ...calm]) if (f.enter > 0.05) expect(f.hoofLeft).toBeGreaterThan(0.3);
    // and for whoever asks for less motion he is simply there
    const s = new CompanionMotion('playful', () => 0.5);
    s.arrive(0);
    expect(s.step(16, NONE, true).enter).toBe(0);
  });

  it('keeps his forelegs lifted until he is up, however late the page draws him', () => {
    const m = new CompanionMotion('playful', () => 0.5);
    m.arrive(0);
    // the page busy for a second and a half before it draws him, then drawing a frame every 200 ms
    let f = m.step(1500);
    for (let t = 1700; f.enter > 0.05; t += 200) {
      expect(f.hoofLeft).toBeGreaterThan(0.3);
      f = m.step(t);
    }
    expect(last(run(m, 4000, 2000)).hoofLeft).toBeCloseTo(0, 2);
  });

  it('lays his forelegs down as soon as he is up, drawn only while he moves', () => {
    const m = new CompanionMotion('playful', () => 0.5);
    m.arrive(0);
    // a busy page: a frame, another, and then nothing for a second, by which time he is all the way up
    m.step(0);
    m.step(200);
    let t = 1200;
    let f = m.step(t);
    expect(f.enter).toBe(0);
    // from there, as the player draws him: every frame while he moves, and then not until he is next due to
    while (t < 2000) {
      t = f.moving ? t + 16 : (f.wakeAt ?? Infinity);
      if (t >= 2000) break;
      f = m.step(t);
    }
    expect(f.hoofLeft).toBeLessThan(0.02);
  });

  it('comes up as far on a page drawing a few frames a second as on one drawing sixty', () => {
    const smooth = new CompanionMotion('calm', () => 0.5);
    const slow = new CompanionMotion('calm', () => 0.5);
    smooth.arrive(0);
    slow.arrive(0);
    run(smooth, 0, 400);
    let f = slow.step(0);
    for (let t = 200; t <= 400; t += 200) f = slow.step(t);
    expect(f.enter).toBeCloseTo(smooth.step(400).enter, 1);
    expect(f.hoofLeft).toBeCloseTo(smooth.step(400).hoofLeft, 1);
  });

  it('leans in to each key, his mouth round as he watches, and grins and nods at an address that looks whole', () => {
    const m = settled();
    m.set({ field: 'text' }, NOW);
    run(m, NOW, 800);
    m.react('keystroke', NOW + 810);
    const typing = run(m, NOW + 810, 200);
    expect(Math.max(...typing.map((f) => f.lean))).toBeGreaterThan(0.2);
    expect(typing.every((f) => f.mouth === 'o')).toBe(true);
    // a little after the last key he sits back, his mouth at rest
    const after = last(run(m, NOW + 1020, 1200));
    expect(Math.abs(after.lean)).toBeLessThan(0.01);
    expect(after.mouth).toBe('rest');
    m.react('approve', NOW + 2300);
    expect(run(m, NOW + 2300, 600).some((f) => f.mouth === 'i')).toBe(true);
    // never with his eyes covered
    const s = settled();
    s.set({ field: 'secret' }, NOW);
    run(s, NOW, 1200);
    s.react('keystroke', NOW + 1210);
    expect(run(s, NOW + 1210, 300).every((f) => f.lean === 0 && f.mouth === 'mbp')).toBe(true);
  });

  it('shakes his head at a mistake before he wonders at it', () => {
    const m = settled('calm');
    m.set({ status: 'error' }, NOW);
    const turns = run(m, NOW, 700).map((f) => f.turn);
    expect(Math.min(...turns)).toBeLessThan(-0.4);
    expect(Math.max(...turns)).toBeGreaterThan(0.4);
    expect(last(run(m, NOW + 700, 1200)).turn).toBe(0);
  });

  it('lifts his hooves up by his cheeks as he gets in', () => {
    const m = settled('calm');
    m.set({ status: 'success' }, NOW);
    const f = last(run(m, NOW, 900));
    expect(f.hoofLeft).toBeGreaterThan(0.4);
    expect(f.hoofLeft).toBeLessThan(0.8);
    expect(f.eyes).toEqual(['happy', 'happy']);
  });

  it('swings what hangs from each knee a moment after it, on past and back, as legs do', () => {
    const m = settled();
    m.set({ field: 'secret' }, NOW);
    const lifting = run(m, NOW, 1500);
    // the knee leads, the hoof follows
    expect(lifting.slice(2, 12).every((f) => f.swingLeft < f.hoofLeft)).toBe(true);
    // and swings past before it settles
    expect(Math.max(...lifting.map((f) => f.swingLeft))).toBeGreaterThan(1.02);
    expect(last(lifting).swingLeft).toBeCloseTo(1, 2);
    // the console's swing less
    const c = settled('calm');
    c.set({ field: 'secret' }, NOW);
    const calm = run(c, NOW, 1500);
    expect(Math.max(...calm.map((f) => f.swingLeft))).toBeLessThan(Math.max(...lifting.map((f) => f.swingLeft)));
    // for whoever asks for less motion, straight there
    const s = settled();
    s.set({ field: 'secret' }, NOW);
    expect(s.step(NOW + 16, NONE, true).swingLeft).toBe(1);
  });

  it('sets a hanging hoof swinging with each key, one and then the other, the knees staying on the sill', () => {
    const m = settled();
    m.set({ field: 'text' }, NOW);
    // long enough for any idle swing to have settled: typing, none starts
    run(m, NOW, 3000);
    expect(m.step(NOW + 3000).swingLeft).toBe(0);
    const swings = (frames: CompanionFrame[]): [number, number] => [
      Math.max(...frames.map((f) => Math.abs(f.swingLeft))),
      Math.max(...frames.map((f) => Math.abs(f.swingRight))),
    ];
    m.react('keystroke', NOW + 3010);
    const one = run(m, NOW + 3010, 300);
    const [left, right] = swings(one);
    expect(Math.max(left, right)).toBeGreaterThan(0.04);
    expect(Math.min(left, right)).toBeLessThan(0.001);
    expect(one.every((f) => f.hoofLeft === 0 && f.hoofRight === 0)).toBe(true);
    // the next key, the other
    run(m, NOW + 3310, 1500);
    m.react('keystroke', NOW + 4900);
    const [nextLeft, nextRight] = swings(run(m, NOW + 4900, 300));
    expect(left > right ? nextRight : nextLeft).toBeGreaterThan(0.04);
  });

  it('stamps a hoof at a mistake, as a deer does', () => {
    const m = settled('calm');
    m.set({ status: 'error' }, NOW);
    const frames = run(m, NOW, 1200);
    const lift = Math.max(...frames.map((f) => Math.max(f.hoofLeft, f.hoofRight)));
    expect(lift).toBeGreaterThan(0.08);
    expect(lift).toBeLessThan(0.3);
    expect(Math.max(last(frames).hoofLeft, last(frames).hoofRight)).toBeLessThan(0.01);
  });

  it('swings a hanging hoof idly now and then, in the console too, the knees staying on the sill', () => {
    for (const tone of ['playful', 'calm'] as const) {
      const frames = run(settled(tone), NOW, 40_000);
      expect(Math.max(...frames.map((f) => Math.max(Math.abs(f.swingLeft), Math.abs(f.swingRight))))).toBeGreaterThan(0.03);
      if (tone === 'calm') expect(frames.every((f) => f.hoofLeft === 0 && f.hoofRight === 0)).toBe(true);
    }
  });

  it('paws at the sill now and then on the website, and not in the console', () => {
    const lifts = (tone: CompanionTone): number => {
      const m = settled(tone);
      return Math.max(...run(m, NOW, 30_000).map((f) => Math.max(f.hoofLeft, f.hoofRight)));
    };
    expect(lifts('playful')).toBeGreaterThan(0.08);
    expect(lifts('calm')).toBeLessThan(0.01);
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

  /** A frame of him sitting still: one hoof over its eye, the other on the sill. */
  const frame = (): CompanionFrame => ({ ...sitting(), hoofRight: 1, swingRight: 1 });

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

  it('hangs each leg from its shoulder in his chest over the sill and down the card, and folds it up from a lifted knee over its own eye', () => {
    const t = companionTransforms(frame());
    const ys = (d: string): number[] => numbers(d).filter((_, i) => i % 2 === 1);
    const xs = (d: string): number[] => numbers(d).filter((_, i) => i % 2 === 0);
    const points = (d: string): string => d.replace(/A[^A-Z]*?(?=[A-Z]|$)/g, (arc) => `L${arc.trim().split(/[ ,]+/).slice(-2).join(',')}`);
    const left = points(t.legLeft);
    const right = points(t.legRight);
    // at rest: from the side of his chest, under his chin and over the sill, down the card's face, on his left
    expect(Math.min(...ys(left))).toBeGreaterThan(COMPANION_EYES.y + 280);
    expect(Math.min(...ys(left))).toBeLessThan(COMPANION_EDGE - 80);
    expect(Math.max(...ys(left))).toBeGreaterThan(COMPANION_EDGE + 60);
    expect(Math.max(...ys(left))).toBeLessThan(COMPANION_EDGE + COMPANION_OVERHANG);
    expect(Math.max(...xs(left))).toBeLessThan(200);
    const [lx, ly, lturn, lsize, lhoof] = numbers(t.hoofLeft);
    expect(ly).toBeGreaterThan(COMPANION_EDGE + 60);
    expect(lx).toBeLessThan(200);
    expect(Math.abs(lturn!)).toBeLessThan(5);
    expect(lhoof).toBe(lsize);
    // its toe, and the toe's shadow, inside the room the card keeps for them, as it hangs and as it swings
    for (const f of [frame(), { ...frame(), swingLeft: -0.3 }, { ...frame(), swingLeft: 0.2 }]) {
      const at = companionTransforms(f);
      expect(apply(at.hoofLeft, { x: 0, y: 66 }).y).toBeLessThan(COMPANION_EDGE + COMPANION_OVERHANG - 8);
      expect(apply(at.hoofShadowLeft, { x: 0, y: 65 }).y).toBeLessThan(COMPANION_EDGE + COMPANION_OVERHANG);
    }
    expect(t.contactLeft).toMatch(/scale\(1\)$/);
    // its shadow starts down the forearm, none round the shoulder
    expect(Math.min(...ys(points(t.castLeft)))).toBeGreaterThan(Math.min(...ys(left)) + 30);
    // over the eye: the hoof turned up over it from a lifted knee, nearer to us, and nothing of the leg below the sill
    const [rx, ry, rturn, rsize] = numbers(t.hoofRight);
    expect(rx).toBeGreaterThan(255);
    expect(Math.abs(ry! - COMPANION_EYES.y)).toBeLessThan(70);
    expect(Math.abs(rturn!)).toBeGreaterThan(170);
    expect(rsize).toBeGreaterThan(lsize!);
    expect(Math.max(...ys(right))).toBeLessThan(COMPANION_EDGE - 40);
    expect(Math.min(...xs(right))).toBeGreaterThan(255);
    expect(t.contactRight).toMatch(/scale\(0\)$/);
    expect(t.body).toContain('translate(0 0)');
  });

  it('throws his shadow on the card where he leans on it: none while he is still coming up, smaller as he hops off it', () => {
    const scale = (s: string): number[] => numbers(/scale\(([^)]*)\)/.exec(s)?.[1] ?? '');
    expect(scale(companionTransforms(sitting()).shade)).toEqual([1, 1]);
    expect(scale(companionTransforms({ ...sitting(), enter: 1 }).shade)).toEqual([0, 0]);
    const [wide, deep] = scale(companionTransforms({ ...sitting(), rise: 0.07 }).shade);
    expect(deep).toBeLessThan(0.8);
    expect(wide).toBeGreaterThan(deep!);
    // and each hoof's on the card, down and to the right of it
    const t = companionTransforms(sitting());
    expect(t.hoofShadowLeft).toBe(`translate(6 10) ${t.hoofLeft}`);
  });

  it('swings a hanging hoof out from the face past rest, the knee staying on the sill', () => {
    const rest = companionTransforms(sitting());
    const swung = companionTransforms({ ...sitting(), swingLeft: -0.2 });
    expect(numbers(swung.hoofLeft)[2]).toBeGreaterThan(numbers(rest.hoofLeft)[2]! + 10);
    expect(numbers(swung.hoofLeft)[0]).toBeLessThan(numbers(rest.hoofLeft)[0]!);
    expect(swung.contactLeft).toBe(rest.contactLeft);
    expect(swung.legRight).toBe(rest.legRight);
  });

  /** Where `p` goes under an SVG transform of translates, scales, rotations and skews. */
  const apply = (transform: string, p: { x: number; y: number }): { x: number; y: number } => {
    const steps = [...transform.matchAll(/(translate|scale|rotate|skewX)\(([^)]*)\)/g)].map((m) => [m[1]!, m[2]!.split(/[ ,]+/).map(Number)] as const);
    let { x, y } = p;
    for (const [op, a] of steps.reverse()) {
      if (op === 'translate') {
        x += a[0]!;
        y += a[1] ?? 0;
      } else if (op === 'scale') {
        x *= a[0]!;
        y *= a[1] ?? a[0]!;
      } else if (op === 'skewX') {
        x += y * Math.tan((a[0]! * Math.PI) / 180);
      } else {
        const r = (a[0]! * Math.PI) / 180;
        const [cx = 0, cy = 0] = a.slice(1);
        [x, y] = [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)];
      }
    }
    return { x, y };
  };

  it('turns his head in the round towards where he looks: what is on his face furthest, and nearer as he leans in', () => {
    const base = companionTransforms({ ...frame(), look: { x: 0, y: 0 } });
    const right = companionTransforms({ ...frame(), look: { x: 1, y: 0 }, sway: 1 });
    const eye = { x: COMPANION_EYES.x, y: COMPANION_EYES.y };
    // the face's outline comes round a little at his eyes, what is on it a good deal further
    expect(apply(base.face, eye).x).toBeCloseTo(eye.x, 5);
    const outline = apply(right.face, eye).x - eye.x;
    expect(outline).toBeGreaterThan(0);
    expect(apply(right.face, apply(right.features, eye)).x - eye.x).toBeGreaterThan(outline * 3);
    expect(right.gaze).toBe(right.features);
    // the side turning away is in shade, the other not
    expect(right.cheekRight).not.toBe(base.cheekRight);
    expect(right.cheekLeft).toBe(base.cheekLeft);
    // a shake turns it as a look does
    expect(companionTransforms({ ...frame(), turn: 1, sway: 1 }).face).toBe(right.face);
    expect(companionTransforms({ ...frame(), lean: 1 }).head).toMatch(/scale\(1\.0[5-9]/);
  });

  it('keeps each ear on his head however far he turns it, its foot never coming out from under the outline, even as the ear swings on after a turn', () => {
    // the cut foot of the left ear, under his head as drawn, and how far in from its outline (the right's is its mirror)
    const foot = [
      { x: 118, y: 236, under: 15 },
      { x: 128, y: 210, under: 14.9 },
      { x: 138, y: 185, under: 7 },
    ];
    for (const turn of [-1.3, -1, -0.5, 0.5, 1, 1.3]) {
      for (const sway of [turn, 0, -turn]) {
        const t = companionTransforms({ ...frame(), turn, sway });
        for (const p of foot) {
          // how far each point has come out, beyond where the outline beside it has gone
          const left = apply(t.earLeft, p);
          expect(p.x - (left.x - (apply(t.face, left).x - left.x)), `left ${turn} ${sway}`).toBeLessThan(p.under - 2);
          const q = { x: 510 - p.x, y: p.y };
          const right = apply(t.earRight, q);
          expect(right.x - (apply(t.face, right).x - right.x) - q.x, `right ${turn} ${sway}`).toBeLessThan(p.under - 2);
        }
      }
    }
  });

  it('turns the ears and the antlers as a head in the round does: the one on the side he turns to narrower and round behind, the other wider, their tips swinging the other way', () => {
    const wide = (s: string): number => numbers(/scale\(([^)]*)\)/.exec(s)?.[1] ?? '')[0]!;
    const rest = companionTransforms(frame());
    const right = companionTransforms({ ...frame(), look: { x: 1, y: 0 }, sway: 1 });
    expect(wide(rest.antlerLeft)).toBe(1);
    expect(wide(rest.earRight)).toBe(1);
    expect(wide(right.antlerRight)).toBeLessThan(0.95);
    expect(wide(right.antlerLeft)).toBeGreaterThan(1);
    expect(wide(right.earRight)).toBeLessThan(0.9);
    expect(wide(right.earLeft)).toBeGreaterThan(1);
    // an antler's tip, high above its foot, goes the other way from the face
    const foot = { x: 179.8, y: 160 };
    const tip = { x: 96, y: 2 };
    expect(apply(right.antlerLeft, tip).x - apply(right.antlerLeft, foot).x).toBeLessThan(tip.x - foot.x - 10);
    // looking up, the antlers tip back with his head and are seen shorter
    const up = companionTransforms({ ...frame(), look: { x: 0, y: -1 } });
    expect(numbers(/scale\(([^)]*)\)/.exec(up.antlerLeft)?.[1] ?? '')[1]).toBeLessThan(1);
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
