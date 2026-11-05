/**
 * The village's things, each a `Part` placed on the ground in world units:
 * its trees (apple, pomegranate, poplar, walnut, willow and the saplings),
 * and everything a mountain village leaves lying about — a log pile and a
 * stump with the axe in it, crates of apples, a cart, a sign on its post,
 * tins of geraniums on a sill, a fence with a plank fallen off, stepping
 * stones, kilim banners on their poles, the tenûr with its lid, a samovar,
 * low stools, beehives, a washing line, a haystack, clay jars, the
 * builders' poles, planks and ladders, and the shepherds' cairn on its knoll
 * (which the lesson path draws too, so the two read as one world).
 *
 * Kilims are woven, so their patterns are the village looms' own: a field
 * of madder red, a column of stepped lozenges in saffron and indigo with a
 * cream edge, and a band of zig-zag at each end above the fringe.
 */
import { n, type Pt } from '../svg.js';
import { Part, arched, disc, iso, onLeft, onRight, oval, panel, poly, polyline, rim, seg, wpoly, type Palette, type Tri } from './pen.js';

/** A random number source, so details are scattered by hand but the same every time. */
export type Rand = () => number;

const depthOf = (x: number, y: number): number => x + y;

// ───────────────────────────────────────────────────────────── trees

/** The marks inside a crown of leaves that say it is lobed: short cups of ink. */
function leafMarks(p: Part, cx: number, cy: number, r: number, rand: Rand, count: number): void {
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const k = 0.25 + rand() * 0.45;
    const x = cx + Math.cos(a) * r * k;
    const y = cy + Math.sin(a) * r * k * 0.8;
    const w = r * (0.16 + rand() * 0.08);
    d += `M${n(x - w)} ${n(y)}q${n(w)} ${n(w * 0.9)} ${n(2 * w)} 0`;
  }
  p.line(d, 0.8);
}

/** A crown of round lobes: one outline round them all, shade, the face lifted up and left, a patch of light. */
function crown(p: Part, lobes: readonly (readonly [number, number, number])[], t: Tri): void {
  for (const [x, y, r] of lobes) p.sil(disc(x, y, r));
  p.flat(lobes.map(([x, y, r]) => disc(x, y, r)).join(''), t.right);
  p.flat(lobes.map(([x, y, r]) => disc(x - r * 0.13, y - r * 0.16, r * 0.84)).join(''), t.left);
  const [lx, ly, lr] = lobes.reduce((a, b) => (b[0] + b[1] < a[0] + a[1] ? b : a));
  p.flat(disc(lx - lr * 0.3, ly - lr * 0.32, lr * 0.36), t.top);
}

/** A trunk: a tapering stem from the ground up into the crown, lit on its left. */
function trunk(p: Part, x: number, y: number, z: number, h: number, w: number, pal: Palette, lean = 0): void {
  const [cx, cy] = iso(x, y, z);
  const top = cy - h;
  const d = `M${n(cx - w / 2)} ${n(cy)}Q${n(cx - w * 0.3 + lean * 0.5)} ${n(cy - h * 0.5)} ${n(cx - w * 0.25 + lean)} ${n(top)}L${n(cx + w * 0.25 + lean)} ${n(top)}Q${n(cx + w * 0.3 + lean * 0.5)} ${n(cy - h * 0.5)} ${n(cx + w / 2)} ${n(cy)}Z`;
  p.sil(d).fill(d, pal.trunk.left);
  p.flat(`M${n(cx + w * 0.08)} ${n(cy)}Q${n(cx + w * 0.12 + lean * 0.5)} ${n(cy - h * 0.5)} ${n(cx + w * 0.05 + lean)} ${n(top)}L${n(cx + w * 0.25 + lean)} ${n(top)}Q${n(cx + w * 0.3 + lean * 0.5)} ${n(cy - h * 0.5)} ${n(cx + w / 2)} ${n(cy)}Z`, pal.trunk.right);
}

/** A soft shadow on the grass under something, a flat darker ellipse. */
export function shadow(x: number, y: number, z: number, r: number, pal: Palette): string {
  const [cx, cy] = iso(x, y, z);
  const [rx, ry] = rim(r);
  return `<path d="${oval(cx + rx * 0.12, cy + ry * 0.1, rx, ry)}" fill="${pal.grass.right}" stroke="none" fill-opacity="0.55"/>`;
}

/** An apple tree (or a pomegranate, smaller and darker, its fruit with a crown), `size` about its crown's radius. */
export function fruitTree(pal: Palette, x: number, y: number, z: number, size: number, rand: Rand, o: { fruit?: number; kind?: 'apple' | 'pomegranate'; young?: boolean } = {}): Part {
  const p = new Part(depthOf(x, y));
  const pom = o.kind === 'pomegranate';
  p.raw(shadow(x, y, z, size * 0.9, pal));
  trunk(p, x, y, z, size * (pom ? 1.0 : 1.15), size * (pom ? 0.22 : 0.26), pal, (rand() - 0.5) * size * 0.2);
  const [cx, cy0] = iso(x, y, z);
  const cy = cy0 - size * (pom ? 1.55 : 1.75);
  const j = (): number => (rand() - 0.5) * size * 0.12;
  const lobes: [number, number, number][] = pom
    ? [
        [cx - size * 0.5 + j(), cy + size * 0.15, size * 0.5],
        [cx + size * 0.52 + j(), cy + size * 0.1, size * 0.48],
        [cx + j(), cy - size * 0.3, size * 0.56],
        [cx + size * 0.1, cy + size * 0.3, size * 0.5],
      ]
    : [
        [cx - size * 0.58 + j(), cy + size * 0.12, size * 0.56],
        [cx + size * 0.6 + j(), cy + size * 0.08, size * 0.54],
        [cx - size * 0.15 + j(), cy - size * 0.38, size * 0.6],
        [cx + size * 0.3 + j(), cy - size * 0.28, size * 0.5],
        [cx + j(), cy + size * 0.28, size * 0.62],
      ];
  crown(p, lobes, pom ? pal.leafDark : pal.leaf);
  leafMarks(p, cx, cy, size, rand, o.young ? 2 : 4);
  const count = o.fruit ?? 0;
  const spots: Pt[] = [[-0.55, 0.25], [0.45, -0.1], [0.1, 0.45], [-0.2, -0.3], [0.68, 0.3], [-0.72, -0.05], [0.25, 0.15], [-0.35, 0.5], [0.5, -0.45]];
  let fruit = '';
  for (const [dx, dy] of spots.slice(0, count)) {
    const fx = cx + dx * size + (rand() - 0.5) * 2;
    const fy = cy + dy * size;
    const r = size * (pom ? 0.15 : 0.13);
    fruit += disc(fx, fy, r);
    if (pom) fruit += `M${n(fx - r * 0.35)} ${n(fy - r * 0.85)}l${n(r * 0.35)} ${n(-r * 0.45)}l${n(r * 0.35)} ${n(r * 0.45)}Z`;
  }
  if (fruit) p.fill(fruit, pom ? pal.pomegranate : pal.apple, ' stroke-width="0.8"');
  return p;
}

/** A young tree tied to its stake, a few leaves on it. */
export function sapling(pal: Palette, x: number, y: number, z: number, size: number, rand: Rand): Part {
  const p = new Part(depthOf(x, y));
  const [cx, cy] = iso(x, y, z);
  p.raw(shadow(x, y, z, size * 0.5, pal));
  p.sil(`M${n(cx + 2.4)} ${n(cy + 0.5)}h1.6v${n(-size * 1.9)}h-1.6Z`).fill(`M${n(cx + 2.4)} ${n(cy + 0.5)}h1.6v${n(-size * 1.9)}h-1.6Z`, pal.wood.left);
  trunk(p, x, y, z, size * 1.2, size * 0.18, pal, -0.6);
  p.line(`M${n(cx + 0.2)} ${n(cy - size * 0.9)}L${n(cx + 3)} ${n(cy - size * 0.95)}`, 0.8);
  crown(p, [[cx - size * 0.15, cy - size * 1.35, size * 0.42], [cx + size * 0.3, cy - size * 1.5, size * 0.36], [cx, cy - size * 1.75, size * 0.36]], pal.leaf);
  leafMarks(p, cx, cy - size * 1.5, size * 0.4, rand, 1);
  return p;
}

/** A poplar: tall and narrow, lit down its left side. */
export function poplar(pal: Palette, x: number, y: number, z: number, tall: number, wide: number): Part {
  const p = new Part(depthOf(x, y));
  const [cx, cy] = iso(x, y, z);
  p.raw(shadow(x, y, z, wide * 0.5, pal));
  trunk(p, x, y, z, tall * 0.2, wide * 0.22, pal);
  const y0 = cy - tall * 0.12;
  const y1 = cy - tall;
  const w = wide;
  const shape = `M${n(cx)} ${n(y1)}C${n(cx + w * 0.62)} ${n(y1 + tall * 0.28)} ${n(cx + w * 0.6)} ${n(y0 - tall * 0.08)} ${n(cx + w * 0.05)} ${n(y0)}C${n(cx - w * 0.6)} ${n(y0 - tall * 0.06)} ${n(cx - w * 0.62)} ${n(y1 + tall * 0.3)} ${n(cx)} ${n(y1)}Z`;
  p.sil(shape).flat(shape, pal.poplar.left);
  p.flat(`M${n(cx + w * 0.02)} ${n(y1 + tall * 0.1)}C${n(cx + w * 0.22)} ${n(y1 + tall * 0.4)} ${n(cx + w * 0.2)} ${n(y0 - tall * 0.2)} ${n(cx + w * 0.05)} ${n(y0)}C${n(cx + w * 0.5)} ${n(y0 - tall * 0.08)} ${n(cx + w * 0.56)} ${n(y1 + tall * 0.3)} ${n(cx)} ${n(y1)}Z`, pal.poplar.right);
  p.flat(`M${n(cx - w * 0.2)} ${n(y1 + tall * 0.2)}C${n(cx - w * 0.36)} ${n(y1 + tall * 0.4)} ${n(cx - w * 0.36)} ${n(y1 + tall * 0.6)} ${n(cx - w * 0.26)} ${n(y1 + tall * 0.7)}C${n(cx - w * 0.2)} ${n(y1 + tall * 0.55)} ${n(cx - w * 0.16)} ${n(y1 + tall * 0.35)} ${n(cx - w * 0.2)} ${n(y1 + tall * 0.2)}Z`, pal.poplar.top);
  let marks = '';
  for (let i = 0; i < 4; i++) {
    const my = y1 + tall * (0.3 + i * 0.15);
    const mx = cx + (i % 2 ? w * 0.15 : -w * 0.12);
    marks += `M${n(mx - 2)} ${n(my)}q2 1.8 4 0`;
  }
  p.line(marks, 0.8);
  return p;
}

