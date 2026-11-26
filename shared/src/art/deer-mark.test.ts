import { describe, expect, it } from 'vitest';
import {
  DEER_BREATH_LOW,
  DEER_CURL_STEPS,
  DEER_LOOP_MS,
  DEER_LOOP_TURNS,
  DEER_MARK_VIEW,
  deerBreathAt,
  deerCurlKeyframes,
  deerCurlOutline,
  deerCurlPath,
  deerEyesOpen,
  deerFormKey,
  deerFormOutline,
  deerFormPath,
  deerLoopAt,
  deerLoopTrack,
  deerMarkPath,
  deerMarkTracedPath,
  type DeerLoopPose,
} from './deer-mark.js';

/** His middle, about which the redrawn antlers are mirrored, as the trace has it. */
const AXIS = 51;

/** Where each antler is, with room round it: everything outside these is the owner's drawing as traced. */
const ANTLER_ZONES = [
  { x: [17, 47], y: [2, 33] },
  { x: [55, 85], y: [2, 33] },
] as const;

const inZone = ([x, y]: Pt): boolean => ANTLER_ZONES.some((z) => x >= z.x[0] && x <= z.x[1] && y >= z.y[0] && y <= z.y[1]);

type Pt = [number, number];

/** A path's subpaths as lists of cubic segments, failing on anything but M, C and Z. */
function parse(d: string): Pt[][][] {
  expect(d).toMatch(/^(M[-\d. ]+(C[-\d. ]+)+Z)+$/);
  return d
    .split('Z')
    .filter(Boolean)
    .map((sub) => {
      const nums = sub.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
      let at: Pt = [nums[0] as number, nums[1] as number];
      const segs: Pt[][] = [];
      for (let i = 2; i + 5 < nums.length + 1; i += 6) {
        const point = (j: number): Pt => [nums[i + j] as number, nums[i + j + 1] as number];
        const seg: Pt[] = [at, point(0), point(2), point(4)];
        segs.push(seg);
        at = seg[3] as Pt;
      }
      return segs;
    });
}

function sample(segs: Pt[][], per = 12): Pt[] {
  const out: Pt[] = [];
  for (const [a, b, c, d] of segs as [Pt, Pt, Pt, Pt][]) {
    for (let i = 0; i < per; i++) {
      const t = i / per;
      const m = 1 - t;
      const w = [m * m * m, 3 * m * m * t, 3 * m * t * t, t * t * t] as const;
      out.push([w[0] * a[0] + w[1] * b[0] + w[2] * c[0] + w[3] * d[0], w[0] * a[1] + w[1] * b[1] + w[2] * c[1] + w[3] * d[1]]);
    }
  }
  return out;
}

/** The farthest any point moves between two matched lists of control points. */
function farthest(a: Float64Array, b: Float64Array): number {
  let most = 0;
  for (let i = 0; i < a.length; i += 2) most = Math.max(most, Math.hypot((b[i] as number) - (a[i] as number), (b[i + 1] as number) - (a[i + 1] as number)));
  return most;
}

function area(points: Pt[]): number {
  let s = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length] as Pt;
    s += p[0] * q[1] - q[0] * p[1];
  });
  return s / 2;
}

/** Where a point of the square lands once the pose's turn is applied about its middle. */
function posed(p: Pt, pose: DeerLoopPose): Pt {
  const a = (pose.turn * Math.PI) / 180;
  const x = p[0] - 50;
  const y = p[1] - 50;
  return [50 + x * Math.cos(a) - y * Math.sin(a), 50 + x * Math.sin(a) + y * Math.cos(a)];
}

/** The loop at 60 frames a second, its last frame the first whole turns on. */
function frames(): DeerLoopPose[] {
  const count = Math.round((DEER_LOOP_MS / 1000) * 60);
  return Array.from({ length: count + 1 }, (_, f) => (f === count ? { ...deerLoopAt(0), turn: 360 * DEER_LOOP_TURNS } : deerLoopAt(f / count)));
}

/** Whether a closed outline, drawn finely, never crosses itself. */
function simple(outline: Float64Array): boolean {
  const pts: Pt[] = [];
  for (let i = 0; i < outline.length; i += 6) {
    const j = (i + 6) % outline.length;
    const seg: [Pt, Pt, Pt, Pt] = [
      [outline[i] as number, outline[i + 1] as number],
      [outline[i + 2] as number, outline[i + 3] as number],
      [outline[i + 4] as number, outline[i + 5] as number],
      [outline[j] as number, outline[j + 1] as number],
    ];
    pts.push(...sample([seg], 6));
  }
  const cross = (o: Pt, a: Pt, b: Pt): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i] as Pt;
    const b = pts[(i + 1) % n] as Pt;
    for (let k = i + 2; k < (i === 0 ? n - 1 : n); k++) {
      const c = pts[k] as Pt;
      const d = pts[(k + 1) % n] as Pt;
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return false;
    }
  }
  return true;
}

