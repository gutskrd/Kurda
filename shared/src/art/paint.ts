/**
 * How light is put down, shared by the badges, emblems and frames so they are
 * lit the same way: one light from the upper left, flat facets instead of
 * airbrushed metal, glow from within instead of drop shadows, and an edge in
 * the piece's own darkest tone instead of an ink outline.
 */
import { signedArea } from './geometry.js';
import type { Metal } from './palette.js';
import type { Drawing, Pt } from './svg.js';
import { linearAt, linearBox, mix, n, n2, polyPath, radialAt } from './svg.js';

/** Where the light comes from: up and to the left. */
const LIGHT: Pt = [-0.45, -0.89];

/** A metal lit from the upper left across the box x1,y1 → x2,y2. Returns the gradient's id. */
export function metalAcross(dr: Drawing, m: Metal, x1: number, y1: number, x2: number, y2: number): string {
  const id = dr.id('m');
  dr.def(
    linearAt(
      id,
      [
        [0, m.hi],
        [0.3, m.light],
        [0.68, m.mid],
        [1, m.dark],
      ],
      x1,
      y1,
      x2,
      y2,
    ),
  );
  return id;
}

/** The bright half of a metal, lit from above over each shape's own box: what a glyph is made of. */
export function metalBox(dr: Drawing, m: Metal): string {
  const id = dr.id('b');
  dr.def(
    linearBox(id, [
      [0, m.hi],
      [1, m.light],
    ]),
  );
  return id;
}

/** The metal's shaded face, over each shape's own box. */
export function metalBoxDark(dr: Drawing, m: Metal): string {
  const id = dr.id('b');
  dr.def(
    linearBox(id, [
      [0, m.light],
      [1, m.mid],
    ]),
  );
  return id;
}

/** Five tones from lit to shaded, for flat facets. */
function tones(m: Metal): string[] {
  return [m.hi, mix(m.hi, m.light, 0.55), m.light, mix(m.light, m.mid, 0.5), m.mid, mix(m.mid, m.dark, 0.5), m.dark];
}

/**
 * A faceted band between an outline and the same outline moved in: the band
 * is cut where its face turns, each facet one flat tone by how squarely it
 * faces the light. `steps` sets how many tones there are, so a higher tier is
 * cut finer — more facets, more sparkle — on the same shape.
 *
 * Runs of segments with the same tone are merged into one piece, so a straight
 * side is one facet and a circle becomes a cut stone.
 */
export function facetBand(outer: readonly Pt[], inner: readonly Pt[], m: Metal, steps: number, under = true): string {
  const count = outer.length;
  const palette = tones(m);
  const sign = signedArea(outer) >= 0 ? 1 : -1;
  const levelOf = (i: number): number => {
    const a = outer[i] as Pt;
    const b = outer[(i + 1) % count] as Pt;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // the outward normal
    const nx = (sign * (b[1] - a[1])) / len;
    const ny = (-sign * (b[0] - a[0])) / len;
    const d = nx * LIGHT[0] + ny * LIGHT[1];
    const t = (1 - d) / 2;
    return Math.min(steps - 1, Math.max(0, Math.floor(t * steps)));
  };
  const levels = outer.map((_, i) => levelOf(i));
  // start a run where the level changes, so no run wraps past the end
  let start = 0;
  for (let i = 0; i < count; i++) {
    if (levels[i] !== levels[(i - 1 + count) % count]) {
      start = i;
      break;
    }
  }
  const byColour = new Map<string, string[]>();
  let i = 0;
  while (i < count) {
    const first = (start + i) % count;
    const level = levels[first] as number;
    let j = i;
    while (j + 1 < count && levels[(start + j + 1) % count] === level) j++;
    const pts: Pt[] = [];
    for (let k = i; k <= j + 1; k++) pts.push(outer[(start + k) % count] as Pt);
    for (let k = j + 1; k >= i; k--) pts.push(inner[(start + k) % count] as Pt);
    const colour = palette[Math.round((level / Math.max(1, steps - 1)) * (palette.length - 1))] as string;
    const list = byColour.get(colour) ?? [];
    list.push(polyPath(pts));
    byColour.set(colour, list);
    i = j + 1;
  }
  const base = under ? `<path d="${polyPath(outer)}${polyPath(inner)}" fill="${m.mid}" fill-rule="evenodd"/>` : '';
  return base + [...byColour].map(([colour, ds]) => `<path d="${ds.join('')}" fill="${colour}"/>`).join('');
}

/** An edge in the piece's own darkest tone: what holds a pale piece on a pale page. */
export function edge(d: string, colour: string, width = 1.2, opacity = 0.85): string {
  return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n2(width)}" stroke-opacity="${n2(opacity)}" stroke-linejoin="round"/>`;
}