/** A walnut: broad and old, the shade of the village, its crown wide over a short thick trunk. */
export function walnut(pal: Palette, x: number, y: number, z: number, size: number, rand: Rand): Part {
  const p = new Part(depthOf(x, y));
  const [cx, cy0] = iso(x, y, z);
  p.raw(shadow(x, y, z, size * 1.1, pal));
  trunk(p, x, y, z, size * 1.1, size * 0.34, pal, size * 0.06);
  const cy = cy0 - size * 1.6;
  crown(p, [[cx - size * 0.8, cy + size * 0.2, size * 0.55], [cx + size * 0.82, cy + size * 0.18, size * 0.55], [cx - size * 0.35, cy - size * 0.32, size * 0.62], [cx + size * 0.4, cy - size * 0.3, size * 0.6], [cx, cy + size * 0.25, size * 0.66]], pal.leafDark);
  leafMarks(p, cx, cy, size * 1.1, rand, 5);
  return p;
}

/** A willow over water: a rounded crown with its leaves hanging down in strands. */
export function willow(pal: Palette, x: number, y: number, z: number, size: number, rand: Rand): Part {
  const p = new Part(depthOf(x, y));
  const [cx, cy0] = iso(x, y, z);
  trunk(p, x, y, z, size * 1.1, size * 0.28, pal, -size * 0.1);
  const cy = cy0 - size * 1.5;
  crown(p, [[cx - size * 0.5, cy + size * 0.1, size * 0.5], [cx + size * 0.5, cy + size * 0.05, size * 0.5], [cx, cy - size * 0.25, size * 0.58]], pal.leaf);
  let strands = '';
  for (let i = 0; i < 7; i++) {
    const sx = cx - size * 0.85 + (i * size * 1.7) / 6;
    const len = size * (0.5 + rand() * 0.35);
    strands += `M${n(sx - 1.6)} ${n(cy + size * 0.2)}q${n(1.6)} ${n(len)} ${n(3.2)} 0Z`;
  }
  p.sil(strands).flat(strands, pal.leaf.left);
  leafMarks(p, cx, cy, size * 0.9, rand, 3);
  return p;
}

/** A low round bush, sometimes in flower. */
export function bush(pal: Palette, x: number, y: number, z: number, size: number, rand: Rand, flowers = 0): Part {
  const p = new Part(depthOf(x, y));
  const [cx, cy] = iso(x, y, z);
  crown(p, [[cx - size * 0.45, cy - size * 0.45, size * 0.55], [cx + size * 0.45, cy - size * 0.4, size * 0.5], [cx, cy - size * 0.75, size * 0.55]], pal.leafDark);
  let f = '';
  for (let i = 0; i < flowers; i++) f += disc(cx + (rand() - 0.5) * size * 1.4, cy - size * (0.3 + rand() * 0.7), 1.1);
  if (f) p.flat(f, pal.flower[Math.floor(rand() * pal.flower.length)]!);
  return p;
}

/** A rock: an irregular lump, lit on its top and left. */
export function rock(pal: Palette, x: number, y: number, z: number, size: number, rand: Rand, t?: Tri): Part {
  const p = new Part(depthOf(x, y));
  const tone = t ?? pal.rock;
  const [cx, cy] = iso(x, y, z);
  const w = size * (1 + rand() * 0.3);
  const h = size * (0.7 + rand() * 0.3);
  const outline = `M${n(cx - w)} ${n(cy)}Q${n(cx - w * 1.05)} ${n(cy - h * 0.7)} ${n(cx - w * 0.4)} ${n(cy - h)}Q${n(cx + w * 0.3)} ${n(cy - h * 1.2)} ${n(cx + w * 0.85)} ${n(cy - h * 0.55)}Q${n(cx + w * 1.05)} ${n(cy - h * 0.1)} ${n(cx + w * 0.8)} ${n(cy + h * 0.25)}Q${n(cx)} ${n(cy + h * 0.45)} ${n(cx - w)} ${n(cy)}Z`;
  p.sil(outline).flat(outline, tone.left);
  p.flat(`M${n(cx + w * 0.1)} ${n(cy - h * 0.95)}Q${n(cx + w * 0.6)} ${n(cy - h * 0.9)} ${n(cx + w * 0.85)} ${n(cy - h * 0.55)}Q${n(cx + w * 1.05)} ${n(cy - h * 0.1)} ${n(cx + w * 0.8)} ${n(cy + h * 0.25)}Q${n(cx + w * 0.3)} ${n(cy + h * 0.38)} ${n(cx + w * 0.15)} ${n(cy + h * 0.3)}Q${n(cx + w * 0.35)} ${n(cy - h * 0.3)} ${n(cx + w * 0.1)} ${n(cy - h * 0.95)}Z`, tone.right);
  p.flat(`M${n(cx - w * 0.75)} ${n(cy - h * 0.35)}Q${n(cx - w * 0.6)} ${n(cy - h * 0.9)} ${n(cx - w * 0.1)} ${n(cy - h * 0.92)}Q${n(cx - w * 0.3)} ${n(cy - h * 0.55)} ${n(cx - w * 0.75)} ${n(cy - h * 0.35)}Z`, tone.top);
  return p;
}

/** Tufts of grass and a flower or two, scattered on a terrace: short strokes in the darker green. */
export function tufts(pal: Palette, spots: readonly (readonly [number, number, number])[], rand: Rand): string {
  let d = '';
  let flowers = '';
  for (const [x, y, z] of spots) {
    const [cx, cy] = iso(x, y, z);
    d += `M${n(cx - 2.6)} ${n(cy)}l${n(-0.8)} ${n(-3.2)}M${n(cx)} ${n(cy)}l0 ${n(-4.2)}M${n(cx + 2.6)} ${n(cy)}l${n(0.9)} ${n(-3)}`;
    if (rand() < 0.35) flowers += disc(cx + 4.5, cy - 2.5, 1.2);
  }
  return `<path d="${d}" fill="none" stroke="${pal.tuft}" stroke-width="1.3"/>` + (flowers ? `<path d="${flowers}" fill="${pal.flower[Math.floor(rand() * 3)]!}" stroke="none"/>` : '');
}

// ───────────────────────────────────────────────────────────── wood and work

/** A pile of logs lying along y, their cut ends towards us with the rings showing. */
export function logPile(pal: Palette, x: number, y: number, z: number, count: number): Part {
  const p = new Part(depthOf(x, y));
  const r = 3;
  const len = 20;
  const rows: [number, number][] = count >= 5 ? [[0, 0], [1, 0], [2, 0], [0.5, 1], [1.5, 1], [1, 2]] : [[0, 0], [1, 0], [0.5, 1]];
  for (const [i, row] of rows.slice(0, count)) {
    const [ex, ey] = iso(x + i * 2 * r + 0.3, y + i * 0.6, z + r + row * r * 1.75);
    const fx = ex + len;
    const fy = ey - len / 2;
    const body = `M${n(ex)} ${n(ey - r)}L${n(fx)} ${n(fy - r)}L${n(fx)} ${n(fy + r)}L${n(ex)} ${n(ey + r)}Z`;
    p.sil(body + disc(ex, ey, r)).fill(body, pal.trunk.left).flat(`M${n(ex)} ${n(ey + r * 0.3)}L${n(fx)} ${n(fy + r * 0.3)}L${n(fx)} ${n(fy + r)}L${n(ex)} ${n(ey + r)}Z`, pal.trunk.right);
    p.fill(disc(ex, ey, r), pal.wood.top).line(disc(ex, ey, r * 0.45), 0.6);
  }
  return p;
}