describe('the deer mark', () => {
  it('is one compound path: his outline and his two eyes, each closed, all inside the square', () => {
    const subpaths = parse(deerMarkPath());
    expect(subpaths).toHaveLength(3);
    expect(subpaths.slice(1).map((s) => s.length)).toEqual([4, 4]);
    for (const segs of subpaths) {
      for (const p of segs.flat()) {
        expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
        expect(Math.min(...p)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...p)).toBeLessThanOrEqual(DEER_MARK_VIEW);
      }
    }
    expect(parse(deerMarkPath({ small: true }))).toHaveLength(1);
  });

  it('is the owner’s drawing as traced everywhere but the antlers, his eyes included', () => {
    const now = parse(deerMarkPath());
    const traced = parse(deerMarkTracedPath());
    // Points along each outline, and each outline as a fine polyline to measure against.
    const a = sample(now[0] as Pt[][], 20);
    const b = sample(traced[0] as Pt[][], 20);
    const fineA = sample(now[0] as Pt[][], 50);
    const fineB = sample(traced[0] as Pt[][], 50);
    const gap = (p: Pt, line: Pt[]): number => {
      let best = Infinity;
      for (let i = 0; i < line.length; i++) {
        const [q, r] = [line[i] as Pt, line[(i + 1) % line.length] as Pt];
        const dx = r[0] - q[0];
        const dy = r[1] - q[1];
        const t = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(p[0] - q[0] - dx * t, p[1] - q[1] - dy * t));
      }
      return best;
    };
    // Every point of either outline away from the other is at an antler, and most of him is untouched.
    const moved = a.map((p) => gap(p, fineB) > 0.03);
    a.forEach((p, i) => moved[i] && expect(inZone(p), `${p}`).toBe(true));
    for (const p of b.filter((q) => gap(q, fineA) > 0.03)) expect(inZone(p), `${p}`).toBe(true);
    // By length, what changed is under half his outline: the antlers, three tines a side, and nothing more.
    let changed = 0;
    let whole = 0;
    a.forEach((p, i) => {
      const q = a[(i + 1) % a.length] as Pt;
      const step = Math.hypot(q[0] - p[0], q[1] - p[1]);
      whole += step;
      if (moved[i]) changed += step;
    });
    expect(changed / whole).toBeLessThan(0.5);
    expect(now.slice(1)).toEqual(traced.slice(1));
  });

  it('has antlers after Hevalo’s, mirrored about his middle and well inside the square, three tines whole and one small', () => {
    for (const small of [false, true]) {
      const points = sample(parse(deerMarkPath({ small }))[0] as Pt[][], 40).filter(([, y]) => y < 22);
      const left = points.filter(([x]) => x < AXIS);
      const right = points.filter(([x]) => x > AXIS);
      const gap = (p: Pt, set: Pt[]): number => Math.min(...set.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
      for (const [x, y] of left) expect(gap([2 * AXIS - x, y], right)).toBeLessThan(0.25);
      for (const [x, y] of right) expect(gap([2 * AXIS - x, y], left)).toBeLessThan(0.25);
      expect(Math.min(...points.map(([, y]) => y))).toBeGreaterThan(4);
      expect(Math.min(...points.map(([x]) => x))).toBeGreaterThan(15);
      expect(Math.max(...points.map(([x]) => x))).toBeLessThan(DEER_MARK_VIEW - 15);
      // Tips are where the outline turns back down: on each side, the beam's own and its tines'.
      const tips = (side: Pt[]): number =>
        side.filter((p, i) => i > 3 && i < side.length - 4 && side.slice(i - 4, i + 5).every((q) => q[1] >= p[1])).length;
      expect([tips(left), tips(right)]).toEqual(small ? [2, 2] : [3, 3]);
    }
  });

  it('cuts his eyes out under a nonzero fill: they wind the other way round from his outline', () => {
    const [outline, ...eyes] = parse(deerMarkPath()).map((s) => area(sample(s)));
    expect(outline).toBeGreaterThan(0);
    for (const eye of eyes) expect(eye).toBeLessThan(0);
  });

  it('stands centred in the square, 88 units tall, as traced', () => {
    const points = sample(parse(deerMarkPath())[0] as Pt[][], 24);
    const ys = points.map((p) => p[1]);
    const xs = points.map((p) => p[0]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(88, 0);
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(50, 0);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(50, 0);
  });
});