/** A halo of light behind a piece: a radial fade from `colour` to nothing. */
export function halo(dr: Drawing, cx: number, cy: number, r: number, colour: string, opacity: number, core = 0): string {
  const id = dr.id('o');
  dr.def(
    radialAt(
      id,
      [
        [0, colour, opacity],
        [Math.max(0.01, core), colour, opacity],
        [0.55, colour, opacity * 0.4],
        [1, colour, 0],
      ],
      cx,
      cy,
      r,
    ),
  );
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${id})"/>`;
}

/**
 * Rays bursting from cx,cy between radii r0 and r1, fading as they go: thin
 * spikes, every other one longer. `from`/`to` limit them to an arc (degrees,
 * 0 = right, clockwise); by default all the way round.
 */
export function rays(
  dr: Drawing,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  count: number,
  colour: string,
  opacity = 0.9,
  arc: readonly [number, number] = [-90, 270],
): string {
  const id = dr.id('r');
  dr.def(
    radialAt(
      id,
      [
        [0, colour, opacity],
        [r0 / r1, colour, opacity],
        [1, colour, 0],
      ],
      cx,
      cy,
      r1,
    ),
  );
  const out: string[] = [];
  const full = Math.abs(arc[1] - arc[0]) >= 360;
  const stepDeg = (arc[1] - arc[0]) / (full ? count : Math.max(1, count - 1));
  for (let i = 0; i < count; i++) {
    const deg = arc[0] + i * stepDeg;
    const a = (deg * Math.PI) / 180;
    const long = i % 2 === 0;
    const len = long ? r1 : r0 + (r1 - r0) * 0.62;
    const half = (long ? 2.6 : 1.8) / r0;
    out.push(
      `M${n(cx + Math.cos(a - half) * r0)},${n(cy + Math.sin(a - half) * r0)}L${n(cx + Math.cos(a) * len)},${n(cy + Math.sin(a) * len)}L${n(cx + Math.cos(a + half) * r0)},${n(cy + Math.sin(a + half) * r0)}Z`,
    );
  }
  return `<path d="${out.join('')}" fill="url(#${id})"/>`;
}

/** A four-point sparkle, the long points up/down and left/right. */
export function sparkle(cx: number, cy: number, r: number, waist = 0.2): string {
  const s = r * waist;
  return `M${n(cx)},${n(cy - r)}Q${n(cx + s)},${n(cy - s)} ${n(cx + r)},${n(cy)}Q${n(cx + s)},${n(cy + s)} ${n(cx)},${n(cy + r)}Q${n(cx - s)},${n(cy + s)} ${n(cx - r)},${n(cy)}Q${n(cx - s)},${n(cy - s)} ${n(cx)},${n(cy - r)}Z`;
}

/** A small diamond, the kilim's commonest mark. */
export function diamondAt(cx: number, cy: number, w: number, h: number, deg = 0): string {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const p = (x: number, y: number): string => `${n(cx + x * c - y * s)},${n(cy + x * s + y * c)}`;
  return `M${p(0, -h / 2)}L${p(w / 2, 0)} ${p(0, h / 2)} ${p(-w / 2, 0)}Z`;
}

/**
 * A kilim eye: a diamond inside a diamond, the lit half and the shaded half of
 * each cut apart, as a jewel set into a frame. Returns markup.
 */
export function kilimGem(dr: Drawing, cx: number, cy: number, w: number, h: number, m: Metal): string {
  const lit = `M${n(cx)},${n(cy - h / 2)}L${n(cx - w / 2)},${n(cy)}L${n(cx)},${n(cy + h / 2)}Z`;
  const shade = `M${n(cx)},${n(cy - h / 2)}L${n(cx + w / 2)},${n(cy)}L${n(cx)},${n(cy + h / 2)}Z`;
  const core = dr.id('j');
  dr.def(linearAt(core, [[0, '#ffffff'], [1, m.light]], 0, cy - h * 0.25, 0, cy + h * 0.25));
  return (
    `<path d="${diamondAt(cx, cy, w + 2.4, h + 2.8)}" fill="${m.deep}"/>` +
    `<path d="${lit}" fill="${m.light}"/><path d="${shade}" fill="${m.dark}"/>` +
    `<path d="${diamondAt(cx, cy, w * 0.42, h * 0.42)}" fill="url(#${core})"/>`
  );
}

/**
 * Upward chevrons in a row, centred on cx,cy: the count says the tier or the
 * division, so colour is never the only signal. Lit chevrons are one path and
 * unlit ones another, each a closed six-point outline. Returns [lit, unlit]
 * path data.
 */