/** A stump with the axe left in it, and two red-capped mushrooms at its foot. */
export function stumpWithAxe(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(depthOf(x, y));
  p.raw(shadow(x, y, z, 7, pal));
  p.cylinder(x, y, z, 5, 7, { top: pal.wood.top, left: pal.trunk.left, right: pal.trunk.right });
  const [cx, cy] = iso(x, y, z + 7);
  p.line(oval(cx, cy, 4, 2) + oval(cx, cy, 1.8, 0.9), 0.6);
  // the axe: its handle slanting up out of the cut, the head bitten into the wood
  const handle = `M${n(cx - 1)} ${n(cy - 1)}L${n(cx + 8)} ${n(cy - 12)}l1.6 1.2L${n(cx + 0.8)} ${n(cy + 0.3)}Z`;
  p.sil(handle).fill(handle, pal.wood.left);
  const head = `M${n(cx - 3.6)} ${n(cy - 4.4)}l4.4 -1.4l1.6 4.6l-4.8 1.6Q${n(cx - 4.6)} ${n(cy - 2)} ${n(cx - 3.6)} ${n(cy - 4.4)}Z`;
  p.sil(head).fill(head, pal.stoneGrey.left).flat(`M${n(cx - 3.2)} ${n(cy - 3.9)}l2.2 -0.7l0.5 1.5l-2.4 0.7Z`, pal.stoneGrey.top);
  for (const [dx, dy, s] of [[-9, 3, 1], [-6, 6, 0.8]] as const) {
    const [mx, my] = iso(x + dx, y + dy, z);
    const cap = `M${n(mx - 2.6 * s)} ${n(my - 2.4 * s)}Q${n(mx)} ${n(my - 6 * s)} ${n(mx + 2.6 * s)} ${n(my - 2.4 * s)}Z`;
    const stem = `M${n(mx - 0.9 * s)} ${n(my)}V${n(my - 2.6 * s)}H${n(mx + 0.9 * s)}V${n(my)}Z`;
    p.sil(cap + stem).fill(stem, pal.cream.left).fill(cap, pal.red.left).flat(disc(mx - 0.9 * s, my - 3.6 * s, 0.6 * s) + disc(mx + 1 * s, my - 3.3 * s, 0.5 * s), '#ffffff');
  }
  return p;
}

/** A wooden crate, its slats showing, heaped with fruit or loaves if it holds any. */
export function crate(pal: Palette, x: number, y: number, z: number, s: number, fill?: string, rand?: Rand): Part {
  const p = new Part(depthOf(x + s / 2, y + s / 2));
  p.box(x, y, z, s, s, s * 0.75, pal.wood);
  const [lx, ly] = iso(x, y + s, z + s * 0.37);
  const [rx, ry] = iso(x + s, y + s, z + s * 0.37);
  const [tx, ty] = iso(x + s, y, z + s * 0.37);
  p.line(`M${n(lx)} ${n(ly)}L${n(rx)} ${n(ry)}L${n(tx)} ${n(ty)}`, 0.7);
  if (fill) {
    let d = '';
    const r = s * 0.2;
    const at: Pt[] = [[0.25, 0.25], [0.7, 0.3], [0.3, 0.72], [0.72, 0.72], [0.5, 0.5]];
    for (const [u, v] of at) {
      const [fx, fy] = iso(x + u * s, y + v * s, z + s * 0.75);
      d += disc(fx + ((rand?.() ?? 0.5) - 0.5), fy - r * 0.6, r);
    }
    p.fill(d, fill, ' stroke-width="0.7"');
  }
  return p;
}

/** A wooden cart with two wheels, its shafts resting on the ground. */
export function cart(pal: Palette, x: number, y: number, z: number, load?: string, rand?: Rand): Part {
  const p = new Part(depthOf(x + 9, y + 7));
  // the far wheel first, then the bed, then the near wheel
  const wheel = (wx: number, wy: number): void => {
    const [cx, cy] = iso(wx, wy, z + 5);
    p.sil(oval(cx, cy, 3.4, 5)).fill(oval(cx, cy, 3.4, 5), pal.woodDark.right).fill(oval(cx, cy, 1.2, 1.8), pal.woodDark.top);
  };
  wheel(x + 9, y);
  p.box(x, y, z + 5, 18, 14, 2.2, pal.wood);
  p.box(x, y, z + 7.2, 18, 1.6, 4, pal.wood, { top: true });
  p.box(x + 16.4, y, z + 7.2, 1.6, 14, 4, pal.wood);
  if (load) {
    let d = '';
    for (let i = 0; i < 7; i++) {
      const [fx, fy] = iso(x + 4 + ((i * 5) % 13), y + 3 + ((i * 7) % 10), z + 10 + (i > 4 ? 2 : 0));
      d += disc(fx + ((rand?.() ?? 0.5) - 0.5), fy, 2.4);
    }
    p.fill(d, load, ' stroke-width="0.7"');
  }
  p.box(x, y + 12.4, z + 7.2, 16.4, 1.6, 4, pal.wood);
  wheel(x + 9, y + 15);
  // the shafts, down to the ground
  const [ax, ay] = iso(x, y + 3, z + 6);
  const [bx, by] = iso(x - 12, y + 3, z);
  const [cx2, cy2] = iso(x, y + 11, z + 6);
  const [dx, dy] = iso(x - 12, y + 11, z);
  p.line(`M${n(ax)} ${n(ay)}L${n(bx)} ${n(by)}M${n(cx2)} ${n(cy2)}L${n(dx)} ${n(dy)}`, 2.2).line(`M${n(ax)} ${n(ay)}L${n(bx)} ${n(by)}M${n(cx2)} ${n(cy2)}L${n(dx)} ${n(dy)}`, 1, pal.wood.left);
  return p;
}

/** A small board on a post, painted with a picture rather than words (the app says the words). */
export function sign(pal: Palette, x: number, y: number, z: number, picture: 'house' | 'arrow' | 'cup' = 'house'): Part {
  const p = new Part(depthOf(x, y));
  p.box(x - 0.8, y - 0.8, z, 1.6, 1.6, 14, pal.woodDark);
  // the board faces down-left
  const at = onLeft(x - 6, y + 1, z + 9);
  p.sil(panel(at, 0, 0, 12, 8)).fill(panel(at, 0, 0, 12, 8), pal.wood.left).fill(panel(at, 0.8, 0.8, 10.4, 6.4), pal.cream.left, ' stroke-width="0.6"');
  const m = (u: number, v: number): string => {
    const [a, b] = at(u, v);
    return `${n(a)} ${n(b)}`;
  };
  if (picture === 'house') p.line(`M${m(3.5, 2)}L${m(3.5, 4.6)}L${m(6, 6.4)}L${m(8.5, 4.6)}L${m(8.5, 2)}Z`, 0.9);
  else if (picture === 'cup') p.line(`M${m(4, 5.8)}L${m(4.6, 2.2)}L${m(7.4, 2.2)}L${m(8, 5.8)}M${m(3.5, 1.6)}L${m(8.5, 1.6)}`, 0.9);
  else p.line(`M${m(2.5, 4)}L${m(9, 4)}M${m(7, 6)}L${m(9.4, 4)}L${m(7, 2)}`, 0.9);
  return p;
}

/** Upright sticks — stakes, posts — as one heavy ink stroke and one lighter stroke of wood over it, all in two paths. */
export function sticks(p: Part, feet: readonly (readonly [number, number, number])[], h: number, pal: Palette, w = 2.2): void {
  let d = '';
  for (const [x, y, z] of feet) {
    const [a, b] = iso(x, y, z);
    d += `M${n(a)} ${n(b)}l0 ${n(-h)}`;
  }
  p.line(d, w + 1.6).line(d, w, pal.wood.left);
}

/** Stakes at a plot's corners with a string between them, a few stones and the sign: a building not begun. */
export function stakedPlot(pal: Palette, x: number, y: number, z: number, w: number, d: number, rand: Rand, picture: 'house' | 'arrow' | 'cup'): Part[] {
  const ground = new Part(depthOf(x, y) - 1);
  ground.flat(wpoly([[x + 2, y, z], [x + w, y + 2, z], [x + w - 2, y + d, z], [x, y + d - 2, z]]), pal.earth.left);
  ground.flat(wpoly([[x + 6, y + 4, z], [x + w * 0.55, y + 5, z], [x + w * 0.4, y + d * 0.45, z], [x + 5, y + d * 0.5, z]]), pal.earth.top);
  const corners: [number, number, number][] = [[x + 3, y + 3, z], [x + w - 3, y + 3, z], [x + w - 3, y + d - 3, z], [x + 3, y + d - 3, z]];
  ground.line(poly(corners.map(([cx, cy]) => iso(cx, cy, z + 6))), 0.7, '#f4f1e8');
  let stones = '';
  let tops = '';
  for (let i = 0; i < 5; i++) {
    const [sx, sy] = iso(x + 6 + rand() * (w - 12), y + d * (0.55 + rand() * 0.4), z);
    const r = 1.8 + rand() * 1.4;
    stones += oval(sx, sy, r * 1.3, r * 0.8);
    tops += oval(sx - 0.3, sy - 0.4, r * 0.8, r * 0.45);
  }
  ground.fill(stones, pal.rock.right).flat(tops, pal.rock.top);
  const stakes = new Part(depthOf(x + w, y + d));
  sticks(stakes, corners, 8, pal, 1.6);
  return [ground, stakes, sign(pal, x + w * 0.2, y + d + 3, z, picture)];
}

/** Tins and pots of red geraniums on a sill or a step. */
export function geraniums(pal: Palette, x: number, y: number, z: number, count: number, rand: Rand, along: 'x' | 'y' = 'x'): Part {
  const p = new Part(depthOf(x, y) + 4);
  let pots = '';
  let leaves = '';
  let flowers = '';
  for (let i = 0; i < count; i++) {
    const [cx, cy] = iso(along === 'x' ? x + i * 4.4 : x, along === 'y' ? y + i * 4.4 : y, z);
    pots += `M${n(cx - 1.9)} ${n(cy - 3.4)}h3.8l-0.5 3.4h-2.8Z`;
    leaves += disc(cx, cy - 5, 2.5);
    flowers += disc(cx - 0.7, cy - 5.8, 1.4) + disc(cx + 1.1, cy - 4.6, 1.1);
  }
  p.sil(pots + leaves).fill(pots, pal.clay.left).flat(leaves, pal.leafDark.left).flat(flowers, pal.flower[rand() < 0.7 ? 0 : 4]!);
  return p;
}

