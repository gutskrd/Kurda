/**
 * The village's isometric pen: the 2:1 diamond projection, the light that
 * falls on every form from the upper left, the ink round each object, and
 * the palette by day and at dusk.
 *
 * World units are laid out on the ground with x running down to the right,
 * y down to the left and z straight up; a step of one along x or y moves one
 * unit across the screen and half a unit down, so a square on the ground is
 * a diamond twice as wide as it is tall. Every form is cel-shaded in three
 * flat tones of one colour — its top in the light, the face turned down-left
 * in the middle tone, the face turned down-right in shade — and nothing is a
 * gradient or a blur.
 *
 * Each object is drawn as a `Part`: a silhouette laid down first in the ink
 * with a thick stroke, so it carries a heavy outer outline, and then its
 * faces with a thin line of the same ink between them. Parts are sorted back
 * to front by their depth on the ground before they are written out, so a
 * nearer thing always covers a farther one.
 */
import { n, type Pt } from '../svg.js';

/** The ink every outline is drawn in: the dark brown of the deer's own board lettering. */
export const INK = '#4a2a1a';
/** The thin line between faces, and the heavy one round a silhouette (half of it shows outside). */
export const LINE = 1.1;
export const OUTLINE = 2.8;

/** One form's three flat tones: its top in the light, its face turned down-left, its face turned down-right in shade. */
export interface Tri {
  top: string;
  left: string;
  right: string;
}

/** A point on the screen for a point in the world. */
export const iso = (x: number, y: number, z = 0): Pt => [x - y, (x + y) / 2 - z];

/** How a circle of radius r on the ground looks: an ellipse this wide and this tall (half-axes). */
export const rim = (r: number): Pt => [r * Math.SQRT2, r * Math.SQRT1_2];

const xy = ([x, y]: Pt): string => `${n(x)} ${n(y)}`;

/** A closed polygon through screen points. */
export function poly(points: readonly Pt[]): string {
  return `${polyline(points)}Z`;
}

/** An open polyline through screen points, each step after the first written as a short relative move. */
export function polyline(points: readonly Pt[]): string {
  let d = `M${xy(points[0]!)}`;
  let [px, py] = [Math.round(points[0]![0] * 10), Math.round(points[0]![1] * 10)];
  for (const [x, y] of points.slice(1)) {
    const [qx, qy] = [Math.round(x * 10), Math.round(y * 10)];
    d += `l${(qx - px) / 10} ${(qy - py) / 10}`;
    [px, py] = [qx, qy];
  }
  return d;
}

/** A straight line between two screen points, as path data. */
export function seg(a: Pt, b: Pt): string {
  return polyline([a, b]);
}

/** A closed polygon through world points. */
export const wpoly = (points: readonly (readonly [number, number, number])[]): string => poly(points.map(([x, y, z]) => iso(x, y, z)));

/** An ellipse as path data, so several can share one path. */
export function oval(cx: number, cy: number, rx: number, ry: number): string {
  return `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(2 * rx)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-2 * rx)} 0Z`;
}

/** A circle as path data. */
export const disc = (cx: number, cy: number, r: number): string => oval(cx, cy, r, r);