describe('the curl', () => {
  it('morphs between shapes matched point for point, from the traced deer to a round ball', () => {
    const { outline, eyes } = deerCurlKeyframes();
    expect(outline.length).toBeGreaterThanOrEqual(3);
    for (const key of outline) expect(key.length).toBe(96 * 6);
    for (const eye of eyes) expect(eye.length).toBe(8 * 6);
    // The first keyframe is the trace itself, only cut finer.
    const traced = sample(parse(deerMarkPath())[0] as Pt[][], 200);
    const first = outline[0] as Float64Array;
    for (let i = 0; i < first.length; i += 6) {
      const gap = Math.min(...traced.map((p) => Math.hypot(p[0] - (first[i] as number), p[1] - (first[i + 1] as number))));
      expect(gap).toBeLessThan(0.15);
    }
    // The last is a ball of radius 32 about the middle, but for his crescent wound in as a seam.
    const last = outline[outline.length - 1] as Float64Array;
    const radii: number[] = [];
    for (let i = 0; i < last.length; i += 6) radii.push(Math.hypot((last[i] as number) - 50, (last[i + 1] as number) - 50));
    expect(radii.filter((r) => Math.abs(r - 32) < 0.3).length).toBeGreaterThanOrEqual(70);
    expect(Math.max(...radii)).toBeLessThan(32.3);
  });

  it('keeps its outline’s structure all the way and closes his eyes early on', () => {
    for (let c = 0.02; c <= 1; c += 0.02) {
      const subpaths = parse(deerCurlPath(c));
      expect(subpaths[0]).toHaveLength(96);
      expect(subpaths.length).toBe(deerEyesOpen(c) > 0 ? 3 : 1);
      if (c >= 0.15) expect(subpaths).toHaveLength(1);
    }
    expect(parse(deerCurlPath(0.5, { small: true }))).toHaveLength(1);
  });

  it('is exactly the mark when not curled at all', () => {
    expect(deerCurlPath(0)).toBe(deerMarkPath());
    expect(deerCurlPath(0, { small: true })).toBe(deerMarkPath({ small: true }));
  });
});