/** A run of post-and-rail fence along x or y; `broken` leaves one rail hanging off its post. */
export function fence(pal: Palette, x: number, y: number, z: number, len: number, along: 'x' | 'y', broken = -1): Part[] {
  const p = new Part(depthOf(x + (along === 'x' ? len / 2 : 0), y + (along === 'y' ? len / 2 : 0)));
  const posts = Math.max(2, Math.round(len / 9) + 1);
  const at = (i: number, h: number): [number, number, number] => [along === 'x' ? x + (i / (posts - 1)) * len : x, along === 'y' ? y + (i / (posts - 1)) * len : y, z + h];
  let rails = '';
  for (let i = 0; i < posts - 1; i++) {
    for (const h of [3.5, 7]) {
      const [ax, ay, az] = at(i, h);
      const [bx, by, bz] = at(i + 1, i === broken && h === 7 ? 1.2 : h);
      rails += seg(iso(ax, ay, az), iso(bx, by, bz));
    }
  }
  sticks(p, Array.from({ length: posts }, (_, i) => at(i, 0)), 9, { ...pal, wood: pal.woodDark }, 2);
  p.line(rails, 2.8).line(rails, 1.3, pal.wood.left);
  return [p];
}

/** A low wattle fence of woven withies along x or y. */
export function wattle(pal: Palette, x: number, y: number, z: number, len: number, along: 'x' | 'y'): Part {
  const p = new Part(depthOf(x + (along === 'x' ? len / 2 : 0), y + (along === 'y' ? len / 2 : 0)));
  const end: [number, number] = along === 'x' ? [x + len, y] : [x, y + len];
  const at = along === 'x' ? onLeft(x, y, z) : onRight(x, y, z);
  p.box(x - 0.8, y - 0.8, z, 1.6, 1.6, 7, pal.woodDark).box(end[0] - 0.8, end[1] - 0.8, z, 1.6, 1.6, 7, pal.woodDark);
  p.sil(panel(at, 0, 0, len, 5.5)).fill(panel(at, 0, 0, len, 5.5), pal.straw.right);
  let weave = '';
  for (let v = 1.4; v < 5.5; v += 1.4) {
    const a = at(0, v);
    const b = at(len, v);
    weave += `M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`;
  }
  p.line(weave, 0.6);
  return p;
}

/** Flat stepping stones across water or grass, from one point to another. */
export function steppingStones(pal: Palette, from: readonly [number, number, number], to: readonly [number, number, number], count: number, rand: Rand): Part {
  const p = new Part(depthOf(from[0], from[1]) - 2);
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? 0.5 : i / (count - 1);
    const x = from[0] + (to[0] - from[0]) * f + (rand() - 0.5) * 3;
    const y = from[1] + (to[1] - from[1]) * f + (rand() - 0.5) * 3;
    const z = from[2] + (to[2] - from[2]) * f;
    const [cx, cy] = iso(x, y, z);
    const r = 3.6 + rand() * 1.4;
    p.sil(oval(cx, cy + 1, r * 1.3, r * 0.75)).flat(oval(cx, cy + 1, r * 1.3, r * 0.75), pal.rock.right).flat(oval(cx - 0.4, cy, r * 1.2, r * 0.62), pal.rock.top);
  }
  return p;
}

/** A pole with a woven kilim banner hanging from its arm (no flag of any country, only the loom's pattern). */
export function bannerPole(pal: Palette, x: number, y: number, z: number, tall: number, cloth = true): Part {
  const p = new Part(depthOf(x, y));
  p.box(x - 1, y - 1, z, 2, 2, tall, pal.woodDark);
  if (cloth) bannerCloth(p, pal, x, y, z + tall);
  const [ax, ay] = iso(x, y, z + tall - 2);
  p.line(`M${n(ax)} ${n(ay)}l9 4.5`, 2.4).line(`M${n(ax)} ${n(ay)}l9 4.5`, 1.1, pal.wood.left);
  return p;
}

/** The banner on a pole's arm: a narrow kilim hanging from the arm (`top` the pole's top), its foot cut to a point. */
export function bannerCloth(p: Part, pal: Palette, x: number, y: number, top: number): void {
  const at = (u: number, v: number): Pt => iso(x + 1.6 + u, y + 0.4, top - 20 + v);
  const w = 7;
  const shape = poly([at(0, 18), at(w, 18), at(w, 2.5), at(w / 2, 0), at(0, 2.5)]);
  p.sil(shape).fill(shape, pal.red.left);
  p.flat(poly([at(0, 18), at(w, 18), at(w, 15.6), at(0, 15.6)]), pal.cream.left);
  p.flat(poly([at(w / 2, 13.4), at(w - 1, 9.6), at(w / 2, 5.8), at(1, 9.6)]), pal.saffron.left).flat(poly([at(w / 2, 11.4), at(w / 2 + 1.4, 9.6), at(w / 2, 7.8), at(w / 2 - 1.4, 9.6)]), pal.indigo.left);
}

/** A kilim on a face plane, hung or laid: red field, a column of stepped lozenges, zig-zag ends and fringes. */
export function kilim(p: Part, at: (u: number, v: number) => Pt, w: number, h: number, pal: Palette, fringe = true): void {
  p.sil(panel(at, 0, 0, w, h)).fill(panel(at, 0, 0, w, h), pal.red.left);
  // the ends: a cream band with a zig-zag of indigo
  const band = Math.min(h * 0.16, 2.6);
  p.flat(panel(at, 0, h - band, w, band) + panel(at, 0, 0, w, band), pal.cream.left);
  let zig = '';
  for (const v0 of [band * 0.5, h - band * 0.5]) {
    const steps = Math.max(3, Math.round(w / 2.4));
    const pts: Pt[] = [];
    for (let i = 0; i <= steps; i++) pts.push(at((i * w) / steps, v0 + (i % 2 ? band * 0.35 : -band * 0.35)));
    zig += polyline(pts);
  }
  p.line(zig, 0.7, pal.indigo.left);
  // the field: lozenges down the middle, saffron with an indigo heart
  const count = Math.max(1, Math.round((h - 2 * band) / (w * 0.75)));
  const span = (h - 2 * band) / count;
  let lozenges = '';
  let hearts = '';
  for (let i = 0; i < count; i++) {
    const cv = band + span * (i + 0.5);
    const rw = w * 0.32;
    const rh = Math.min(span * 0.42, rw * 1.3);
    lozenges += poly([at(w / 2, cv + rh), at(w / 2 + rw, cv), at(w / 2, cv - rh), at(w / 2 - rw, cv)]);
    hearts += poly([at(w / 2, cv + rh * 0.4), at(w / 2 + rw * 0.4, cv), at(w / 2, cv - rh * 0.4), at(w / 2 - rw * 0.4, cv)]);
    // the hooks either side of each lozenge
    lozenges += poly([at(w * 0.08, cv + 0.6), at(w * 0.16, cv), at(w * 0.08, cv - 0.6), at(w * 0.02, cv)]) + poly([at(w * 0.92, cv + 0.6), at(w * 0.98, cv), at(w * 0.92, cv - 0.6), at(w * 0.84, cv)]);
  }
  p.flat(lozenges, pal.saffron.left).flat(hearts, pal.indigo.left);
  if (fringe) {
    let f = '';
    for (let i = 0.5; i < w; i += 1.6) {
      const a = at(i, 0);
      f += `M${n(a[0])} ${n(a[1])}l0 1.8`;
    }
    p.line(f, 0.6, pal.cream.right);
  }
}

/** A clay bread oven (tenûr) sunk in a low mud-brick surround, its round mouth on top, a flat loaf cooling on its lid. */
export function tenur(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(depthOf(x + 7, y + 7));
  p.box(x, y, z, 15, 15, 6, pal.plaster);
  const [cx, cy] = iso(x + 7.5, y + 7.5, z + 6);
  p.cylinder(x + 7.5, y + 7.5, z + 6, 5.2, 5, pal.clay, { taper: 0.72 });
  p.fill(oval(cx, cy - 5, 2.6, 1.3), '#3a2318');
  // the lid leaning on it, and a round loaf on the surround
  const [lx, ly] = iso(x + 2.5, y + 13, z + 6);
  p.sil(oval(lx, ly - 1, 3.6, 1.8)).fill(oval(lx, ly - 1, 3.6, 1.8), pal.bread.left).line(`M${n(lx - 2)} ${n(ly - 1.2)}l1.3 0.5M${n(lx)} ${n(ly - 1.5)}l1.3 0.5`, 0.6);
  return p;
}

/** A samovar: a copper urn on its stand, a teapot on its crown, a little tap to the front. */
export function samovar(pal: Palette, x: number, y: number, z: number, s = 1): Part {
  const p = new Part(depthOf(x, y) + 1);
  p.cylinder(x, y, z, 2.4 * s, 1.6 * s, pal.copper, { taper: 0.7 });
  p.cylinder(x, y, z + 1.6 * s, 2.8 * s, 6.2 * s, pal.copper, { taper: 0.82 });
  p.cylinder(x, y, z + 7.8 * s, 1.2 * s, 1.3 * s, pal.copper);
  p.cylinder(x, y, z + 9.1 * s, 1.8 * s, 2 * s, pal.red, { taper: 0.6 });
  const [tx, ty] = iso(x, y + 2.6 * s, z + 3.4 * s);
  p.line(`M${n(tx)} ${n(ty)}l${n(-2 * s)} ${n(1.2 * s)}`, 1.4);
  return p;
}

