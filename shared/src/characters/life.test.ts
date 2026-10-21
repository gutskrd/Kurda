import { describe, expect, it } from 'vitest';
import { VISEMES } from '../lipsync/visemes.js';
import {
  ACTS,
  CHARACTER_IDS,
  between,
  characterArt,
  cropBox,
  eyesFor,
  eyesMiddle,
  glanceTarget,
  keySteps,
  lookToward,
  pupilShift,
  sampleHold,
  sampleKeys,
  type Keys,
} from './index.js';

const TRACKS = ['earLeft', 'earRight', 'sniff', 'rise', 'stretch', 'tilt'] as const;

describe('the acts', () => {
  for (const [name, act] of Object.entries(ACTS)) {
    it(`${name}: every track runs from the start of the act to its end, in order, and comes back to rest`, () => {
      expect(act.ms).toBeGreaterThan(0);
      for (const track of TRACKS) {
        const keys = act[track];
        if (!keys) continue;
        expect(keys[0]?.[0], `${track} starts`).toBe(0);
        expect(keys[keys.length - 1]?.[0], `${track} ends`).toBe(1);
        for (let i = 1; i < keys.length; i++) expect(keys[i]![0], track).toBeGreaterThanOrEqual(keys[i - 1]![0]);
        // where it ends is where it rests, so nothing is left tilted or in the air
        const rest = track === 'sniff' || track === 'stretch' ? 1 : 0;
        expect(keys[keys.length - 1]?.[1], `${track} rests`).toBe(rest);
        expect(keys[0]?.[1] === rest || track.startsWith('ear'), `${track} begins at rest`).toBe(true);
      }
      for (const [from, to] of [...(act.eyes ?? []), ...(act.mouth ?? [])]) {
        expect(from).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThanOrEqual(1);
        expect(to).toBeGreaterThan(from);
      }
      for (const [, , v] of act.mouth ?? []) expect(VISEMES).toContain(v);
    });
  }

  it('never rises more than a small hop, nor tilts the head far', () => {
    for (const act of Object.values(ACTS)) {
      for (const [, v] of act.rise ?? []) expect(v).toBeLessThanOrEqual(0.08);
      for (const [, v] of act.tilt ?? []) expect(Math.abs(v)).toBeLessThanOrEqual(10);
      for (const [, v] of act.stretch ?? []) expect(Math.abs(v - 1)).toBeLessThanOrEqual(0.061);
    }
  });

  it('greets and cheers with smiling eyes, and meets a miss with no sad face', () => {
    expect(ACTS.greet.eyes?.some(([, , e]) => e === 'happy')).toBe(true);
    expect(ACTS.cheer.eyes?.some(([, , e]) => e === 'happy')).toBe(true);
    expect(ACTS.hmm.eyes?.every(([, , e]) => e === 'half' || e === 'closed')).toBe(true);
  });
});

describe('sampleKeys', () => {
  const keys: Keys = [
    [0, 0],
    [0.5, 10],
    [1, 0],
  ];

  it('is the key at a key, and eases between', () => {
    expect(sampleKeys(keys, 0)).toBe(0);
    expect(sampleKeys(keys, 0.5)).toBe(10);
    expect(sampleKeys(keys, 1)).toBe(0);
    expect(sampleKeys(keys, 0.25)).toBe(5);
    // slow off the mark
    expect(sampleKeys(keys, 0.05)).toBeLessThan(1);
  });

  it('holds the ends outside the act, and is 0 with no keys', () => {
    expect(sampleKeys(keys, -1)).toBe(0);
    expect(sampleKeys(keys, 2)).toBe(0);
    expect(sampleKeys([], 0.5)).toBe(0);
    expect(sampleKeys(keys, Number.NaN)).toBe(0);
  });
});

describe('keySteps', () => {
  it('turns a track into timed steps that add up to the act', () => {
    const steps = keySteps(ACTS.twitchLeft.earLeft!, ACTS.twitchLeft.ms);
    expect(steps.map((s) => s.to)).toEqual([-11, 5, -2, 0]);
    expect(steps.reduce((a, s) => a + s.ms, 0)).toBe(ACTS.twitchLeft.ms);
  });
});