describe('the loop', () => {
  it('lasts about two seconds', () => {
    expect(DEER_LOOP_MS).toBeGreaterThanOrEqual(1800);
    expect(DEER_LOOP_MS).toBeLessThanOrEqual(2400);
  });

  it('closes on its first frame: the deer, upright', () => {
    const first = deerLoopAt(0);
    expect(first).toMatchObject({ curl: 0, open: 0, turn: 0 });
    const last = deerLoopAt(1 - 1e-9);
    expect([last.curl, last.open]).toEqual([0, 0]);
    expect(last.turn).toBeCloseTo(360 * DEER_LOOP_TURNS, 6);
    expect(deerFormPath(first)).toBe(deerMarkPath());
    expect(deerFormPath(last)).toBe(deerMarkPath());
    const { at, poses } = deerLoopTrack(30);
    expect([at[0], at[at.length - 1]]).toEqual([0, 1]);
    // A table of it ends where it began, whole turns on, and never turns back between two of its moments.
    expect(poses[poses.length - 1]).toEqual({ ...poses[0], turn: 360 * DEER_LOOP_TURNS });
    poses.slice(1).forEach((pose, i) => expect(pose.turn).toBeGreaterThanOrEqual((poses[i] as DeerLoopPose).turn));
  });

  it('moves without a jump anywhere, the seam between loops included', () => {
    let prev = deerLoopAt(0);
    for (let ms = 1; ms <= 2 * DEER_LOOP_MS; ms++) {
      const pose = deerLoopAt(ms / DEER_LOOP_MS);
      expect(Math.abs(pose.curl - prev.curl)).toBeLessThan(0.02);
      expect(Math.abs(pose.open - prev.open)).toBeLessThan(0.02);
      expect(Math.abs(pose.arc - prev.arc)).toBeLessThan(1);
      const turned = (((pose.turn - prev.turn) % 360) + 540) % 360 - 180;
      expect(turned).toBeGreaterThanOrEqual(0);
      expect(turned).toBeLessThan(1);
      prev = pose;
    }
  });

  it('turns smoothly: never back, never stalling while he moves, and its speed never jumps from one frame to the next', () => {
    const poses = frames();
    const steps = poses.slice(1).map((p, i) => p.turn - (poses[i] as DeerLoopPose).turn);
    const first = poses.findIndex((p) => p.curl > 0);
    const last = poses.length - 1 - [...poses].reverse().findIndex((p) => p.curl > 0);
    steps.forEach((step, f) => {
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThan(10);
      // Turning the whole time he is moving, from his first curl to the last of the way out.
      if (f >= first && f < last - 1) expect(step).toBeGreaterThan(0);
    });
    // The speed changes by under half a degree a frame, about a twentieth of its cruise.
    steps.slice(1).forEach((step, f) => expect(Math.abs(step - (steps[f] as number))).toBeLessThan(0.5));
    expect(poses[poses.length - 1]?.turn).toBe(360 * DEER_LOOP_TURNS);
  });

  it('opens into a thick round-capped ring that sweeps like a spinner, both ends always moving on clockwise', () => {
    const poses = frames();
    const sweep = poses.filter((p) => p.open === 1);
    expect(sweep.length).toBeGreaterThan(20);
    const arcs = sweep.map((p) => p.arc);
    // From nearly whole, its trailing end catches up and its leading end runs on again.
    expect(Math.max(...arcs)).toBeCloseTo(300, 0);
    expect(Math.min(...arcs)).toBeLessThan(180);
    const ring = deerFormOutline(sweep[Math.floor(sweep.length / 2)] as DeerLoopPose);
    for (let i = 0; i < ring.length; i += 6) {
      const r = Math.hypot((ring[i] as number) - 50, (ring[i + 1] as number) - 50);
      expect(r).toBeGreaterThan(18.5);
      expect(r).toBeLessThan(32.5);
    }
    // Each end's angle on the page is the turn plus where it sits on the ring: it never stops or slips back.
    const gap = 25;
    for (let f = 1; f < sweep.length; f++) {
      const [a, b] = [sweep[f - 1] as DeerLoopPose, sweep[f] as DeerLoopPose];
      expect(b.turn + b.arc / 2 - (a.turn + a.arc / 2)).toBeGreaterThan(1);
      expect(b.turn - b.arc / 2 - (a.turn - a.arc / 2)).toBeGreaterThan(1);
      expect(gap).toBe(25);
    }
  });

  it('opens and closes without the outline ever crossing itself, whole and small', () => {
    for (const small of [false, true]) {
      for (const open of [0.125, 0.25, 0.5, 0.75, 1]) expect(simple(deerFormOutline({ curl: 1, open, arc: 300, turn: 0 }, { small }))).toBe(true);
      for (const arc of [165, 230, 300]) expect(simple(deerFormOutline({ curl: 1, open: 1, arc, turn: 0 }, { small }))).toBe(true);
    }
  });

  it('spins back out of the ring: a good part of the turn is still to come as he starts to unfurl', () => {
    const poses = frames();
    const swept = poses.findIndex((p) => p.open === 1);
    const unfurling = poses.findIndex((p, f) => f > swept && p.curl < 1);
    expect(unfurling).toBeGreaterThan(swept);
    expect(360 * DEER_LOOP_TURNS - (poses[unfurling] as DeerLoopPose).turn).toBeGreaterThan(120);
  });

  it('never pops on the way back: every point and his eyes move a little at a time', () => {
    const poses = frames();
    const swept = poses.length - 1 - [...poses].reverse().findIndex((p) => p.open === 1);
    let back = 0;
    for (let f = swept + 1; f < poses.length; f++) {
      const [prev, pose] = [poses[f - 1] as DeerLoopPose, poses[f] as DeerLoopPose];
      if (deerFormKey(prev) === deerFormKey(pose)) continue;
      back++;
      for (const small of [false, true]) {
        const moved = farthest(deerFormOutline(prev, { small }), deerFormOutline(pose, { small }));
        // Under three units of the square a frame (three and a half pixels at 120); the antlers and ears, last, under one.
        expect(moved).toBeLessThan(3);
        if (pose.curl < 0.2) expect(moved).toBeLessThan(1);
      }
      // His eyes take several frames to open.
      expect(deerEyesOpen(pose.curl) - deerEyesOpen(prev.curl)).toBeLessThan(0.2);
    }
    expect(back).toBeGreaterThan(30);
    // Where an app draws the curl in steps, neighbouring steps differ by less than half a unit anywhere.
    for (const small of [false, true]) {
      let step = deerCurlOutline(0, { small });
      for (let k = 1; k <= DEER_CURL_STEPS; k++) {
        const next = deerCurlOutline(k / DEER_CURL_STEPS, { small });
        expect(farthest(step, next)).toBeLessThan(0.5);
        step = next;
      }
    }
  });

  it('stays inside its square in every frame', () => {
    for (const pose of frames()) {
      // A curve stays within its control points, so these bound it.
      for (const p of parse(deerFormPath(pose)).flat(2)) {
        const [x, y] = posed(p, pose);
        expect(Math.min(x, y)).toBeGreaterThanOrEqual(0);
        expect(Math.max(x, y)).toBeLessThanOrEqual(DEER_MARK_VIEW);
      }
    }
  });
});

describe('the breath under Reduce Motion', () => {
  it('fades softly down and back, never further than its low', () => {
    expect(deerBreathAt(0)).toBe(1);
    expect(deerBreathAt(0.5)).toBeCloseTo(DEER_BREATH_LOW, 6);
    expect(deerBreathAt(1)).toBeCloseTo(1, 6);
    for (let t = 0; t <= 1; t += 0.01) expect(deerBreathAt(t)).toBeGreaterThanOrEqual(DEER_BREATH_LOW - 1e-9);
  });
});