/** A low stool, three legs and a woven seat. */
export function stool(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(depthOf(x, y));
  p.cylinder(x, y, z + 3, 2.6, 1.2, pal.straw);
  const [cx, cy] = iso(x, y, z);
  p.line(`M${n(cx - 2.8)} ${n(cy - 3)}l-0.6 3M${n(cx + 2.8)} ${n(cy - 3)}l0.6 3M${n(cx)} ${n(cy - 2.4)}l0 3`, 1.2);
  return p;
}

/** Two glasses of tea on a little tray. */
export function teaGlasses(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(depthOf(x, y) + 1);
  const [cx, cy] = iso(x, y, z);
  p.sil(oval(cx, cy, 5, 2.4)).fill(oval(cx, cy, 5, 2.4), pal.copper.top);
  for (const dx of [-2.2, 2.2]) {
    const g = `M${n(cx + dx - 1)} ${n(cy - 0.2)}l-0.4 -3.4h2.8l-0.4 3.4Z`;
    p.fill(g, '#b5401f', ' stroke-width="0.6"').flat(`M${n(cx + dx - 1.2)} ${n(cy - 3.2)}h2.4v0.8h-2.4Z`, '#f2b06a');
  }
  return p;
}

/** A beehive: a hollow log hive laid on a stand, or a tall woven skep on a stone. */
export function beehive(pal: Palette, x: number, y: number, z: number, kind: 'log' | 'skep'): Part {
  const p = new Part(depthOf(x, y));
  if (kind === 'skep') {
    p.cylinder(x, y, z, 4, 2, pal.rock);
    p.cylinder(x, y, z + 2, 4.2, 6, pal.straw, { taper: 0.55 });
    const [cx, cy] = iso(x, y, z + 2);
    p.line(`M${n(cx - 5.6)} ${n(cy - 1.5)}q5.6 2.6 11.2 0M${n(cx - 4.8)} ${n(cy - 3.6)}q4.8 2.2 9.6 0M${n(cx - 3.8)} ${n(cy - 5.6)}q3.8 1.8 7.6 0`, 0.6);
    p.fill(oval(cx - 1, cy + 0.6, 1.3, 1), '#3a2318', ' stroke="none"');
  } else {
    p.box(x - 4, y - 5, z, 2, 10, 4, pal.woodDark).box(x + 4, y - 5, z, 2, 10, 4, pal.woodDark);
    p.box(x - 6, y - 5, z + 4, 14, 10, 7, pal.wood);
    p.box(x - 7, y - 6, z + 11, 16, 12, 1.6, pal.roof);
    const [ex, ey] = iso(x + 1, y + 5, z + 6);
    p.fill(oval(ex, ey, 1.4, 0.9), '#3a2318', ' stroke="none"');
  }
  return p;
}

/** A haystack: a stout round heap, its top pulled to a point. */
export function haystack(pal: Palette, x: number, y: number, z: number, r: number): Part {
  const p = new Part(depthOf(x, y));
  const [cx, cy] = iso(x, y, z);
  const [rx, ry] = rim(r);
  const h = r * 1.5;
  const shape = `M${n(cx - rx)} ${n(cy)}Q${n(cx - rx * 1.05)} ${n(cy - h * 0.7)} ${n(cx)} ${n(cy - h)}Q${n(cx + rx * 1.05)} ${n(cy - h * 0.7)} ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 0 1 ${n(cx - rx)} ${n(cy)}Z`;
  p.sil(shape).flat(shape, pal.straw.left);
  p.flat(`M${n(cx + rx * 0.2)} ${n(cy - h * 0.98)}Q${n(cx + rx * 1.05)} ${n(cy - h * 0.7)} ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 0 1 ${n(cx + rx * 0.3)} ${n(cy + ry * 0.95)}Q${n(cx + rx * 0.5)} ${n(cy - h * 0.4)} ${n(cx + rx * 0.2)} ${n(cy - h * 0.98)}Z`, pal.straw.right);
  p.flat(`M${n(cx - rx * 0.7)} ${n(cy - h * 0.4)}Q${n(cx - rx * 0.6)} ${n(cy - h * 0.8)} ${n(cx - rx * 0.1)} ${n(cy - h * 0.92)}Q${n(cx - rx * 0.4)} ${n(cy - h * 0.6)} ${n(cx - rx * 0.7)} ${n(cy - h * 0.4)}Z`, pal.straw.top);
  p.line(`M${n(cx - rx * 0.5)} ${n(cy - h * 0.3)}l2 -3M${n(cx + rx * 0.1)} ${n(cy - h * 0.55)}l2 -3M${n(cx + rx * 0.55)} ${n(cy - h * 0.2)}l2 -3`, 0.6);
  return p;
}

/** A clay water jar, round-bellied with a narrow neck. */
export function jar(pal: Palette, x: number, y: number, z: number, s = 1, t?: Tri): Part {
  const p = new Part(depthOf(x, y) + 0.5);
  const tone = t ?? pal.clay;
  const [cx, cy] = iso(x, y, z);
  const shape = `M${n(cx - 1.4 * s)} ${n(cy - 8 * s)}h${n(2.8 * s)}l${n(0.3 * s)} ${n(1.6 * s)}Q${n(cx + 4 * s)} ${n(cy - 5.4 * s)} ${n(cx + 2.4 * s)} ${n(cy)}H${n(cx - 2.4 * s)}Q${n(cx - 4 * s)} ${n(cy - 5.4 * s)} ${n(cx - 1.7 * s)} ${n(cy - 6.4 * s)}Z`;
  p.sil(shape).fill(shape, tone.left).flat(`M${n(cx + 0.6 * s)} ${n(cy - 6 * s)}Q${n(cx + 4 * s)} ${n(cy - 5 * s)} ${n(cx + 2.4 * s)} ${n(cy)}H${n(cx + 0.9 * s)}Q${n(cx + 2.2 * s)} ${n(cy - 3.4 * s)} ${n(cx + 0.6 * s)} ${n(cy - 6 * s)}Z`, tone.right);
  p.fill(oval(cx, cy - 8 * s, 1.4 * s, 0.6 * s), '#3a2318', ' stroke-width="0.6"');
  return p;
}

/** A washing line between two posts with things hung on it to dry: a shirt, a cloth, a pair of socks. */
export function washingLine(pal: Palette, x: number, y: number, z: number, len: number, rand: Rand): Part {
  const p = new Part(depthOf(x + len / 2, y));
  p.box(x - 0.8, y - 0.8, z, 1.6, 1.6, 15, pal.woodDark).box(x + len - 0.8, y - 0.8, z, 1.6, 1.6, 15, pal.woodDark);
  const [ax, ay] = iso(x, y, z + 14);
  const [bx, by] = iso(x + len, y, z + 14);
  const mid: Pt = [(ax + bx) / 2, (ay + by) / 2 + 2.4];
  p.line(`M${n(ax)} ${n(ay)}Q${n(mid[0])} ${n(mid[1] + 2.4)} ${n(bx)} ${n(by)}`, 0.7);
  const colours = [pal.indigo, pal.cream, pal.saffron, pal.green];
  const at = (f: number): Pt => [ax + (bx - ax) * f, ay + (by - ay) * f + 4.8 * f * (1 - f) * 2];
  [0.2, 0.42, 0.66, 0.85].forEach((f, i) => {
    const [hx, hy] = at(f);
    const w = i === 1 ? 6 : 4.4;
    const h = i === 1 ? 7 : 5 + rand() * 1.5;
    const piece = `M${n(hx - w / 2)} ${n(hy - (w / 2) * 0.5)}L${n(hx + w / 2)} ${n(hy + (w / 2) * 0.5)}L${n(hx + w / 2)} ${n(hy + (w / 2) * 0.5 + h)}L${n(hx - w / 2)} ${n(hy - (w / 2) * 0.5 + h)}Z`;
    p.sil(piece).fill(piece, colours[i % colours.length]!.left);
  });
  return p;
}

/** A lantern hung from a bracket; it glows at dusk. */
export function lantern(pal: Palette, sx: number, sy: number): string {
  return `<path d="M${n(sx)} ${n(sy)}v2.4" fill="none"/><path d="${disc(sx, sy + 4.2, 2)}" fill="${pal.dusk ? '#ffd36b' : pal.saffron.left}"/>${pal.dusk ? `<path d="${disc(sx, sy + 4.2, 4.6)}" fill="#ffd36b" fill-opacity="0.25" stroke="none"/>` : ''}`;
}

/** A sack, slumped, tied at the neck, with what is in it showing at the top. */
export function sack(pal: Palette, x: number, y: number, z: number, top: string): Part {
  const p = new Part(depthOf(x, y) + 0.5);
  const [cx, cy] = iso(x, y, z);
  const shape = `M${n(cx - 4)} ${n(cy)}Q${n(cx - 5.4)} ${n(cy - 5)} ${n(cx - 3.2)} ${n(cy - 7.6)}H${n(cx + 3.2)}Q${n(cx + 5.4)} ${n(cy - 5)} ${n(cx + 4)} ${n(cy)}Q${n(cx)} ${n(cy + 1.6)} ${n(cx - 4)} ${n(cy)}Z`;
  p.sil(shape).fill(shape, pal.cloth.left).flat(`M${n(cx + 1)} ${n(cy - 7.4)}H${n(cx + 3.2)}Q${n(cx + 5.4)} ${n(cy - 5)} ${n(cx + 4)} ${n(cy)}Q${n(cx + 2.4)} ${n(cy + 0.9)} ${n(cx + 1.4)} ${n(cy + 1)}Q${n(cx + 2.4)} ${n(cy - 4)} ${n(cx + 1)} ${n(cy - 7.4)}Z`, pal.cloth.right);
  p.fill(oval(cx, cy - 7.6, 3.2, 1.4), top, ' stroke-width="0.6"');
  return p;
}

