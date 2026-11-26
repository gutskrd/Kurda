import { describe, expect, it } from 'vitest';
import {
  DEER_BREATH_LOW,
  DEER_LOOP_MS,
  DEER_MARK_VIEW,
  deerBreathAt,
  deerCurlKeyframes,
  deerCurlPath,
  deerLoopAt,
  deerLoopTrack,
  deerMarkPath,
  type DeerLoopPose,
} from './deer-mark.js';

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

function area(points: Pt[]): number {
  let s = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length] as Pt;
    s += p[0] * q[1] - q[0] * p[1];
  });
  return s / 2;
}

/** Where a point of the square lands once the pose's transforms are applied about its middle: turn, then squash, then drop. */
function posed(p: Pt, pose: DeerLoopPose): Pt {
  const a = (pose.turn * Math.PI) / 180;
  const x = p[0] - 50;
  const y = p[1] - 50;
  const rx = x * Math.cos(a) - y * Math.sin(a);
  const ry = x * Math.sin(a) + y * Math.cos(a);
  return [50 + rx * pose.scaleX, 50 + ry * pose.scaleY + pose.drop];
}

describe('the deer mark', () => {
  it('is one compound path: his outline and his two eyes, each closed, all inside the square', () => {
    const subpaths = parse(deerMarkPath());
    expect(subpaths.map((s) => s.length)).toEqual([46, 4, 4]);
    for (const segs of subpaths) {
      for (const p of segs.flat()) {
        expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
        expect(Math.min(...p)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...p)).toBeLessThanOrEqual(DEER_MARK_VIEW);
      }
    }
    expect(parse(deerMarkPath({ eyes: false })).map((s) => s.length)).toEqual([46]);
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
      expect(subpaths.length).toBe(c < 0.15 ? 3 : 1);
    }
    expect(parse(deerCurlPath(0.5, { eyes: false }))).toHaveLength(1);
  });

  it('is exactly the mark when not curled at all', () => {
    expect(deerCurlPath(0)).toBe(deerMarkPath());
    expect(deerCurlPath(0, { eyes: false })).toBe(deerMarkPath({ eyes: false }));
  });
});

describe('the loop', () => {
  it('lasts about a second and a half', () => {
    expect(DEER_LOOP_MS).toBeGreaterThanOrEqual(1400);
    expect(DEER_LOOP_MS).toBeLessThanOrEqual(1800);
  });

  it('closes on its first frame: the deer, upright, unsquashed', () => {
    const first = deerLoopAt(0);
    expect(first).toEqual({ curl: 0, turn: 0, scaleX: 1, scaleY: 1, drop: 0 });
    const last = deerLoopAt(1 - 1e-9);
    expect(last.curl).toBe(0);
    expect(last.turn % 360).toBeCloseTo(0, 6);
    expect([last.scaleX, last.scaleY, last.drop]).toEqual([1, 1, 0]);
    expect(deerCurlPath(first.curl)).toBe(deerMarkPath());
    const { at, poses } = deerLoopTrack(30);
    expect(at[0]).toBe(0);
    expect(at[at.length - 1]).toBe(1);
    // A table of it ends where it began, a whole turn on, and never turns back between two of its moments.
    expect(poses[poses.length - 1]).toEqual({ ...poses[0], turn: 360 });
    poses.slice(1).forEach((pose, i) => expect(pose.turn).toBeGreaterThanOrEqual((poses[i] as DeerLoopPose).turn));
  });

  it('moves without a jump anywhere, the seam between loops included', () => {
    let prev = deerLoopAt(0);
    for (let ms = 1; ms <= 2 * DEER_LOOP_MS; ms++) {
      const pose = deerLoopAt(ms / DEER_LOOP_MS);
      expect(Math.abs(pose.curl - prev.curl)).toBeLessThan(0.02);
      const turned = (((pose.turn - prev.turn) % 360) + 540) % 360 - 180;
      expect(Math.abs(turned)).toBeLessThan(2);
      expect(Math.abs(pose.scaleY - prev.scaleY)).toBeLessThan(0.002);
      prev = pose;
    }
  });

  it('rolls one full turn clockwise, squashing only while he is a ball', () => {
    let turn = 0;
    for (let ms = 0; ms < DEER_LOOP_MS; ms += 5) {
      const pose = deerLoopAt(ms / DEER_LOOP_MS);
      expect(pose.turn).toBeGreaterThanOrEqual(turn);
      turn = pose.turn;
      if (pose.scaleY < 1) expect(pose.curl).toBeGreaterThan(0.95);
      expect(pose.scaleY).toBeGreaterThan(0.94);
    }
    expect(deerLoopAt(0.5).curl).toBe(1);
    expect(deerLoopAt(0.999).turn).toBeCloseTo(360, 6);
  });

  it('stays inside its square in every frame', () => {
    for (let ms = 0; ms < DEER_LOOP_MS; ms += 10) {
      const pose = deerLoopAt(ms / DEER_LOOP_MS);
      // A curve stays within its control points, so these bound it.
      for (const p of parse(deerCurlPath(pose.curl)).flat(2)) {
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