/** A rounded rectangle on the screen, as path data. */
export function rrect(x: number, y: number, w: number, h: number, r: number): string {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${n(x + q)} ${n(y)}h${n(w - 2 * q)}a${n(q)} ${n(q)} 0 0 1 ${n(q)} ${n(q)}v${n(h - 2 * q)}a${n(q)} ${n(q)} 0 0 1 ${n(-q)} ${n(q)}h${n(2 * q - w)}a${n(q)} ${n(q)} 0 0 1 ${n(-q)} ${n(-q)}v${n(2 * q - h)}a${n(q)} ${n(q)} 0 0 1 ${n(q)} ${n(-q)}Z`;
}

/**
 * One object: a silhouette in ink under it, for its outline, and its faces.
 * `depth` is how near the viewer it stands on the ground (x + y of its
 * middle), for sorting it among the others.
 */
export class Part {
  private back = '';
  private body = '';
  /** what the part is for, when it matters: 'scaffold' for the builders' poles, boards and stacks round a stage being raised */
  tag?: 'scaffold';
  constructor(public depth: number) {}

  /** Add to the silhouette (its outline is drawn round the union of everything added). */
  sil(d: string): this {
    this.back += d;
    return this;
  }

  /** A filled face with the thin ink line round it. */
  fill(d: string, colour: string, extra = ''): this {
    this.body += `<path d="${d}" fill="${colour}"${extra}/>`;
    return this;
  }

  /** A filled shape with no line round it: a patch of light or shade on a face. */
  flat(d: string, colour: string, extra = ''): this {
    this.body += `<path d="${d}" fill="${colour}" stroke="none"${extra}/>`;
    return this;
  }

  /** A line only: a joint between stones, a crack, a plank's edge, a rope. */
  line(d: string, width = LINE, colour = INK): this {
    this.body += `<path d="${d}" fill="none"${colour === INK ? '' : ` stroke="${colour}"`}${width === LINE ? '' : ` stroke-width="${n(width)}"`}/>`;
    return this;
  }

  /** Markup drawn as it is, inside the part. */
  raw(markup: string): this {
    this.body += markup;
    return this;
  }

  /** A box standing on the ground at (x, y, z), w along x, d along y, h tall: its top lit, its two near faces in the middle tone and in shade. */
  box(x: number, y: number, z: number, w: number, d: number, h: number, t: Tri, o: { top?: boolean; outline?: boolean } = {}): this {
    const z1 = z + h;
    if (o.outline !== false) this.sil(wpoly([[x, y, z1], [x + w, y, z1], [x + w, y, z], [x + w, y + d, z], [x, y + d, z], [x, y + d, z1]]));
    this.fill(wpoly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z1], [x, y + d, z1]]), t.left);
    this.fill(wpoly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z1], [x + w, y, z1]]), t.right);
    if (o.top !== false) this.fill(wpoly([[x, y, z1], [x + w, y, z1], [x + w, y + d, z1], [x, y + d, z1]]), t.top);
    return this;
  }

  /** A standing cylinder: a post, a hive, an oven, a samovar's body. Lit down its left, in shade down its right, its top an ellipse. */
  cylinder(x: number, y: number, z: number, r: number, h: number, t: Tri, o: { top?: boolean; taper?: number } = {}): this {
    const [cx, cyb] = iso(x, y, z);
    const cyt = cyb - h;
    const [rx, ry] = rim(r);
    const k = o.taper ?? 1;
    const tx = rx * k;
    const ty = ry * k;
    const body = `M${n(cx - tx)} ${n(cyt)}L${n(cx - rx)} ${n(cyb)}A${n(rx)} ${n(ry)} 0 0 0 ${n(cx + rx)} ${n(cyb)}L${n(cx + tx)} ${n(cyt)}Z`;
    this.sil(body + oval(cx, cyt, tx, ty));
    this.fill(body, t.left);
    // the shade down the right: from a third of the way across to the edge, following the foot
    const sx = cx + rx * 0.3;
    const sb = cyb + ry * Math.sqrt(1 - 0.09);
    this.flat(`M${n(cx + tx * 0.3)} ${n(cyt)}L${n(sx)} ${n(sb)}A${n(rx)} ${n(ry)} 0 0 0 ${n(cx + rx)} ${n(cyb)}L${n(cx + tx)} ${n(cyt)}Z`, t.right);
    this.line(`M${n(cx - tx)} ${n(cyt)}L${n(cx - rx)} ${n(cyb)}A${n(rx)} ${n(ry)} 0 0 0 ${n(cx + rx)} ${n(cyb)}L${n(cx + tx)} ${n(cyt)}`);
    if (o.top !== false) this.fill(oval(cx, cyt, tx, ty), t.top);
    return this;
  }

  /** A round lump — a bush, a crown of leaves, a fleece: shade, then the face a little up and to the left, then one patch of light. */
  blob(cx: number, cy: number, r: number, t: Tri, light = true): this {
    this.sil(disc(cx, cy, r));
    this.flat(disc(cx, cy, r), t.right);
    this.flat(disc(cx - r * 0.12, cy - r * 0.14, r * 0.86), t.left);
    if (light) this.flat(disc(cx - r * 0.34, cy - r * 0.38, r * 0.34), t.top);
    return this;
  }

  /** The markup: the silhouette's heavy outline, then the faces. */
  svg(): string {
    return (this.back ? `<path d="${this.back}" fill="${INK}" stroke-width="${OUTLINE}"/>` : '') + this.body;
  }
}

/** Something drawn, and how near the viewer it stands. */
export interface Drawn {
  depth: number;
  svg: string;
}

/** Parts sorted back to front (a stable sort, so ties keep the order they were made in) and written out. */
export function sorted(parts: readonly Drawn[]): string {
  return parts
    .map((p, i) => [p, i] as const)
    .sort((a, b) => a[0].depth - b[0].depth || a[1] - b[1])
    .map(([p]) => p.svg)
    .join('');
}

/** The wrapper every village drawing's ink lives in: the thin line is inherited by every face. */
export const inked = (inner: string): string => `<g stroke="${INK}" stroke-width="${LINE}" stroke-linejoin="round" stroke-linecap="round">${inner}</g>`;

/** A point on the face that looks down-left (the plane y = Y): u along x, v up. */
export const onLeft = (x: number, Y: number, z: number) => (u: number, v: number): Pt => iso(x + u, Y, z + v);
/** A point on the face that looks down-right (the plane x = X): u along y, v up. */
export const onRight = (X: number, y: number, z: number) => (u: number, v: number): Pt => iso(X, y + u, z + v);

/** A rectangle on a face, through a face's own point function. */
export function panel(at: (u: number, v: number) => Pt, u: number, v: number, w: number, h: number): string {
  return poly([at(u, v), at(u + w, v), at(u + w, v + h), at(u, v + h)]);
}

/** A door or window with a rounded head, on a face. */
export function arched(at: (u: number, v: number) => Pt, u: number, v: number, w: number, h: number): string {
  const r = w / 2;
  const p = (a: number, b: number): string => xy(at(u + a, v + b));
  return `M${p(0, 0)}L${p(0, h - r)}Q${p(0, h)} ${p(r, h)}Q${p(w, h)} ${p(w, h - r)}L${p(w, 0)}Z`;
}

// ───────────────────────────────────────────────────────────── the palette

/** Everything the village is painted in, by day or at dusk. */
export interface Palette {
  dusk: boolean;
  sky: string;
  skyLow: string;
  cloud: Tri;
  far: Tri;
  near: Tri;
  snow: Tri;
  grass: Tri;
  meadow: string;
  tuft: string;
  cliff: Tri;
  rock: Tri;
  earth: Tri;
  path: Tri;
  water: Tri;
  foam: string;
  stone: Tri;
  stoneWarm: Tri;
  stoneGrey: Tri;
  plaster: Tri;
  roof: Tri;
  wood: Tri;
  woodDark: Tri;
  beam: string;
  door: Tri;
  frame: string;
  glass: string;
  leaf: Tri;
  leafDark: Tri;
  poplar: Tri;
  trunk: Tri;
  clay: Tri;
  copper: Tri;
  straw: Tri;
  cloth: Tri;
  red: Tri;
  saffron: Tri;
  indigo: Tri;
  green: Tri;
  cream: Tri;
  apple: string;
  pomegranate: string;
  bread: Tri;
  flower: readonly string[];
  glow: string;
}

const tri = (top: string, left: string, right: string): Tri => ({ top, left, right });

/** By day, for a light screen: spring sun from the upper left over the lake. */
export const DAY: Palette = {
  dusk: false,
  sky: '#a8dcf4',
  skyLow: '#d9f1fb',
  cloud: tri('#ffffff', '#f3f8fc', '#d6e6f2'),
  far: tri('#c1d2ea', '#a9bddb', '#8ea4c8'),
  near: tri('#9cc49a', '#86b285', '#6b9873'),
  snow: tri('#ffffff', '#f4f8fd', '#d3e0ef'),
  grass: tri('#a8d86e', '#8cc45a', '#6fa847'),
  meadow: '#bde27f',
  tuft: '#76b04a',
  cliff: tri('#e3b27a', '#cf955c', '#a9703f'),
  rock: tri('#e2ddd2', '#c6bfb1', '#9f978a'),
  earth: tri('#e6c08a', '#d2a46b', '#ac7c48'),
  path: tri('#f2dcae', '#e2c48f', '#c49e6a'),
  water: tri('#6fcbee', '#4fb5e2', '#3a94c6'),
  foam: '#d9f4fd',
  stone: tri('#f3e1bd', '#dfc596', '#b99a6b'),
  stoneWarm: tri('#f3d2a0', '#e2b37a', '#bb8a52'),
  stoneGrey: tri('#e6e0d4', '#cdc5b5', '#a69d8c'),
  plaster: tri('#f6e7cc', '#ead3ab', '#c9ab80'),
  roof: tri('#c98b55', '#a86f3c', '#7d5129'),
  wood: tri('#d39a5e', '#b67a42', '#8d5a2c'),
  woodDark: tri('#a8703f', '#8a5a30', '#6b4423'),
  beam: '#7a4f2b',
  door: tri('#5fb3ac', '#3f8f8a', '#2f6f6b'),
  frame: '#4aa6a0',
  glass: '#33424a',
  leaf: tri('#a5d65f', '#7dbb45', '#5c9a35'),
  leafDark: tri('#7fbf55', '#5e9f3f', '#457d30'),
  poplar: tri('#93c95a', '#6aa843', '#4b8534'),
  trunk: tri('#a77a4e', '#8a613c', '#6a472a'),
  clay: tri('#e9a874', '#d48a54', '#ad6a3b'),
  copper: tri('#f0b27a', '#d98a4e', '#b06633'),
  straw: tri('#f6dd8c', '#e9c564', '#c9a144'),
  cloth: tri('#fbf3e3', '#efe2c8', '#d3c1a0'),
  red: tri('#ef6a55', '#d8493b', '#b2352b'),
  saffron: tri('#ffd36b', '#f2b632', '#cf8f1c'),
  indigo: tri('#6f84c7', '#4a5fa6', '#35468a'),
  green: tri('#69c27a', '#3fa45b', '#2f8247'),
  cream: tri('#fffaf0', '#f7ead0', '#e2cfa8'),
  apple: '#e5402f',
  pomegranate: '#c92f45',
  bread: tri('#f7cf8a', '#e4a95a', '#bf843b'),
  flower: ['#f25f5c', '#ffd23f', '#ffffff', '#c86bd6', '#ff9f43'],
  glow: '#33424a',
};

/** For a dark screen: the same village in the last light of the evening, its windows lit. */
export const DUSK: Palette = {
  dusk: true,
  sky: '#3b4378',
  skyLow: '#e8a07a',
  cloud: tri('#f2c3b4', '#d7a3a3', '#a98196'),
  far: tri('#8b8fb8', '#73779f', '#5c6088'),
  near: tri('#6b8a7d', '#5a786c', '#46615a'),
  snow: tri('#f3e2e6', '#e2cfd9', '#b7a9c4'),
  grass: tri('#8fb862', '#77a052', '#5d8442'),
  meadow: '#9cc26b',
  tuft: '#638f40',
  cliff: tri('#c99568', '#b07b50', '#8a5c38'),
  rock: tri('#c8c0bc', '#aaa29f', '#857e7d'),
  earth: tri('#cba57a', '#b38a5e', '#8e6943'),
  path: tri('#dcc29a', '#c8a97e', '#a8875e'),
  water: tri('#5a95c4', '#467fb0', '#356793'),
  foam: '#b9d6ec',
  stone: tri('#dcc6a6', '#c5ab84', '#9e835e'),
  stoneWarm: tri('#dcb88f', '#c7996b', '#9f7148'),
  stoneGrey: tri('#cdc6c0', '#b2aaa3', '#8b837e'),
  plaster: tri('#e0ccb2', '#cfb592', '#a98e6d'),
  roof: tri('#ad7a4c', '#8f6036', '#6b4626'),
  wood: tri('#bb8656', '#9e6a3c', '#7a4e29'),
  woodDark: tri('#94633a', '#79502c', '#5c3d21'),
  beam: '#64401f',
  door: tri('#559c98', '#3d7f7c', '#2d615f'),
  frame: '#4a9792',
  glass: '#33424a',
  leaf: tri('#8dbd5a', '#6aa043', '#4f8233'),
  leafDark: tri('#6ea54d', '#52883b', '#3e6b2e'),
  poplar: tri('#7fb052', '#5c9240', '#427232'),
  trunk: tri('#916a46', '#765537', '#5a4028'),
  clay: tri('#d29468', '#ba784b', '#975c34'),
  copper: tri('#e6a56d', '#cd7f45', '#a65d2e'),
  straw: tri('#e4c67c', '#d1ad58', '#ad8a3c'),
  cloth: tri('#efe2cf', '#ddcbb0', '#bba98c'),
  red: tri('#e2604d', '#c64236', '#a03028'),
  saffron: tri('#ffd36b', '#f2b632', '#cf8f1c'),
  indigo: tri('#6375b5', '#46579a', '#33427d'),
  green: tri('#5eb06d', '#3a9352', '#2c7340'),
  cream: tri('#f3ead9', '#e6d6b9', '#c9b694'),
  apple: '#d93a2b',
  pomegranate: '#b82a40',
  bread: tri('#e9c07f', '#d39c52', '#ae7836'),
  flower: ['#ea5a57', '#f6cd45', '#f0e8e0', '#b664c6', '#f39a45'],
  glow: '#ffcf5a',
};