/** A stack of round flat loaves (nan) on a cloth. */
export function breadStack(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(depthOf(x, y) + 1);
  for (let i = 0; i < 3; i++) {
    const [cx, cy] = iso(x, y, z + i * 1.4);
    p.sil(oval(cx, cy, 5, 2.4)).fill(oval(cx, cy, 5, 2.4), pal.bread.left);
    if (i === 2) p.flat(oval(cx - 0.6, cy - 0.4, 3.6, 1.5), pal.bread.top).line(`M${n(cx - 2)} ${n(cy - 0.4)}l1 0.4M${n(cx + 0.4)} ${n(cy - 0.8)}l1 0.4M${n(cx - 0.4)} ${n(cy + 0.6)}l1 0.4`, 0.5);
  }
  return p;
}

/** A ladder leaning on a wall, from a foot on the ground to a top against the wall. */
export function ladder(pal: Palette, foot: readonly [number, number, number], top: readonly [number, number, number]): Part {
  const p = new Part(depthOf(foot[0], foot[1]) + 0.5);
  const a = iso(foot[0], foot[1], foot[2]);
  const b = iso(top[0], top[1], top[2]);
  const off = 2.4;
  let rails = `M${n(a[0] - off)} ${n(a[1])}L${n(b[0] - off)} ${n(b[1])}M${n(a[0] + off)} ${n(a[1])}L${n(b[0] + off)} ${n(b[1])}`;
  const rungs = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
  for (let i = 1; i < rungs; i++) {
    const f = i / rungs;
    const x = a[0] + (b[0] - a[0]) * f;
    const y = a[1] + (b[1] - a[1]) * f;
    rails += `M${n(x - off)} ${n(y)}L${n(x + off)} ${n(y)}`;
  }
  p.line(rails, 2.6).line(rails, 1.1, pal.wood.left);
  return p;
}

/** A pile of new planks and a few cut stones, waiting to be built with. */
export function planks(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(depthOf(x + 8, y + 5));
  for (let i = 0; i < 3; i++) p.box(x + (i % 2) * 1.2, y + i * 0.6, z + i * 1.6, 18, 4.4, 1.6, pal.wood);
  p.box(x + 4, y + 7, z, 5, 4, 3, pal.stone).box(x + 10, y + 7.5, z, 4.6, 4, 3, pal.stoneGrey).box(x + 6.5, y + 7.3, z + 3, 4.6, 3.6, 2.6, pal.stone);
  return p;
}

/**
 * Scaffolding round a box being built: poles at its corners and along its
 * faces, boards across at each lift, cross-braces, and a ladder up one side.
 * Two parts, so the back half stands behind the work and the front half in
 * front of it.
 */
export function scaffold(pal: Palette, x: number, y: number, z: number, w: number, d: number, h: number): { back: Part; front: Part } {
  const back = new Part(depthOf(x, y));
  const front = new Part(depthOf(x + w, y + d) + 2);
  const pole = (p: Part, px: number, py: number): void => {
    const a = iso(px, py, z);
    const b = iso(px, py, z + h + 4);
    p.line(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`, 2.6).line(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`, 1.2, pal.wood.top);
  };
  const board = (p: Part, ax: number, ay: number, bx: number, by: number, bz: number): void => {
    const a = iso(ax, ay, bz);
    const b = iso(bx, by, bz);
    p.line(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`, 3.6).line(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`, 2, pal.wood.left);
  };
  const lifts = h > 24 ? [h * 0.45, h] : [h * 0.7];
  pole(back, x - 3, y - 3);
  pole(back, x + w + 3, y - 3);
  pole(back, x - 3, y + d + 3);
  for (const lz of lifts) {
    board(back, x - 3, y - 3, x + w + 3, y - 3, z + lz);
    board(back, x - 3, y - 3, x - 3, y + d + 3, z + lz);
  }
  pole(front, x + w + 3, y + d + 3);
  pole(front, x + w / 2, y + d + 3);
  pole(front, x + w + 3, y + d / 2);
  for (const lz of lifts) {
    board(front, x - 3, y + d + 3, x + w + 3, y + d + 3, z + lz);
    board(front, x + w + 3, y - 3, x + w + 3, y + d + 3, z + lz);
  }
  // a brace across the near left face
  const c1 = iso(x - 3, y + d + 3, z + 1);
  const c2 = iso(x + w / 2, y + d + 3, z + lifts[0]!);
  front.line(`M${n(c1[0])} ${n(c1[1])}L${n(c2[0])} ${n(c2[1])}`, 2.2).line(`M${n(c1[0])} ${n(c1[1])}L${n(c2[0])} ${n(c2[1])}`, 0.9, pal.wood.right);
  return { back, front };
}

/** A pickaxe and a shovel leaning together, and a bucket. */
export function tools(pal: Palette, x: number, y: number, z: number): Part {
  const p = new Part(depthOf(x, y));
  p.cylinder(x, y, z, 2.4, 4, pal.stoneGrey, { taper: 1.15 });
  const [cx, cy] = iso(x + 4, y - 2, z);
  p.line(`M${n(cx)} ${n(cy)}l3 -12M${n(cx + 4)} ${n(cy)}l-1.6 -12`, 2.4).line(`M${n(cx)} ${n(cy)}l3 -12M${n(cx + 4)} ${n(cy)}l-1.6 -12`, 1, pal.wood.left);
  const blade = `M${n(cx - 1.4)} ${n(cy - 1)}l2.6 0.4l0.4 3.2l-2.8 -0.2Z`;
  p.fill(blade, pal.stoneGrey.left, ' stroke-width="0.8"');
  return p;
}

/**
 * The village gate: two stone posts and a timber beam across them, over a
 * path running along y (`across` 'y', the posts apart along y) or along x.
 * The far post, the beam and the near post are three parts, so whatever
 * walks through it passes between them.
 */
export function gate(pal: Palette, x: number, y: number, z: number, span: number, across: 'x' | 'y' = 'y'): Part[] {
  const [fx, fy] = [x, y];
  const [nx, ny] = across === 'y' ? [x, y + span] : [x + span, y];
  const far = new Part(depthOf(fx, fy));
  far.box(fx - 3, fy - 3, z, 6, 6, 22, pal.stoneGrey).box(fx - 3.6, fy - 3.6, z + 22, 7.2, 7.2, 2, pal.stone);
  const near = new Part(depthOf(nx, ny) + 2);
  near.box(nx - 3, ny - 3, z, 6, 6, 22, pal.stoneGrey).box(nx - 3.6, ny - 3.6, z + 22, 7.2, 7.2, 2, pal.stone);
  const beam = new Part(depthOf(nx, ny) + 3);
  if (across === 'y') beam.box(x - 2, y - 5, z + 24, 4, span + 10, 3, pal.woodDark);
  else beam.box(x - 5, y - 2, z + 24, span + 10, 4, 3, pal.woodDark);
  return [far, near, beam];
}

export { arched };

/**
 * A waymark: a little pile of three flat stones by a track, each smaller than
 * the one under it, in the cairn's own stone, half sunk in the grass, so the
 * way up to the cairn is marked as shepherds mark it. Its foot at (x, y, z).
 */
export function waymark(pal: Palette, x: number, y: number, z: number, rand: Rand, k = 1): Part {
  const tones = cairnTones(pal);
  const p = new Part(depthOf(x, y));
  const [cx, cy] = iso(x, y, z);
  const marks: StoneMarks = { lit: [], under: [], end: [], outline: [], cracks: [] };
  const s = (v: number): number => v * k;
  // [left, bottom, width, height]
  for (const [l, b, w, h] of [[-4.4, 0, 8.6, 3.2], [-3, 3, 6, 2.8], [-1.6, 5.6, 3.6, 2.6]] as const) cairnStone(p, marks, cx + s(l), cy - s(b), s(w), s(h), tones, rand, { round: s(1), top: s(0.4) });
  p.flat(marks.lit.join(''), tones.stone.top).flat(marks.under.join(''), tones.under).flat(marks.end.join(''), tones.stone.right);
  p.line(marks.outline.join(''));
  // the grass up round its foot
  p.line(`M${n(cx - s(5))} ${n(cy + s(0.4))}l${n(-s(0.6))} ${n(-s(2))}M${n(cx + s(4.6))} ${n(cy + s(0.4))}l${n(s(0.5))} ${n(-s(2.2))}M${n(cx + s(3.4))} ${n(cy + s(0.6))}l0 ${n(-s(1.8))}`, 1.4).line(`M${n(cx - s(5))} ${n(cy + s(0.4))}l${n(-s(0.6))} ${n(-s(2))}M${n(cx + s(4.6))} ${n(cy + s(0.4))}l${n(s(0.5))} ${n(-s(2.2))}M${n(cx + s(3.4))} ${n(cy + s(0.6))}l0 ${n(-s(1.8))}`, 0.7, pal.leaf.left);
  return p;
}

// ───────────────────────────────────────────────────────────── the cairn

/**
 * The cairn's colours, as the owner's picture has them: weathered grey stone,
 * lighter where the sky falls on it and going warm brown underneath; a knoll
 * of dry golden grass; and big blue-grey rocks breaking through it.
 */
function cairnTones(pal: Palette): { stone: Tri; under: string; boulder: Tri; grass: Tri; straw: string; lichen: string } {
  return pal.dusk
    ? {
        stone: { top: '#aaa0a2', left: '#877b7e', right: '#685a5c' },
        under: '#58423f',
        boulder: { top: '#a3afc6', left: '#8290aa', right: '#636f8b' },
        grass: { top: '#dcae55', left: '#c98f3c', right: '#a26a2b' },
        straw: '#8a5a26',
        lichen: '#d9d4cf',
      }
    : {
        stone: { top: '#bdb4aa', left: '#978b81', right: '#74665d' },
        under: '#6a5046',
        boulder: { top: '#c3d2e0', left: '#9cb1c6', right: '#7489a2' },
        grass: { top: '#f3c552', left: '#e2a334', right: '#bf7d22' },
        straw: '#a8681c',
        lichen: '#f2efe8',
      };
}