export function chevrons(count: number, lit: number, cx: number, cy: number, w: number, h: number, gap: number, thick: number): [string, string] {
  const on: string[] = [];
  const off: string[] = [];
  const x0 = cx - ((count - 1) * (w + gap)) / 2;
  for (let i = 0; i < count; i++) {
    const x = x0 + i * (w + gap);
    const top = cy - h / 2;
    const bottom = cy + h / 2;
    // written with relative moves and a small z, so a chevron is told from any facet by its spelling
    const pts: Pt[] = [
      [x - w / 2, bottom - thick],
      [x, top],
      [x + w / 2, bottom - thick],
      [x + w / 2, bottom],
      [x, top + thick * 1.15],
      [x - w / 2, bottom],
    ];
    const [first] = pts as [Pt];
    const rel = pts.slice(1).map((p, k) => {
      const prev = pts[k] as Pt;
      return `${n(p[0] - prev[0])},${n(p[1] - prev[1])}`;
    });
    const d = `M${n(first[0])},${n(first[1])}l${rel.join(' ')}z`;
    (i < lit ? on : off).push(d);
  }
  return [on.join(''), off.join('')];
}

/** A capsule centred on cx,cy. */
export function capsule(cx: number, cy: number, w: number, h: number): string {
  const r = h / 2;
  return `M${n(cx - w / 2 + r)},${n(cy - r)}H${n(cx + w / 2 - r)}A${n(r)},${n(r)} 0 0 1 ${n(cx + w / 2 - r)},${n(cy + r)}H${n(cx - w / 2 + r)}A${n(r)},${n(r)} 0 0 1 ${n(cx - w / 2 + r)},${n(cy - r)}Z`;
}

/** A ring between two radii, as one even-odd path. */
export function ring(cx: number, cy: number, outer: number, inner: number): string {
  const c = (r: number): string =>
    `M${n(cx - r)},${n(cy)}A${n(r)},${n(r)} 0 1 0 ${n(cx + r)},${n(cy)}A${n(r)},${n(r)} 0 1 0 ${n(cx - r)},${n(cy)}Z`;
  return `${c(outer)}${c(inner)}`;
}

/** A blade, the wing of a crest or a frame: a long kite, its upper half lit and its lower half shaded. */
export function blade(x: number, y: number, side: 1 | -1, len: number, width: number, deg: number, m: Metal): string {
  const a = (deg * Math.PI) / 180;
  const u: Pt = [Math.cos(a) * side, -Math.sin(a)];
  // the normal on the blade's upper edge, whichever side it is on
  const up: Pt = side === 1 ? [u[1], -u[0]] : [-u[1], u[0]];
  const at = (s: number, o: number): Pt => [x + u[0] * s + up[0] * o, y + u[1] * s + up[1] * o];
  const back = at(-3, 0);
  const tip = at(len, 0);
  const hi = at(0, width / 2);
  const lo = at(0, -width / 2);
  const kneeHi = at(len * 0.62, width * 0.34);
  const kneeLo = at(len * 0.62, -width * 0.2);
  return (
    `<path d="${polyPath([back, hi, kneeHi, tip, kneeLo, lo])}" fill="${m.deep}" stroke="${m.deep}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="${polyPath([back, hi, kneeHi, tip])}" fill="${m.light}"/><path d="${polyPath([back, tip, kneeLo, lo])}" fill="${m.dark}"/>` +
    `<path d="M${n(back[0])},${n(back[1])}L${n(tip[0])},${n(tip[1])}" stroke="${m.hi}" stroke-width="0.7" stroke-opacity="0.8"/>`
  );
}

/** A faceted spike: a narrow triangle split down its middle. */
export function spike(x: number, y: number, h: number, w: number, lean: number, m: Metal): string {
  const tip: Pt = [x + lean, y - h];
  const l: Pt = [x - w / 2, y];
  const r: Pt = [x + w / 2, y];
  const mid: Pt = [x, y + 2];
  return (
    `<path d="${polyPath([l, tip, r, mid])}" fill="${m.deep}" stroke="${m.deep}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="${polyPath([l, tip, mid])}" fill="${m.hi}"/><path d="${polyPath([mid, tip, r])}" fill="${m.mid}"/>`
  );
}

/** A four-point star, cut into eight facets lit from the upper left. */
export function cutStar(cx: number, cy: number, r: number, m: Metal): string {
  const waist = r * 0.24;
  const pts: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const a = ((i * 45 - 90) * Math.PI) / 180;
    const rr = i % 2 === 0 ? r : waist;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const out: string[] = [`<path d="${polyPath(pts)}" fill="${m.deep}" stroke="${m.deep}" stroke-width="2.4" stroke-linejoin="round"/>`];
  const shades = [m.hi, '#ffffff', m.light, m.mid, m.mid, m.dark, m.light, m.hi];
  for (let i = 0; i < 8; i++) {
    const a = pts[i] as Pt;
    const b = pts[(i + 1) % 8] as Pt;
    out.push(`<path d="${polyPath([[cx, cy], a, b])}" fill="${shades[i]}"/>`);
  }
  return out.join('');
}
