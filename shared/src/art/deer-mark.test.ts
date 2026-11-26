import { describe, expect, it } from 'vitest';
import {
  DEER_BREATH_LOW,
  DEER_LOOP_MS,
  DEER_LOOP_TURNS,
  DEER_MARK_VIEW,
  deerBreathAt,
  deerCurlKeyframes,
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
    expect(subpaths.slice(1).map((s) => s.length)).toEqual([8, 8]);
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
    // Every point of either outline further from the other than drawing precision (paths are written in tenths of a
    // unit) is at an antler.
    const moved = a.map((p) => gap(p, fineB) > 0.08);
    a.forEach((p, i) => moved[i] && expect(inZone(p), `${p}`).toBe(true));
    for (const p of b.filter((q) => gap(q, fineA) > 0.08)) expect(inZone(p), `${p}`).toBe(true);
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
    // His eyes are the traced eyes, cut finer.
    [1, 2].forEach((k) => {
      const eye = sample(now[k] as Pt[][], 20);
      const tracedEye = sample(traced[k] as Pt[][], 50);
      for (const p of eye) expect(gap(p, tracedEye)).toBeLessThan(0.08);
    });
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
  /** Differences of a list, frame to frame. */
  const steps = (a: number[]): number[] => a.slice(1).map((v, i) => v - (a[i] as number));
  const most = (a: number[]): number => Math.max(...a.map(Math.abs));
  /** Two loops back to back at 60 frames a second, the turn running on, so the seam between them is measured too. */
  const twice = (): DeerLoopPose[] => {
    const count = Math.round((DEER_LOOP_MS / 1000) * 60);
    return Array.from({ length: 2 * count + 1 }, (_, f) => {
      const pose = deerLoopAt(f / count);
      return { ...pose, turn: pose.turn + 360 * DEER_LOOP_TURNS * Math.floor(f / count) };
    });
  };

  it('lasts about three seconds and turns once', () => {
    expect(DEER_LOOP_MS).toBeGreaterThanOrEqual(2600);
    expect(DEER_LOOP_MS).toBeLessThanOrEqual(3000);
    expect(DEER_LOOP_TURNS).toBe(1);
  });

  it('closes on its first frame: the deer, upright', () => {
    const first = deerLoopAt(0);
    expect(first).toMatchObject({ curl: 0, open: 0, turn: 0 });
    const last = deerLoopAt(1 - 1e-9);
    expect(last.curl).toBeCloseTo(0, 12);
    expect(last.open).toBe(0);
    expect(last.turn).toBeCloseTo(360 * DEER_LOOP_TURNS, 6);
    expect(deerFormPath(first)).toBe(deerMarkPath());
    expect(deerFormPath(deerLoopAt(1))).toBe(deerMarkPath());
    const { at, poses } = deerLoopTrack(30);
    expect([at[0], at[at.length - 1]]).toEqual([0, 1]);
    // A table of it ends where it began, whole turns on, and never turns back between two of its moments.
    expect(poses[poses.length - 1]).toEqual({ ...poses[0], turn: 360 * DEER_LOOP_TURNS });
    poses.slice(1).forEach((pose, i) => expect(pose.turn).toBeGreaterThanOrEqual((poses[i] as DeerLoopPose).turn));
  });

  it('restarts invisibly: just before and just after the seam, position, speed and acceleration agree', () => {
    // Samples a hundred-thousandth of a loop apart either side of the seam, the turn counted on through it.
    const h = 1e-5;
    const seconds = (h * DEER_LOOP_MS) / 1000;
    const at = (k: number): DeerLoopPose => {
      const pose = deerLoopAt(k * h);
      return { ...pose, turn: pose.turn - (k < 0 ? 360 * DEER_LOOP_TURNS : 0) };
    };
    const poses = [-2, -1, 0, 1, 2].map(at);
    /** Value, speed and acceleration (per second) from just before, against the same from just after. */
    const agree = (q: number[], speed: number, accel: number): void => {
      const [b2, b1, now, a1, a2] = q as [number, number, number, number, number];
      expect(Math.abs(b1 - a1)).toBeLessThan(speed * seconds * 2 + 1e-9);
      expect(Math.abs((now - b1) / seconds - (a1 - now) / seconds)).toBeLessThan(speed);
      expect(Math.abs((now - 2 * b1 + b2) / seconds ** 2 - (a2 - 2 * a1 + now) / seconds ** 2)).toBeLessThan(accel);
    };
    agree(poses.map((p) => p.turn), 0.01, 1);
    agree(poses.map((p) => p.curl), 1e-4, 0.01);
    agree(poses.map((p) => p.open), 1e-4, 0.01);
    agree(poses.map((p) => p.arc), 0.01, 1);
    // Every point of his outline, too.
    const shapes = poses.map((p) => deerFormOutline(p));
    for (let i = 0; i < (shapes[2] as Float64Array).length; i++) agree(shapes.map((o) => o[i] as number), 0.01, 1);
    // And it never holds still there: the turn carries on through the seam, only slowing, like a breath.
    const still = frames().filter((p, f, all) => f > 0 && p.turn === (all[f - 1] as DeerLoopPose).turn);
    expect(still.length).toBeLessThanOrEqual(1);
  });

  it('turns calmly and smoothly: never back, never stalling while he moves, with no jolt in its speed or its jerk', () => {
    const poses = twice();
    const turn = poses.map((p) => p.turn);
    const speed = steps(turn);
    for (const step of speed) expect(step).toBeGreaterThanOrEqual(0);
    // About 200 degrees a second at most, and turning the whole time he is moving.
    expect(most(speed)).toBeLessThan(3.5);
    const count = Math.round((DEER_LOOP_MS / 1000) * 60);
    const first = poses.findIndex((p) => p.curl > 0);
    const last = count - [...poses.slice(0, count + 1)].reverse().findIndex((p) => p.curl > 0);
    for (let f = first; f < last - 1; f++) expect(speed[f]).toBeGreaterThan(0);
    // Its speed, the change in that and the change in that again are all small from frame to frame, across the seam too.
    const accel = steps(speed);
    const jerk = steps(accel);
    expect(most(accel)).toBeLessThan(0.15);
    expect(most(jerk)).toBeLessThan(0.01);
    expect(most(steps(jerk))).toBeLessThan(0.002);
  });

  it('moves every part of its shape without a jolt, across the seam too', () => {
    const poses = twice();
    const limits = { curl: 0.002, open: 0.006, arc: 0.1 } as const;
    for (const key of ['curl', 'open', 'arc'] as const) {
      const a = poses.map((p) => p[key]);
      // The third difference frame to frame, which jumps wherever a movement starts or stops with a jolt.
      expect(most(steps(steps(steps(a))))).toBeLessThan(limits[key]);
    }
    // And every point of the outline accelerates gently: no bend in its path where keyframes or movements meet.
    const count = Math.round((DEER_LOOP_MS / 1000) * 60);
    const shapes = poses.slice(0, count + 2).map((p) => deerFormOutline(p));
    for (let f = 1; f <= count; f++) {
      const [a, b, c] = [shapes[f - 1] as Float64Array, shapes[f] as Float64Array, shapes[f + 1] as Float64Array];
      for (let i = 0; i < b.length; i += 2) {
        const ax = (c[i] as number) - 2 * (b[i] as number) + (a[i] as number);
        const ay = (c[i + 1] as number) - 2 * (b[i + 1] as number) + (a[i + 1] as number);
        expect(Math.hypot(ax, ay)).toBeLessThan(0.6);
      }
    }
  });

  it('opens into a thick round-capped ring that breathes like a spinner, both ends always moving on clockwise', () => {
    const poses = frames();
    const ring = poses.filter((p) => p.open === 1);
    expect(ring.length).toBeGreaterThan(20);
    const arcs = poses.map((p) => p.arc);
    expect(Math.max(...arcs)).toBe(290);
    expect(Math.min(...arcs)).toBeGreaterThan(205);
    expect(Math.min(...arcs)).toBeLessThan(215);
    for (let f = 1; f < ring.length; f++) {
      const [a, b] = [ring[f - 1] as DeerLoopPose, ring[f] as DeerLoopPose];
      expect(b.turn + b.arc / 2 - (a.turn + a.arc / 2)).toBeGreaterThan(1);
      expect(b.turn - b.arc / 2 - (a.turn - a.arc / 2)).toBeGreaterThan(1);
    }
  });

  it('draws the ring exactly as a ring, so its edge never shimmers as it breathes', () => {
    for (const pose of frames().filter((p) => p.open === 1)) {
      const outline = deerFormOutline(pose);
      const tail = 25 + (360 - pose.arc) / 2;
      const ends = [tail, tail + pose.arc].map((deg) => [50 + Math.cos((deg * Math.PI) / 180) * 25.5, 50 + Math.sin((deg * Math.PI) / 180) * 25.5]);
      for (let i = 0; i < outline.length; i += 6) {
        const j = (i + 6) % outline.length;
        const seg: [Pt, Pt, Pt, Pt] = [
          [outline[i] as number, outline[i + 1] as number],
          [outline[i + 2] as number, outline[i + 3] as number],
          [outline[i + 4] as number, outline[i + 5] as number],
          [outline[j] as number, outline[j + 1] as number],
        ];
        for (const [x, y] of sample([seg], 8)) {
          const r = Math.hypot(x - 50, y - 50);
          const fromEnds = ends.map(([ex, ey]) => Math.abs(Math.hypot(x - (ex as number), y - (ey as number)) - 6.5));
          const stray = Math.min(Math.abs(r - 32), Math.abs(r - 19), ...fromEnds);
          expect(stray).toBeLessThan(0.01);
        }
      }
    }
  });

  it('never crosses itself while the ball opens and closes, his curl and the opening overlapping, whole and small', () => {
    const poses = frames().filter((p) => p.open > 0 && p.open < 1);
    expect(poses.length).toBeGreaterThan(10);
    for (const small of [false, true]) for (const pose of poses.filter((_, f) => f % 2 === 0)) expect(simple(deerFormOutline(pose, { small }))).toBe(true);
  });

  it('spins back out of the ring: a good part of the turn is still to come as he starts to unfurl', () => {
    const poses = frames();
    const ring = poses.findIndex((p) => p.open === 1);
    const unfurling = poses.findIndex((p, f) => f > ring && p.curl < 1);
    expect(unfurling).toBeGreaterThan(ring);
    expect(360 * DEER_LOOP_TURNS - (poses[unfurling] as DeerLoopPose).turn).toBeGreaterThan(90);
  });

  it('never pops on the way back: every point and his eyes move a little at a time', () => {
    const poses = frames();
    const ringEnds = poses.length - 1 - [...poses].reverse().findIndex((p) => p.open === 1);
    let back = 0;
    for (let f = ringEnds + 1; f < poses.length; f++) {
      const [prev, pose] = [poses[f - 1] as DeerLoopPose, poses[f] as DeerLoopPose];
      if (deerFormKey(prev) === deerFormKey(pose)) continue;
      back++;
      for (const small of [false, true]) {
        const moved = farthest(deerFormOutline(prev, { small }), deerFormOutline(pose, { small }));
        // Under two and a half units of the square a frame (three pixels at 120); the antlers and ears, last, under one.
        expect(moved).toBeLessThan(2.5);
        if (pose.curl < 0.2) expect(moved).toBeLessThan(1);
      }
      // His eyes take several frames to open.
      expect(deerEyesOpen(pose.curl) - deerEyesOpen(prev.curl)).toBeLessThan(0.2);
    }
    expect(back).toBeGreaterThan(40);
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