/**
 * One stone of the cairn, seen face on: a rough slab with softened corners,
 * its top catching the light, its face in the stone's own grey, going warm
 * brown along its underside and down its right end, away from the light.
 * Screen units; its foot's left end at (l, b).
 */
/** The patches of light and shade, the outlines and the cracks of all the cairn's stones, each kind laid down as one path once every face is in place. */
interface StoneMarks {
  lit: string[];
  under: string[];
  end: string[];
  outline: string[];
  cracks: string[];
}

function cairnStone(p: Part, marks: StoneMarks, l: number, b: number, w: number, h: number, tones: ReturnType<typeof cairnTones>, rand: Rand, o: { tilt?: number; top?: number; round?: number } = {}): void {
  const t = tones.stone;
  const j = (k: number): number => (rand() - 0.5) * k;
  const tilt = o.tilt ?? 0;
  const top = o.top ?? 0;
  const r = Math.min(o.round ?? 1.1, h * 0.32, w * 0.2);
  // the four corners, nudged by hand; the top edge bows a little
  const bl: Pt = [l + j(0.5), b + j(0.3)];
  const br: Pt = [l + w + j(0.5), b - tilt + j(0.3)];
  const tr: Pt = [l + w + j(0.6), b - h - tilt + j(0.5)];
  const tl: Pt = [l + j(0.6), b - h + j(0.5)];
  const bow = j(0.8) - 0.3;
  const outline =
    `M${n(bl[0] + r)} ${n(bl[1])}L${n(br[0] - r)} ${n(br[1])}Q${n(br[0])} ${n(br[1])} ${n(br[0])} ${n(br[1] - r)}` +
    `L${n(tr[0])} ${n(tr[1] + r)}Q${n(tr[0])} ${n(tr[1])} ${n(tr[0] - r)} ${n(tr[1])}` +
    `Q${n((tl[0] + tr[0]) / 2)} ${n((tl[1] + tr[1]) / 2 + bow)} ${n(tl[0] + r)} ${n(tl[1])}` +
    `Q${n(tl[0])} ${n(tl[1])} ${n(tl[0])} ${n(tl[1] + r)}L${n(bl[0])} ${n(bl[1] - r)}Q${n(bl[0])} ${n(bl[1])} ${n(bl[0] + r)} ${n(bl[1])}Z`;
  // the top seen a little from above: a lit band behind the face
  if (top > 0) {
    const back = `M${n(tl[0] + r)} ${n(tl[1])}L${n(tl[0] + r * 0.6)} ${n(tl[1] - top)}L${n(tr[0] - r * 0.6)} ${n(tr[1] - top)}L${n(tr[0] - r)} ${n(tr[1])}Z`;
    p.sil(back).fill(back, t.top);
  }
  p.sil(outline).fill(outline, t.left);
  // the light across its upper face, the warm shade along its underside and down its far end
  const lit = 0.32 + rand() * 0.08;
  marks.lit.push(
    `M${n(tl[0] + r * 0.4)} ${n(tl[1] + 0.5)}L${n(tr[0] - r * 0.5)} ${n(tr[1] + 0.5)}L${n(tr[0] - w * 0.2)} ${n(tr[1] + h * lit)}Q${n(l + w * 0.45)} ${n(b - h * (1 - lit) + j(0.6))} ${n(tl[0] + 0.5)} ${n(tl[1] + h * lit * 1.2)}Z`,
  );
  const under = 0.3 + rand() * 0.1;
  marks.under.push(
    `M${n(bl[0] + r * 0.3)} ${n(bl[1] - h * under)}Q${n(l + w * 0.5)} ${n(b - h * under - 0.8 + j(0.8))} ${n(br[0] - w * 0.16)} ${n(br[1] - h * (under + 0.1))}` +
      `L${n(tr[0] - w * 0.12)} ${n(tr[1] + h * 0.35)}L${n(tr[0] - 0.4)} ${n(tr[1] + r)}L${n(br[0] - 0.4)} ${n(br[1] - r)}L${n(bl[0] + r)} ${n(bl[1] - 0.4)}Z`,
  );
  marks.end.push(`M${n(tr[0] - w * 0.12)} ${n(tr[1] + h * 0.35)}L${n(tr[0] - 0.4)} ${n(tr[1] + r)}L${n(br[0] - 0.4)} ${n(br[1] - r)}L${n(br[0] - w * 0.16)} ${n(br[1] - h * 0.2)}Z`);
  marks.outline.push(outline);
  // a crack down from its top edge
  const cx = l + w * (0.2 + rand() * 0.6);
  marks.cracks.push(`M${n(cx)} ${n(b - h * 0.95)}l${n(0.3 + j(0.6))} ${n(h * 0.3)}l${n(0.8)} ${n(h * 0.12)}`);
}

/**
 * A big blue-grey rock breaking through the knoll: angular, faceted, its
 * upper face lit, its right face in shade, as the owner's picture has them.
 * Its foot's middle at (cx, cy); w across, h tall.
 */
function boulder(rocks: { face: string[]; top: string[]; side: string[]; sil: string[] }, cx: number, cy: number, w: number, h: number, rand: Rand): void {
  const j = (k: number): number => (rand() - 0.5) * k;
  const peak: Pt = [cx - w * (0.05 + rand() * 0.15), cy - h];
  const left: Pt = [cx - w * 0.5, cy + j(0.4)];
  const shoulder: Pt = [cx - w * 0.38 + j(0.6), cy - h * (0.55 + j(0.2))];
  const ridge: Pt = [cx + w * (0.18 + j(0.1)), cy - h * (0.7 + j(0.15))];
  const right: Pt = [cx + w * 0.5, cy + j(0.4)];
  const foot: Pt = [cx + w * 0.08, cy + h * 0.08];
  const shape = poly([left, shoulder, peak, ridge, right, foot]);
  rocks.sil.push(shape);
  rocks.face.push(shape);
  rocks.top.push(poly([shoulder, peak, ridge, [cx + w * 0.02, cy - h * 0.42]]));
  rocks.side.push(poly([ridge, right, foot, [cx + w * 0.02, cy - h * 0.42]]));
}

/** Rocks laid down together: their outline, their faces, then their lit tops and shaded sides, one path each. */
function rocksOn(p: Part, rocks: { face: string[]; top: string[]; side: string[]; sil: string[] }, t: Tri): void {
  p.sil(rocks.sil.join('')).fill(rocks.face.join(''), t.left).fill(rocks.top.join(''), t.top).fill(rocks.side.join(''), t.right);
}

const noRocks = (): { face: string[]; top: string[]; side: string[]; sil: string[] } => ({ face: [], top: [], side: [], sil: [] });

/**
 * A stone cairn standing on a knoll of dry golden grass, blue-grey rocks
 * breaking through the knoll, as in the owner's picture: two broad standing
 * stones for legs, the right one shorter and made up with a flat stone on
 * it; a thick slab across them, the widest of all; two small stones; a
 * narrower slab for the arms; and a small square head stone with a hole worn
 * through it high up. The waymark shepherds stack where a mountain path
 * needs one. Its foot (the knoll's middle) at (x, y, z); `k` scales the whole
 * of it. Built face on, the light from the upper left.
 *
 * Returned back to front: the knoll with the rocks behind the cairn, the
 * cairn, and the rocks in front of it, each its own part so the scene can
 * sort them among its other things.
 *
 * With `outcrop`, the same stones stand instead on a shelf of rock breaking
 * out of a green hillside, as the village has it: no knoll of its own, the
 * grass growing up round the rocks' feet so the outcrop is part of the hill.
 */