describe('sampleHold', () => {
  it('says what is held inside a span, and nothing outside', () => {
    expect(sampleHold(ACTS.cheer.eyes, 0.5)).toBe('happy');
    expect(sampleHold(ACTS.cheer.eyes, 0.95)).toBeNull();
    expect(sampleHold(undefined, 0.5)).toBeNull();
  });
});

describe('looking', () => {
  const deer = characterArt('hevalo');
  const rig = deer.rig!;

  it('looks straight at something, further the further away it is', () => {
    expect(lookToward(0, 0, 100)).toEqual({ x: 0, y: 0 });
    expect(lookToward(50, 0, 100)).toEqual({ x: 0.5, y: 0 });
    const far = lookToward(300, 400, 100);
    expect(far.x).toBeCloseTo(0.6);
    expect(far.y).toBeCloseTo(0.8);
  });

  it('keeps each pupil inside its white, however far it looks', () => {
    for (let a = 0; a < 360; a += 15) {
      const look = { x: 2 * Math.cos((a * Math.PI) / 180), y: 2 * Math.sin((a * Math.PI) / 180) };
      const shift = pupilShift(deer, look, 1);
      for (const [pupil, moved] of [
        [rig.look.left, shift.left],
        [rig.look.right, shift.right],
      ] as const) {
        const x = pupil.rest.x + moved.x - pupil.centre.x;
        const y = pupil.rest.y + moved.y - pupil.centre.y;
        // the pupil's middle stays well inside the white's ellipse (53.4 by 60.6)
        expect((x / 53.4) ** 2 + (y / 60.6) ** 2).toBeLessThan(0.36);
      }
    }
  });

  it('leaves the pupils as drawn when it looks at nothing, and centres them when it looks', () => {
    expect(pupilShift(deer, { x: 0, y: 0 }, 0)).toEqual({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } });
    const ahead = pupilShift(deer, { x: 0, y: 0 }, 1);
    expect(rig.look.left.rest.x + ahead.left.x).toBe(rig.look.left.centre.x);
    expect(rig.look.right.rest.x + ahead.right.x).toBe(rig.look.right.centre.x);
  });

  it('moves no pupils on a character drawn without them', () => {
    expect(pupilShift(characterArt('hamo'), { x: 1, y: 0 }, 1)).toEqual({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } });
  });

  it('measures a look from between the eyes', () => {
    const middle = eyesMiddle(deer);
    expect(middle.x).toBeCloseTo((rig.look.left.centre.x + rig.look.right.centre.x) / 2);
    for (const id of CHARACTER_IDS) {
      const art = characterArt(id);
      const m = eyesMiddle(art);
      expect(m.y).toBeGreaterThan(art.bust.y);
      expect(m.y).toBeLessThan(art.bust.y + art.bust.h);
    }
  });

  it('glances somewhere within reach, a random time apart', () => {
    let i = 0;
    const values = [0, 1, 0.5, 0.25];
    const random = (): number => values[i++ % values.length]!;
    expect(glanceTarget(random)).toEqual({ x: -1, y: 0.6 });
    expect(between([1000, 2000], () => 0.5)).toBe(1500);
  });
});

describe('crops and eyes', () => {
  it('shows more of each character the larger the crop, all from the top of the head', () => {
    for (const id of CHARACTER_IDS) {
      const art = characterArt(id);
      const [bust, half, full] = (['bust', 'half', 'full'] as const).map((c) => cropBox(art, c));
      expect(bust!.h).toBeLessThan(half!.h);
      expect(half!.h).toBeLessThan(full!.h);
      expect(Math.abs(half!.y - full!.y)).toBeLessThanOrEqual(3);
    }
  });

  it('shuts the eyes for a half-blink on a character drawn without half-shut eyes', () => {
    const hamo = characterArt('hamo');
    expect(eyesFor(hamo, 'half')).toBe(hamo.eyes.closed);
    const deer = characterArt('hevalo');
    expect(eyesFor(deer, 'half')).toBe(deer.eyes.half);
    expect(eyesFor(deer, 'happy')).toBe(deer.eyes.happy);
  });
});