export function cairn(pal: Palette, x: number, y: number, z: number, rand: Rand, k = 1, o: { outcrop?: boolean } = {}): Part[] {
  const tones = cairnTones(pal);
  const s = (v: number): number => v * k;
  const out: Part[] = [];
  const [cx, cy] = iso(x, y, z);

  // the knoll: a broad mound of golden grass, its crown a little left of middle, its right side in shade
  // an outcrop stands broader and higher than the knoll, so the cairn stands up on it out of the hill
  const rx = s(o.outcrop ? 30 : 25);
  const ry = s(8.5);
  const rise = s(o.outcrop ? 15 : 9);
  const crown: Pt = [cx - s(1), cy - ry * 0.35 - rise];
  const knoll = new Part(depthOf(x, y) - 1);
  if (o.outcrop) outcrop(pal, knoll, cx, cy, crown, rx, ry, rise, s, rand);
  else {
    const dome =
      `M${n(cx - rx)} ${n(cy)}C${n(cx - rx * 0.92)} ${n(cy - rise * 0.9)} ${n(cx - rx * 0.55)} ${n(crown[1] - s(0.6))} ${n(crown[0] - s(4))} ${n(crown[1])}` +
      `L${n(crown[0] + s(5))} ${n(crown[1] + s(0.3))}C${n(cx + rx * 0.55)} ${n(crown[1] + s(0.4))} ${n(cx + rx * 0.95)} ${n(cy - rise * 0.8)} ${n(cx + rx)} ${n(cy)}` +
      `A${n(rx)} ${n(ry)} 0 0 1 ${n(cx - rx)} ${n(cy)}Z`;
    knoll.sil(dome).flat(dome, tones.grass.left);
    // the shade down its right side, and the sun on its crown and left shoulder
    knoll.flat(
      `M${n(crown[0] + s(6))} ${n(crown[1] + s(0.4))}C${n(cx + rx * 0.55)} ${n(crown[1] + s(0.5))} ${n(cx + rx * 0.95)} ${n(cy - rise * 0.8)} ${n(cx + rx)} ${n(cy)}` +
        `A${n(rx)} ${n(ry)} 0 0 1 ${n(cx + rx * 0.2)} ${n(cy + ry * 0.98)}C${n(cx + rx * 0.35)} ${n(cy - rise * 0.2)} ${n(cx + rx * 0.3)} ${n(crown[1] + s(4))} ${n(crown[0] + s(6))} ${n(crown[1] + s(0.4))}Z`,
      tones.grass.right,
    );
    knoll.flat(
      `M${n(cx - rx * 0.86)} ${n(cy - rise * 0.55)}C${n(cx - rx * 0.7)} ${n(crown[1] + s(1))} ${n(crown[0] - s(6))} ${n(crown[1] + s(0.2))} ${n(crown[0] + s(2))} ${n(crown[1] + s(0.6))}` +
        `C${n(crown[0] - s(4))} ${n(crown[1] + s(3.4))} ${n(cx - rx * 0.6)} ${n(cy - rise * 0.35)} ${n(cx - rx * 0.86)} ${n(cy - rise * 0.55)}Z`,
      tones.grass.top,
    );
    // strokes of the dry grass, swept by the wind
    let stalks = '';
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.25 + rand() * 0.65;
      const sx = cx + Math.cos(a) * rx * r;
      const sy = cy + Math.sin(a) * ry * r - rise * (1 - r) * 0.9;
      stalks += `M${n(sx)} ${n(sy)}q${n(s(0.8))} ${n(-s(1.2))} ${n(s(2.2))} ${n(-s(1.6))}`;
    }
    knoll.line(stalks, 0.7, tones.straw);
    // the rocks behind the cairn, breaking through the knoll's shoulders
    const behind = noRocks();
    boulder(behind, cx - s(18.5), cy - rise * 0.35, s(9), s(5.5), rand);
    boulder(behind, cx + s(18), cy - rise * 0.4, s(11), s(7), rand);
    rocksOn(knoll, behind, tones.boulder);
  }
  out.push(knoll);

  // the cairn on the crown, measured off the picture: its widest slab thirty across, the whole of it thirty-three high
  const c = new Part(depthOf(x, y));
  const foot = crown[1] + s(1.2);
  const X = (u: number): number => cx + s(u);
  const Y = (v: number): number => foot - s(v);
  const S = s;
  // [left, bottom, width, height, options]
  const stones: readonly (readonly [number, number, number, number, { tilt?: number; top?: number; round?: number }])[] = [
    [-13.6, 0, 10.8, 14.6, { round: 1.6 }], // the left leg, the taller
    [2.4, 0.9, 11.4, 9.7, { round: 1.4 }], // the right leg, shorter
    [2.6, 10.5, 9.6, 4, { round: 1, tilt: -0.2 }], // the flat stone that makes it up
    [-15, 14.4, 30, 7.2, { round: 2.2, top: 0.6, tilt: 0.3 }], // the thick slab across them
    [-9.2, 21.3, 6.4, 4, { round: 1.2 }], // two small stones, sky between them
    [1.4, 21.2, 7.8, 4.1, { round: 1.2 }],
    [-12.2, 25, 25.8, 3.9, { round: 1.6, top: 0.6, tilt: -0.3 }], // the arms, narrower than the slab below
    [-2.6, 28.8, 6.2, 4.8, { round: 1 }], // the head
  ];
  const marks: StoneMarks = { lit: [], under: [], end: [], outline: [], cracks: [] };
  for (const [l, v, w, h, o] of stones) cairnStone(c, marks, X(l), Y(v), S(w), S(h), tones, rand, { ...o, tilt: S(o.tilt ?? 0), top: S(o.top ?? 0), round: S(o.round ?? 1.1) });
  c.flat(marks.lit.join(''), tones.stone.top).flat(marks.under.join(''), tones.under).flat(marks.end.join(''), tones.stone.right);
  c.line(marks.outline.join('')).line(marks.cracks.join(''), 0.55);
  // the hole worn through the head, high up: dark inside, its lower rim catching the light
  const hx = X(0.5);
  const hy = Y(31.6);
  c.fill(oval(hx, hy, S(1.15), S(1.2)), pal.dusk ? '#2c2430' : '#3d3330', ' stroke-width="0.8"');
  c.line(`M${n(hx - S(1))} ${n(hy + S(0.4))}Q${n(hx)} ${n(hy + S(1.5))} ${n(hx + S(1))} ${n(hy + S(0.4))}`, 0.6, tones.stone.top);
  // white lichen low on the left leg, as in the picture
  let lichen = '';
  for (let i = 0; i < 6; i++) lichen += disc(X(-11.5 + rand() * 4), Y(1.2 + rand() * 4.5), S(0.3 + rand() * 0.3));
  c.flat(lichen, tones.lichen);
  out.push(c);

  // the rocks in front, half buried in the grass
  const front = new Part(depthOf(x, y) + 1);
  const ahead = noRocks();
  boulder(ahead, cx - s(7), cy + s(2.5), s(14), s(7), rand);
  boulder(ahead, cx + s(15), cy - s(0.5), s(9), s(5.5), rand);
  boulder(ahead, cx - s(20), cy - s(0.8), s(5.5), s(3.2), rand);
  rocksOn(front, ahead, tones.boulder);
  let pebbles = '';
  for (const [u, v, r] of [[3, 4.5, 0.8], [7, 3, 0.6], [-14, 4, 0.7], [11, 5.5, 0.55]] as const) pebbles += oval(cx + s(u), cy + s(v), s(r * 1.3), s(r));
  front.flat(pebbles, tones.boulder.right);
  out.push(front);
  return out;
}

/**
 * The cairn's ground as an outcrop: the rocks behind it on the hill's
 * shoulders, a broad shelf of rock under it, its top lit and its right face
 * in shade, moss on its cool side, and tufts of the hill's grass round its
 * feet. It draws from the cairn's scatter exactly as the knoll would, so the
 * stones above come out the same.
 */
function outcrop(pal: Palette, p: Part, cx: number, cy: number, crown: Pt, rx: number, ry: number, rise: number, s: (v: number) => number, rand: Rand): void {
  const tones = cairnTones(pal);
  // where the knoll's stalks would go, its scatter taken the same way: here, tufts of grass round the outcrop's foot
  let tufts = '';
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand();
    const tx = cx + Math.cos(a) * rx * (0.62 + r * 0.3);
    const ty = cy + Math.abs(Math.sin(a)) * ry * (0.3 + r * 0.4) - s(0.4);
    tufts += `M${n(tx - s(1.6))} ${n(ty)}l${n(-s(0.5))} ${n(-s(2.2))}M${n(tx)} ${n(ty)}l0 ${n(-s(3))}M${n(tx + s(1.6))} ${n(ty)}l${n(s(0.6))} ${n(-s(2))}`;
  }
  // the rocks behind, on the hill's shoulders, as the knoll has them
  const behind = noRocks();
  boulder(behind, cx - s(18.5), cy - rise * 0.35, s(9), s(5.5), rand);
  boulder(behind, cx + s(18), cy - rise * 0.4, s(11), s(7), rand);
  rocksOn(p, behind, tones.boulder);
  // the shelf the cairn stands on: a broad block of the hill's rock, its top flat
  const t = tones.boulder;
  const L: Pt = [cx - rx * 0.78, cy + s(0.6)];
  const back: Pt = [crown[0] - s(14), crown[1] + s(0.6)];
  const ridge: Pt = [crown[0] + s(12), crown[1] - s(0.2)];
  const R: Pt = [cx + rx * 0.8, cy - s(0.4)];
  const toe: Pt = [cx + s(3), cy + ry * 0.55];
  const lip: Pt = [crown[0] + s(9.5), crown[1] + s(3.4)];
  const lipL: Pt = [crown[0] - s(11.5), crown[1] + s(3.8)];
  const shelf = poly([L, [cx - rx * 0.66, cy - rise * 0.55], back, ridge, [cx + rx * 0.62, cy - rise * 0.6], R, toe]);
  p.sil(shelf).fill(shelf, t.left);
  p.fill(poly([back, ridge, lip, lipL]), t.top, ' stroke-width="0.8"');
  p.flat(poly([ridge, [cx + rx * 0.62, cy - rise * 0.6], R, toe, [cx + s(1), cy + s(1.6)], lip]), t.right);
  // a ledge and a crack across its face, and moss on its cool left side
  p.line(`M${n(cx - rx * 0.6)} ${n(cy - rise * 0.3)}q${n(s(6))} ${n(-s(1.2))} ${n(s(12))} ${n(s(0.4))}M${n(cx + s(4))} ${n(lip[1] + s(0.6))}l${n(s(1.2))} ${n(s(3.4))}l${n(s(1.6))} ${n(s(1.2))}`, 0.6);
  const moss = `M${n(cx - rx * 0.7)} ${n(cy - s(0.2))}q${n(s(1))} ${n(-s(3.6))} ${n(s(5))} ${n(-s(4.4))}q${n(s(2))} ${n(s(1.6))} ${n(s(1.4))} ${n(s(4.6))}Z`;
  p.flat(moss + disc(lipL[0] + s(2.4), lipL[1] - s(0.6), s(1.1)), pal.leaf.left);
  // the hill's grass growing up round its feet, so it sits in the hill rather than on it
  p.line(tufts, 1.5).line(tufts, 0.8, pal.leaf.left);
}
