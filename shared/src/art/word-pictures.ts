/**
 * One small painted picture per word the "pick the picture" exercise can ask for, legible at 72–96 px. `WORD_PICTURES`
 * is the catalogue the server's exercise schema and the road checker read. Painted in the valley style (valley.ts),
 * each thing centred on a soft shade patch over a transparent ground; sky things and body parts float without one, so
 * they never read as objects on a table. On a dark card colours move toward the dusk violet and the darkest are lifted.
 */
import { CANVAS, escapeXml, mix, n, n2, prefixFor, seeded, type Pt } from './svg.js';
import { VALLEY, blobPath, dusk, ellipsePath, warm } from './valley.js';

/** Every word with a picture: its Kurmancî word and English meaning. */
export const WORD_PICTURES = {
  apple: { ku: 'sêv', en: 'apple' },
  tea: { ku: 'çay', en: 'tea' },
  water: { ku: 'av', en: 'water' },
  sugar: { ku: 'şekir', en: 'sugar' },
  house: { ku: 'mal', en: 'house' },
  hen: { ku: 'mirîşk', en: 'hen' },
  dog: { ku: 'kûçik', en: 'dog' },
  cat: { ku: 'pisîk', en: 'cat' },
  donkey: { ku: 'ker', en: 'donkey' },
  orchard: { ku: 'baxçe', en: 'orchard' },
  bread: { ku: 'nan', en: 'bread' },
  flower: { ku: 'kulîlk', en: 'flower' },
  tree: { ku: 'dar', en: 'tree' },
  pen: { ku: 'pênûs', en: 'pen' },
  shoe: { ku: 'pêlav', en: 'shoe' },
  bag: { ku: 'çente', en: 'bag' },
  book: { ku: 'pirtûk', en: 'book' },
  cap: { ku: 'kum', en: 'cap' },
  heart: { ku: 'dil', en: 'heart' },
  gift: { ku: 'diyarî', en: 'gift' },
  basket: { ku: 'selik', en: 'basket' },
  sock: { ku: 'gore', en: 'sock' },
  horse: { ku: 'hesp', en: 'horse' },
  cow: { ku: 'çêlek', en: 'cow' },
  ewe: { ku: 'mih', en: 'sheep' },
  goat: { ku: 'bizin', en: 'goat' },
  lamb: { ku: 'berx', en: 'lamb' },
  phone: { ku: 'telefon', en: 'phone' },
  car: { ku: 'trimbêl', en: 'car' },
  money: { ku: 'pere', en: 'money' },
  cheese: { ku: 'penîr', en: 'cheese' },
  egg: { ku: 'hêk', en: 'egg' },
  meat: { ku: 'goşt', en: 'meat' },
  yoghurt: { ku: 'mast', en: 'yoghurt' },
  chest: { ku: 'sindoq', en: 'chest' },
  key: { ku: 'kilît', en: 'key' },
  letter: { ku: 'name', en: 'letter' },
  map: { ku: 'nexşe', en: 'map' },
  door: { ku: 'derî', en: 'door' },
  window: { ku: 'pencere', en: 'window' },
  table: { ku: 'mase', en: 'table' },
  chair: { ku: 'kursî', en: 'chair' },
  tenur: { ku: 'tenûr', en: 'clay oven' },
  eye: { ku: 'çav', en: 'eye' },
  leaf: { ku: 'pel', en: 'leaf' },
  grapes: { ku: 'tirî', en: 'grapes' },
  walnut: { ku: 'gûz', en: 'walnut' },
  cloud: { ku: 'ewr', en: 'cloud' },
  glasses: { ku: 'berçavk', en: 'glasses' },
  stone: { ku: 'kevir', en: 'stone' },
  spring: { ku: 'kanî', en: 'spring' },
  river: { ku: 'çem', en: 'river' },
  mountain: { ku: 'çiya', en: 'mountain' },
  ball: { ku: 'gog', en: 'ball' },
  school: { ku: 'dibistan', en: 'school' },
  mill: { ku: 'aş', en: 'mill' },
  watermelon: { ku: 'zebeş', en: 'watermelon' },
  tomato: { ku: 'bacansor', en: 'tomato' },
  potato: { ku: 'kartol', en: 'potato' },
  onion: { ku: 'pîvaz', en: 'onion' },
  pomegranate: { ku: 'hinar', en: 'pomegranate' },
  cucumber: { ku: 'xiyar', en: 'cucumber' },
  honey: { ku: 'hingiv', en: 'honey' },
  milk: { ku: 'şîr', en: 'milk' },
  olive: { ku: 'zeytûn', en: 'olive' },
  fish: { ku: 'masî', en: 'fish' },
  glass: { ku: 'qedeh', en: 'drinking glass' },
  cup: { ku: 'fîncan', en: 'cup' },
  spoon: { ku: 'kevçî', en: 'spoon' },
  teapot: { ku: 'çaydank', en: 'teapot' },
  sun: { ku: 'roj', en: 'sun' },
  moon: { ku: 'heyv', en: 'moon' },
  star: { ku: 'stêrk', en: 'star' },
  snow: { ku: 'berf', en: 'snow' },
  rain: { ku: 'baran', en: 'rain' },
  fire: { ku: 'agir', en: 'fire' },
  bird: { ku: 'çivîk', en: 'bird' },
  rose: { ku: 'gul', en: 'rose' },
  clock: { ku: 'demjimêr', en: 'clock' },
  bus: { ku: 'otobûs', en: 'bus' },
  tractor: { ku: 'traktor', en: 'tractor' },
  train: { ku: 'trên', en: 'train' },
  plane: { ku: 'balafir', en: 'aeroplane' },
  taxi: { ku: 'taksî', en: 'taxi' },
  bicycle: { ku: 'bisîklet', en: 'bicycle' },
  ticket: { ku: 'bilêt', en: 'ticket' },
  wolf: { ku: 'gur', en: 'wolf' },
  bear: { ku: 'hirç', en: 'bear' },
  fox: { ku: 'rovî', en: 'fox' },
  deer: { ku: 'ask', en: 'deer' },
  gazelle: { ku: 'xezal', en: 'gazelle' },
  snake: { ku: 'mar', en: 'snake' },
  kid: { ku: 'karik', en: 'kid' },
  tent: { ku: 'kon', en: 'tent' },
  hand: { ku: 'dest', en: 'hand' },
  ear: { ku: 'guh', en: 'ear' },
  nose: { ku: 'poz', en: 'nose' },
  tooth: { ku: 'diran', en: 'tooth' },
  foot: { ku: 'ling', en: 'foot' },
  medicine: { ku: 'derman', en: 'medicine' },
  drum: { ku: 'dahol', en: 'drum' },
  wheat: { ku: 'simbil', en: 'ear of wheat' },
  corn: { ku: 'garis', en: 'corn' },
} as const satisfies Readonly<Record<string, { readonly ku: string; readonly en: string }>>;

/** A word that has a picture. */
export type WordPictureId = keyof typeof WORD_PICTURES;

/** Every word with a picture, in catalogue order. */
export const WORD_PICTURE_IDS: readonly WordPictureId[] = Object.freeze(Object.keys(WORD_PICTURES) as WordPictureId[]);

// ───────────────────────────────────────────────────────────── colours

/** A form's three tones: its face, its one step of shade, and its patch of light. */
export type Tone = readonly [face: string, shade: string, light: string];

export const RED: Tone = ['#e0503f', '#b5382c', '#f08b7e'];
export const LEAF: Tone = [VALLEY.leaf, VALLEY.leafShade, VALLEY.leafLight];
export const GRASS: Tone = ['#b3d184', '#93b566', '#cfe3a4'];
export const BARK: Tone = [VALLEY.trunk, '#664026', '#a8774e'];
export const WOOD: Tone = ['#b8804d', '#8a5a33', '#d6a46f'];
export const STRAW: Tone = ['#e3b866', '#b98b3c', '#f4d996'];
export const CLAY: Tone = ['#d58f55', '#a6632f', '#ecb37f'];
const WALL: Tone = [VALLEY.wall, VALLEY.wallSide, VALLEY.roof];
const ROOF: Tone = [VALLEY.red, VALLEY.redDark, '#dc6b5c'];
const GOLD: Tone = [VALLEY.gold, VALLEY.goldDark, VALLEY.goldLight];
const SUN: Tone = ['#f7c63c', '#e29a24', '#fde49a'];
export const BLUE: Tone = [VALLEY.gate, VALLEY.gateDark, '#7fb4e2'];
export const GLASS: Tone = ['#e1eff5', '#b3cdd8', '#ffffff'];
export const WATER: Tone = ['#5aaee0', '#3a86bf', '#cdeaf6'];
const WHITE: Tone = ['#f6f2ea', '#d6cdbd', '#ffffff'];
export const PAPER: Tone = ['#fbf1dc', '#e2cfaa', '#fffaf0'];
const STONE: Tone = ['#a9acb3', '#80848c', '#cdd0d5'];
export const COPPER: Tone = ['#cd7c3e', '#9a5326', '#eaa96d'];
const STEEL: Tone = ['#c5ccd5', '#949dab', '#eef1f5'];
const WOOL: Tone = [VALLEY.wool, VALLEY.woolShade, '#ffffff'];
/** The near-black of an animal's face and hooves, a phone, a pupil; never pure black. */
const INK = VALLEY.ink;
const PINK = '#f2b0a2';
const TONGUE = '#e8798a';
const CREAM = '#f6e3b0';
const SKY_PANE = '#c4e4f1';
/** A window lit by evening, as the valley's houses are. */
const LAMP = '#f2c35c';

/** The shade patch things stand on: the valley's shaded earth, soft enough for any card. */
const GROUND = VALLEY.earthShade;

/** How dark a colour looks, 0 (black) to 1 (white). */
function luma(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
}

/** A day colour on a dark card: moved a little toward the dusk violet, and lifted toward a pale lilac if that would leave it too dark. */
function night(hex: string): string {
  const m = dusk(hex, true, 0.18);
  const y = luma(m);
  return y < 0.38 ? mix(m, '#d9d3f2', Math.min(0.55, (0.38 - y) * 1.4)) : m;
}

// ───────────────────────────────────────────────────────────── shapes

const f = n;
type Rand = () => number;

/** A circle as a path, so many can share one element. */
const O = (cx: number, cy: number, r: number): string => ellipsePath(cx, cy, r, r);
const E = ellipsePath;

/** An ellipse turned `deg` degrees about its centre, as a path. */
export function oval(cx: number, cy: number, rx: number, ry: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [Math.cos(a) * rx, Math.sin(a) * rx];
  const arc = `A${f(rx)} ${f(ry)} ${f(deg)} 1 0`;
  return `M${f(cx - dx)} ${f(cy - dy)}${arc} ${f(cx + dx)} ${f(cy + dy)}${arc} ${f(cx - dx)} ${f(cy - dy)}Z`;
}

/** A rectangle with corners rounded by `r`, wound anticlockwise like the circles so the two join in one path. */
export function box(x: number, y: number, w: number, h: number, r = 0): string {
  if (r <= 0) return `M${f(x)} ${f(y)}v${f(h)}h${f(w)}v${f(-h)}Z`;
  const q = Math.min(r, w / 2, h / 2);
  const c = `a${f(q)} ${f(q)} 0 0 0`;
  return (
    `M${f(x + q)} ${f(y)}${c} ${f(-q)} ${f(q)}v${f(h - 2 * q)}${c} ${f(q)} ${f(q)}h${f(w - 2 * q)}` +
    `${c} ${f(q)} ${f(-q)}v${f(-(h - 2 * q))}${c} ${f(-q)} ${f(-q)}Z`
  );
}

/** A closed polygon through x, y pairs. */
export function poly(...xy: number[]): string {
  let d = '';
  for (let i = 0; i + 1 < xy.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${f(xy[i]!)} ${f(xy[i + 1]!)}`;
  return `${d}Z`;
}

/** A transform scaling a picture `k` times about its foot (cx, cy), so a small thing fills its card as a large one does. */
const grow = (k: number, cx = 60, cy = 104): string => `matrix(${n2(k)} 0 0 ${n2(k)} ${f(cx * (1 - k))} ${f(cy * (1 - k))})`;

/** A diamond about a point: the lozenge of a kilim or a knitted band. */
const diamond = (cx: number, cy: number, rx: number, ry: number): string => poly(cx, cy - ry, cx + rx, cy, cx, cy + ry, cx - rx, cy);

/** The large-arc and sweep flags for an arc round (cx, cy) from one point through another to a third. */
function arcFlags(cx: number, cy: number, from: Pt, via: Pt, to: Pt): [number, number] {
  const turn = Math.PI * 2;
  const at = (p: Pt): number => Math.atan2(p[1] - cy, p[0] - cx);
  const norm = (a: number): number => ((a % turn) + turn) % turn;
  const span = norm(at(to) - at(from));
  if (norm(at(via) - at(from)) < span) return [span > Math.PI ? 1 : 0, 1];
  return [turn - span > Math.PI ? 1 : 0, 0];
}

/** The part of one circle another does not cover: a crescent moon, or the shade on a ball. */
function lune(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): string {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const [ux, uy] = [(x2 - x1) / d, (y2 - y1) / d];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const [px, py] = [x1 + a * ux, y1 + a * uy];
  const i1: Pt = [px - h * uy, py + h * ux];
  const i2: Pt = [px + h * uy, py - h * ux];
  const [l1, s1] = arcFlags(x1, y1, i1, [x1 - r1 * ux, y1 - r1 * uy], i2);
  const [l2, s2] = arcFlags(x2, y2, i2, [x2 - r2 * ux, y2 - r2 * uy], i1);
  const p = (q: Pt): string => `${f(q[0])} ${f(q[1])}`;
  return `M${p(i1)}A${f(r1)} ${f(r1)} 0 ${l1} ${s1} ${p(i2)}A${f(r2)} ${f(r2)} 0 ${l2} ${s2} ${p(i1)}Z`;
}

/** Round puffs about an ellipse, with the ellipse filling their middle: wool, or a cloud. */
function puffs(cx: number, cy: number, rx: number, ry: number, count: number, r: number, from = 0): string {
  let d = E(cx, cy, rx, ry);
  for (let i = 0; i < count; i++) {
    const a = from + (i / count) * Math.PI * 2;
    d += O(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, r);
  }
  return d;
}

/** A five-pointed star's points about a centre: points `r` out, inner corners `k` of that. */
function starPoints(cx: number, cy: number, r: number, k: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * k;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}

// ───────────────────────────────────────────────────────────── the brush

/** What a picture is painted with: flat fills and round-ended lines, every colour given as the day's and shown as the card needs. */
class Brush {
  private out = '';

  constructor(readonly dark: boolean) {}

  /** A day colour as this picture shows it. */
  c(hex: string): string {
    return this.dark ? night(hex) : hex;
  }

  fill(d: string, hex: string, more = ''): void {
    this.out += `<path d="${d}" fill="${this.c(hex)}"${more}/>`;
  }

  /** Fire and embers, which keep their warmth on a dark card. */
  glow(d: string, hex: string): void {
    this.out += `<path d="${d}" fill="${warm(hex, this.dark)}"/>`;
  }

  /** A window or lamp: its day colour by day, lit warm by evening. */
  lit(d: string, day: string, evening: string): void {
    this.out += `<path d="${d}" fill="${this.dark ? warm(evening, true) : day}"/>`;
  }

  /** A filled shape whose corners are softened by a stroke in its own colour: a sun's rays. */
  round(d: string, hex: string, width: number): void {
    const c = this.c(hex);
    this.out += `<path d="${d}" fill="${c}" stroke="${c}" stroke-width="${f(width)}" stroke-linejoin="round"/>`;
  }

  /** A stroke for things that are lines: a stalk, seam, strap, whisker, steam. */
  line(d: string, hex: string, width: number, more = ''): void {
    this.out += `<path d="${d}" fill="none" stroke="${this.c(hex)}" stroke-width="${f(width)}" stroke-linecap="round" stroke-linejoin="round"${more}/>`;
  }

  /** Short square-ended dashes along a line: weaving, a dotted route. */
  dash(d: string, hex: string, width: number, on: number, off: number, offset = 0): void {
    const shift = offset ? ` stroke-dashoffset="${f(offset)}"` : '';
    this.out += `<path d="${d}" fill="none" stroke="${this.c(hex)}" stroke-width="${f(width)}" stroke-dasharray="${f(on)} ${f(off)}"${shift}/>`;
  }

  /**
   * A form with one face and one step of shade: the whole shape in shade, and its face over it scaled `k` toward (ax, ay)
   * near the lit upper-left edge, so the shade shows as a band to the lower right.
   */
  form(d: string, t: Tone, ax: number, ay: number, k = 0.88, more = ''): void {
    this.fill(d, t[1], more);
    this.fill(d, t[0], `${more} transform="matrix(${n2(k)} 0 0 ${n2(k)} ${f(ax * (1 - k))} ${f(ay * (1 - k))})"`);
  }

  /**
   * A form with closely spaced parts (fingers, toes): its shade is the same shape offset down and right, so every part
   * keeps a crisp shadow edge and the gaps stay open.
   */
  cut(d: string, t: Tone, dx = 1.8, dy = 1.4): void {
    this.fill(d, t[1], ` transform="translate(${f(dx)} ${f(dy)})"`);
    this.fill(d, t[0]);
  }

  /** A translucent darkening over a many-coloured form (a ball, a folded map), as its step of shade. */
  shade(d: string, opacity = 0.16): void {
    this.out += `<path d="${d}" fill="${this.dark ? '#120e26' : '#3d2a1f'}" fill-opacity="${n2(opacity)}"/>`;
  }

  /** The soft patch of shade a thing stands on. */
  ground(rx: number, cx = 60, cy = 104): void {
    const colour = this.dark ? dusk(GROUND, true, 0.62) : GROUND;
    this.out += `<path d="${E(cx, cy, rx, rx * 0.15)}" fill="${colour}" fill-opacity="${this.dark ? '0.6' : '0.45'}"/>`;
  }

  /** Paints `draw` inside one transformed group. */
  group(transform: string, draw: () => void): void {
    this.out += `<g transform="${transform}">`;
    draw();
    this.out += '</g>';
  }

  toString(): string {
    return this.out;
  }
}

type Draw = (b: Brush, random: Rand) => void;

// ───────────────────────────────────────────────────────────── shared pieces

/** A sugar cube or block seen from above and to the left: front-bottom corner (x, y), edge `s`. */
function cube(b: Brush, x: number, y: number, s: number, t: Tone): void {
  const w = s * 0.87;
  const h = s * 0.5;
  b.fill(poly(x, y, x - w, y - h, x - w, y - h - s, x, y - s), t[0]);
  b.fill(poly(x, y, x + w, y - h, x + w, y - h - s, x, y - s), t[1]);
  b.fill(poly(x, y - s, x - w, y - h - s, x, y - 2 * h - s, x + w, y - h - s), t[2]);
}

/** A round-crowned fruit tree at (x, y): trunk, crown in shade, face and light, and fruit. */
function fruitTree(b: Brush, random: Rand, x: number, y: number, rx: number, ry: number, fruit: string): void {
  const cy = y - ry - 22;
  b.fill(`M${f(x - 3.5)} ${f(y)}L${f(x - 2.5)} ${f(cy)}H${f(x + 2.5)}L${f(x + 3.5)} ${f(y)}Z`, BARK[0]);
  b.fill(blobPath(x, cy, rx, ry, 9, 0.16, random), LEAF[1]);
  b.fill(blobPath(x - rx * 0.08, cy - ry * 0.1, rx * 0.88, ry * 0.84, 9, 0.16, random), LEAF[0]);
  b.fill(blobPath(x - rx * 0.38, cy - ry * 0.42, rx * 0.36, ry * 0.28, 7, 0.2, random), LEAF[2]);
  let dots = '';
  for (let i = 0; i < 6; i++) {
    const a = i * 2.4 + random() * 0.6;
    const k = 0.35 + random() * 0.4;
    dots += O(x + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k, Math.max(2.6, rx * 0.12));
  }
  b.fill(dots, fruit);
}

/** A cloud of round puffs: its shade and face. */
function cloud(b: Brush, cx: number, cy: number, s: number, t: Tone): void {
  const d =
    O(cx - 28 * s, cy + 6 * s, 12 * s) + O(cx - 12 * s, cy - 5 * s, 17 * s) + O(cx + 10 * s, cy - 10 * s, 20 * s) + O(cx + 29 * s, cy + 3 * s, 14 * s) + E(cx, cy + 10 * s, 38 * s, 10 * s);
  b.form(d, t, cx - 26 * s, cy - 22 * s, 0.92);
  b.fill(oval(cx + 2 * s, cy - 21 * s, 8 * s, 4.4 * s, -15), t[2]);
}

/** A riverbank poplar, lit down its left side. */
function poplar(b: Brush, x: number, y: number, s: number): void {
  b.fill(box(x - 1.4 * s, y - 8 * s, 2.8 * s, 8 * s), BARK[0]);
  const top = y - 46 * s;
  const shape = `M${f(x)} ${f(top)}C${f(x + 9 * s)} ${f(top + 12 * s)} ${f(x + 9 * s)} ${f(y - 14 * s)} ${f(x)} ${f(y - 6 * s)}C${f(x - 9 * s)} ${f(y - 14 * s)} ${f(x - 9 * s)} ${f(top + 12 * s)} ${f(x)} ${f(top)}Z`;
  b.form(shape, [VALLEY.poplarLight, VALLEY.poplarShade, VALLEY.poplarLight], x - 6 * s, top + 10 * s, 0.82);
}

// ───────────────────────────────────────────────────────────── animals

/** A limb joint: its position and the limb's thickness there. */
type Joint = readonly [x: number, y: number, w: number];

/** The outline round a limb's joints, thick where they are thick, as one smooth closed shape. */
function limb(joints: readonly Joint[]): string {
  const left: Pt[] = [];
  const right: Pt[] = [];
  joints.forEach(([x, y, w], i) => {
    const [px, py] = joints[Math.max(0, i - 1)]!;
    const [qx, qy] = joints[Math.min(joints.length - 1, i + 1)]!;
    const len = Math.hypot(qx - px, qy - py) || 1;
    const [nx, ny] = [-(qy - py) / len, (qx - px) / len];
    left.push([x + (nx * w) / 2, y + (ny * w) / 2]);
    right.push([x - (nx * w) / 2, y - (ny * w) / 2]);
  });
  return shape([...left, ...right.reverse()], 1);
}

/** Every animal's feet stand on this line, with its shade patch just below. */
const FEET = 102;

/** A foreleg from the body at (x, top) to the ground: straight down past the knee, thinning, the pastern slightly forward. */
function foreLeg(x: number, top: number, w: number): Joint[] {
  return [[x + 1, top, w], [x, top + (FEET - top) * 0.52, w * 0.58], [x + 0.6, FEET - 6, w * 0.44], [x - 1, FEET - 1.2, w * 0.46]];
}

/** A hind leg: thigh deep in the body at (x, top), back to the hock, then down and slightly forward to the foot. */
function hindLeg(x: number, top: number, w: number): Joint[] {
  return [[x, top, w], [x + w * 0.42, top + (FEET - top) * 0.5, w * 0.46], [x + w * 0.12, FEET - 6, w * 0.38], [x - 1, FEET - 1.2, w * 0.42]];
}

/** A hoof under a leg's last joint: small, front sloping, in a dark tone of the leg. */
const hoof = ([x, , w]: Joint): string => poly(x - w * 0.7, FEET - 3.6, x + w * 0.5, FEET - 3.6, x + w * 0.62, FEET, x - w * 0.9, FEET);

/** A paw under a leg's last joint: round and slightly forward. */
const paw = ([x, , w]: Joint): string => E(x - w * 0.3, FEET - 2.2, w * 0.72, 2.6);

/**
 * A form lit from the upper left: the whole shape in shade, and its face over it slightly shorter toward the top and
 * narrower toward the left, so the shadow plane lies along its underside and far end, like a belly or jaw.
 */
function underside(b: Brush, pts: readonly Pt[], t: Tone, k: number): void {
  const ax = Math.min(...pts.map((p) => p[0]));
  const ay = Math.min(...pts.map((p) => p[1]));
  const kx = 1 - (1 - k) * 0.4;
  const d = shape(pts);
  b.fill(d, t[1]);
  b.fill(d, t[0], ` transform="matrix(${n2(kx)} 0 0 ${n2(k)} ${f(ax * (1 - kx))} ${f(ay * (1 - k))})"`);
}

/** Path numbers to a tenth at most, separated only where SVG needs it (a minus sign is its own separator). */
function nums(vs: readonly number[]): string {
  let out = '';
  for (const v of vs) {
    const s = n(v);
    out += out && !s.startsWith('-') ? ` ${s}` : s;
  }
  return out;
}

/**
 * A smooth closed Catmull-Rom outline as cubic Béziers, like `smoothPath`, but written in short relative steps measured
 * from where the rounded path actually is, so rounding never accumulates; an animal is a dozen of these, and this keeps
 * it light. A thin smooth leg can use whole units (`step` 1).
 */
function shape(pts: readonly Pt[], step = 0.1): string {
  const m = pts.length;
  const at = (i: number): Pt => pts[((i % m) + m) % m]!;
  const r = (v: number): number => Math.round(v / step) * step;
  let [cx, cy] = [r(at(0)[0]), r(at(0)[1])];
  const steps: number[] = [];
  for (let i = 0; i < m; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    const seg = [x1 + (x2 - x0) / 6 - cx, y1 + (y2 - y0) / 6 - cy, x2 - (x3 - x1) / 6 - cx, y2 - (y3 - y1) / 6 - cy, x2 - cx, y2 - cy].map(r);
    steps.push(...seg);
    cx = r(cx + seg[4]!);
    cy = r(cy + seg[5]!);
  }
  return `M${n(at(0)[0])} ${n(at(0)[1])}c${nums(steps)}Z`;
}

/**
 * An animal standing side on, facing left, built the same way for every animal so they read as a family: far legs a
 * step darker and offset, body and neck as one outline with a shaded underside, the head, and near legs in the coat
 * colour, thick at the top, bent at knee and hock, thinning to a small dark hoof or a round paw.
 */
interface Beast {
  /** The coat: its face, its one step of shade (far legs and underside) and its light. */
  t: Tone;
  /** Torso and neck as one outline; a woolly body is given as puffs instead. */
  body?: readonly Pt[];
  wool?: readonly [cx: number, cy: number, rx: number, ry: number, count: number, r: number];
  head: readonly Pt[];
  /** The head's tones when they differ from the coat's, such as a sheep's dark face. */
  face?: Tone;
  /** Where each near leg meets the body and its thickness there: x, top, width. */
  fore: readonly [number, number, number];
  hind: readonly [number, number, number];
  /** How far the far legs stand from the near ones. */
  far?: readonly [number, number];
  foot: 'hoof' | 'paw';
  /** Legs in their own colour (a fox's dark stockings, a sheep's dark legs): near, far. */
  legs?: readonly [string, string];
  /** How much of the body's height stays lit above the underside's shade. */
  under?: number;
  /** Drawn before the body: a tail behind it, a far ear or horn. */
  behind?: () => void;
  /** Drawn between body and head: what the head overlaps. */
  between?: () => void;
  /** Drawn last: ears, horns, eyes, a muzzle, markings. */
  front?: () => void;
}

function beast(b: Brush, a: Beast): void {
  const [nearColour, farColour] = a.legs ?? [a.t[0], a.t[1]];
  const [dfx, dhx] = a.far ?? [7, -6];
  const [fx, ft, fw] = a.fore;
  const [hx, ht, hw] = a.hind;
  const legs = (dx: number, dh: number, colour: string): void => {
    const fore = foreLeg(fx + dx, ft, fw);
    const hind = hindLeg(hx + dh, ht, hw);
    b.fill(limb(fore) + limb(hind), colour);
    const feet = [fore[fore.length - 1]!, hind[hind.length - 1]!];
    if (a.foot === 'hoof') b.fill(feet.map(hoof).join(''), mix(colour, INK, 0.5));
    else b.fill(feet.map(paw).join(''), colour);
  };
  legs(dfx, dhx, farColour);
  a.behind?.();
  if (a.wool) {
    const [cx, cy, rx, ry, count, r] = a.wool;
    b.fill(puffs(cx + 1.5, cy + 2, rx, ry, count, r, 0.2), a.t[1]);
    b.fill(puffs(cx, cy, rx, ry, count, r * 0.92, 0.2), a.t[0]);
  } else if (a.body) underside(b, a.body, a.t, a.under ?? 0.92);
  a.between?.();
  underside(b, a.head, a.face ?? a.t, 0.93);
  legs(0, 0, nearColour);
  a.front?.();
}

/** An eye: small and dark on every animal; on a dark face, a pale ring round the dark. */
function eye(b: Brush, x: number, y: number, r = 2, ring?: string): void {
  if (ring) b.fill(O(x, y, r + 0.9), ring);
  b.fill(O(x, y, r), INK);
}

// ───────────────────────────────────────────────────────────── the pictures

const APPLE = 'M60 41C49 31 22 35 22 63C22 86 39 104 51 104C55 104 57 102 60 102C63 102 65 104 69 104C81 104 98 86 98 63C98 35 71 31 60 41Z';

const PICTURES: Record<WordPictureId, Draw> = {
  apple: (b) => {
    b.ground(32);
    b.line('M60 41C59 32 62 25 67 20', BARK[0], 4.5);
    b.form('M63 31C68 19 82 16 92 21C88 33 74 38 63 31Z', LEAF, 64, 24, 0.84);
    b.line('M67 29C74 26 81 23 88 22', LEAF[2], 1.4);
    b.form(APPLE, RED, 32, 44);
    b.fill(oval(39, 58, 5, 9, 20), RED[2]);
  },

  // Tea is the tulip glass on its saucer, red and steaming; a cup has a handle and a drinking glass is straight and clear.
  tea: (b) => {
    b.ground(38, 60, 101);
    b.fill(E(60, 99, 37, 7.5), WHITE[1]);
    b.fill(E(60, 97, 37, 6.5), WHITE[0]);
    b.fill(E(60, 97, 21, 3.4), WHITE[1]);
    b.fill('M41 30H79C79 45 70 51 70 60C70 70 81 74 81 84C81 92 72 97 60 97C48 97 39 92 39 84C39 74 50 70 50 60C50 51 41 45 41 30Z', GLASS[0]);
    b.fill('M43.5 39H76.5C75 48 67.5 52 67.5 60C67.5 70 78.5 74 78.5 84C78.5 90.5 70.5 94.5 60 94.5C49.5 94.5 41.5 90.5 41.5 84C41.5 74 52.5 70 52.5 60C52.5 52 45 48 43.5 39Z', '#b4452a');
    b.fill('M76.5 39C75 48 67.5 52 67.5 60C67.5 70 78.5 74 78.5 84C78.5 90.5 70.5 94.5 62 94.5C69 92 73 88 73 83C73 74 63 70 63 60C63 52 70 47 71 39Z', '#8a2f1a');
    b.fill(E(60, 39, 16.5, 2.4), '#d9683c');
    b.fill(E(60, 30, 19, 2.6), GLASS[1]);
    b.fill('M45 34C46 44 54 50 54 60C54 66 47 72 45 80C44 72 50 66 50 60C50 52 45 46 45 34Z', '#ffffff', ' fill-opacity="0.75"');
    b.line('M53 24C49 19 57 15 53 9M67 24C63 19 71 15 67 9', '#d8d2c8', 3);
  },

  // Water is a drop falling into its own puddle, not a glass of it, so it never reads as qedeh (a drinking glass).
  water: (b) => {
    b.ground(40, 60, 104);
    b.fill(E(60, 103, 36, 6), WATER[2]);
    b.line(E(60, 103, 24, 3.6), WATER[0], 1.6);
    b.form('M60 12C66 24 92 48 92 71C92 89 78 101 60 101C42 101 28 89 28 71C28 48 54 24 60 12Z', WATER, 40, 46);
    b.fill('M41 74C41 63 46 54 52 46C50 56 48 63 48 72C48 78 50 83 53 87C46 85 41 80 41 74Z', WATER[2]);
  },

  sugar: (b) => {
    b.ground(44);
    const t: Tone = ['#ebe5d8', '#c2b8a3', '#fdfbf6'];
    const s = 24;
    // A pile seen from above and to the left: four on the ground, one on top, back to front.
    const at = (i: number, j: number, k: number): [number, number] => [60 + (i - j) * s * 0.87, 103 - (2 - i - j) * s * 0.5 - k * s];
    for (const [i, j, k] of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0.5, 0.5, 1]] as const) {
      // Each slightly smaller than its place, so a hairline of the card shows between them.
      const [x, y] = at(i, j, k);
      cube(b, x, y - 0.08 * s, 0.92 * s, t);
    }
  },

  house: (b) => {
    b.ground(46, 62, 103);
    b.fill(poly(74, 102, 74, 63, 100, 55, 100, 94), WALL[1]);
    b.fill(poly(24, 102, 24, 63, 49, 38, 74, 63, 74, 102), WALL[0]);
    b.fill(box(83, 26, 8, 20), WALL[1]);
    b.fill(poly(47, 35, 75, 27, 105, 55, 77, 67), ROOF[0]);
    b.fill(poly(19, 66, 49, 33, 80, 66, 76, 69, 49, 40, 23, 69), ROOF[1]);
    b.fill(box(81, 23, 12, 4, 1), ROOF[1]);
    b.fill('M41 102V87A8 8 0 0 1 57 87V102Z', BLUE[0]);
    b.fill(O(53.5, 94, 1.3), GOLD[0]);
    b.lit(O(49, 55, 4.5) + poly(82, 80, 82, 70, 92, 67, 92, 77), VALLEY.window, LAMP);
  },
  hen: (b) => {
    const t: Tone = ['#d27a3c', '#a5552a', '#e9a066'];
    b.ground(34, 64);
    b.line('M57 90L56 102M51 103.5H61M71 89L72 102M67 103.5H77', GOLD[1], 3);
    b.fill(shape([[78, 62], [82, 44], [90, 30], [99, 29], [105, 44], [104, 62], [96, 74]]), '#7c4426');
    underside(b, [[31, 38], [36, 31], [45, 31], [50, 38], [52, 48], [58, 57], [70, 59], [84, 56], [96, 59], [99, 70], [92, 83], [78, 92], [58, 94], [44, 89], [35, 77], [33, 64], [33, 54], [29, 47]], t, 0.92);
    b.fill(shape([[50, 66], [62, 61], [76, 61], [88, 67], [84, 77], [70, 83], [57, 80]]), t[1]);
    b.fill('M33 33C31 26 36 23 38 28C39 21 45 21 44 28C47 23 52 26 48 33Z' + 'M29 46C26 52 29 57 33 55C35 53 34 49 32 46Z', VALLEY.red);
    b.fill(poly(31, 39, 21, 43, 31, 47), GOLD[0]);
    eye(b, 37, 39, 2);
  },

  dog: (b) => {
    const t: Tone = ['#d6a061', '#a8733d', '#ecc28a'];
    b.ground(42, 60);
    beast(b, {
      t,
      body: [[31, 48], [34, 37], [42, 31], [49, 34], [55, 43], [66, 47], [80, 47], [89, 47], [95, 52], [95, 60], [90, 67], [82, 70], [72, 70], [62, 72], [52, 76], [44, 76], [38, 71], [33, 62]],
      head: [[28, 25], [37, 22], [45, 26], [48, 34], [45, 42], [37, 47], [28, 46], [19, 45], [11, 43], [9, 38], [13, 34], [21, 32], [25, 28]],
      fore: [45, 66, 9.5],
      hind: [84, 58, 14],
      foot: 'paw',
      behind: () => b.fill(shape([[90, 52], [98, 46], [103, 36], [102, 28], [98, 33], [95, 42], [88, 48]]), t[0]),
      between: () => {
        // The collar just under the head, its tag hanging at the throat.
        b.line('M55 44C50 51 42 55 33 56', VALLEY.red, 4.2);
        b.fill(O(34, 60.5, 2.8), GOLD[0]);
      },
      front: () => {
        b.fill(shape([[35, 24], [43, 25], [47, 32], [45, 42], [40, 45], [37, 39], [35, 31]]), '#8a5a36');
        b.fill(shape([[17, 45], [22, 45], [22, 50], [19.5, 52], [17, 49]]), TONGUE);
        b.fill(oval(10.5, 38, 2.6, 2.1, 0), INK);
        eye(b, 27, 32, 1.9);
      },
    });
  },

  cat: (b) => {
    const t: Tone = ['#ea9748', '#bd6c2a', '#f8c48a'];
    b.ground(34, 62);
    b.fill(shape([[82, 99], [96, 100], [104, 92], [104, 82], [99, 76], [96, 79], [99, 85], [98, 92], [90, 95], [80, 95]]), t[1]);
    underside(b, [[50, 57], [62, 55], [74, 60], [84, 72], [89, 86], [88, 98], [82, 103], [64, 103], [42, 103], [34, 99], [33, 88], [37, 74], [43, 63]], t, 0.93);
    b.fill(shape([[52, 62], [60, 64], [68, 62], [67, 72], [60, 78], [53, 72]]), t[2]);
    b.fill(limb([[53, 74, 8.5], [52, 92, 7], [52, 100, 7.4]]) + limb([[67, 74, 8.5], [68, 92, 7], [68, 100, 7.4]]), t[0]);
    b.fill(E(51, 101, 6, 3) + E(69, 101, 6, 3), t[2]);
    b.line('M79 70C83 73 85 77 86 82M75 63C79 66 82 70 83 74', t[1], 2.4);
    b.fill('M43 37L41 14L57 27Z' + 'M77 37L79 14L63 27Z', t[0]);
    underside(b, [[40, 42], [44, 31], [52, 25], [60, 24], [68, 25], [76, 31], [80, 42], [77, 52], [69, 58], [60, 60], [51, 58], [43, 52]], t, 0.93);
    b.fill('M45 31L45 20L53 27Z' + 'M75 31L75 20L67 27Z', PINK);
    b.line('M56 28L57 33M64 28L63 33M60 27V32', t[1], 2);
    b.fill(poly(57, 48, 63, 48, 60, 51.5), TONGUE);
    eye(b, 52, 42, 2.2);
    eye(b, 68, 42, 2.2);
    b.line('M46 50L32 48M46 53L33 56M74 50L88 48M74 53L87 56', '#fff3e2', 1.2);
  },

  donkey: (b) => {
    const t: Tone = ['#a59c98', '#7b7370', '#c4bdb9'];
    const dark = '#4a3f3c';
    b.ground(44, 62);
    beast(b, {
      t,
      body: [[30, 30], [37, 33], [43, 41], [53, 46], [67, 46], [81, 45], [91, 46], [98, 52], [100, 62], [96, 72], [88, 78], [74, 79], [56, 79], [46, 78], [39, 73], [34, 64], [30, 54], [25, 44], [24, 36]],
      head: [[25, 24], [35, 27], [39, 36], [33, 46], [22, 55], [13, 59], [8, 56], [8, 49], [15, 38], [20, 28]],
      fore: [45, 72, 9.5],
      hind: [87, 68, 13],
      foot: 'hoof',
      behind: () => {
        b.fill(shape([[31, 27], [32, 15], [36, 4], [39, 7], [38, 18], [35, 28]]), t[1]);
        b.line('M98 55C102 63 104 72 103 82', t[1], 3);
        b.fill(oval(103, 85, 3.2, 6, 0), dark);
      },
      between: () => {
        b.fill(shape([[30, 27], [38, 31], [46, 41], [53, 46], [49, 48], [41, 41], [33, 34]]), dark);
        // A kilim over its back, following the curve of the back.
        b.fill('M56 46C64 45 74 45 82 44L83 62C76 63 64 63 56 63Z', VALLEY.red);
        b.fill('M56 51C64 50 74 50 82 49.5V53C74 53 64 53.4 56 54Z', CREAM);
        b.fill(diamond(69.5, 58.5, 4, 3.6), VALLEY.indigo);
      },
      front: () => {
        b.fill(shape([[24, 25], [22, 14], [24, 3], [28, 4], [30, 15], [30, 26]]), t[0]);
        b.fill(shape([[8, 49], [14, 45], [21, 49], [22, 55], [13, 59], [8, 56]]), '#e9e3dc');
        b.fill(oval(10.5, 52, 1.5, 1, -30), INK);
        eye(b, 24, 36, 2);
      },
    });
  },

  orchard: (b, random) => {
    b.ground(54, 62, 103);
    b.fill(E(60, 97, 52, 12), GRASS[1]);
    b.fill(E(59, 94, 51, 10.5), GRASS[0]);
    fruitTree(b, random, 84, 92, 21, 19, VALLEY.fruit);
    fruitTree(b, random, 38, 96, 25, 22, VALLEY.apple);
    b.line('M18 96l-2 -5M20 96v-6M98 92l2 -5M70 100l-1 -5M72 100l2 -4', GRASS[1], 2);
  },

  bread: (b) => {
    b.ground(44);
    const flat: Tone = ['#f0cd8c', '#cf9f58', '#f8e2b2'];
    b.fill(E(60, 96, 50, 9), flat[1]);
    b.fill(E(60, 93, 50, 8.5), flat[0]);
    b.fill(E(60, 88, 48, 8.5), flat[1]);
    b.fill(E(60, 85, 48, 8), flat[2]);
    b.fill(O(20, 94, 1.6) + O(34, 99, 1.6) + O(54, 101, 1.6) + O(76, 100, 1.6) + O(96, 95, 1.6), flat[1]);
    const crust: Tone = ['#e2a95c', '#b07a34', '#f6cf94'];
    b.form('M16 74C16 50 36 34 62 34C88 34 106 50 106 74C106 82 99 87 91 87H31C23 87 16 82 16 74Z', crust, 26, 40, 0.9);
    b.fill(oval(40, 60, 4, 13, 28) + oval(62, 57, 4, 14, 28) + oval(84, 60, 4, 13, 28), '#f7dcae');
    b.fill(oval(32, 50, 8, 3, -28), crust[2]);
  },

  flower: (b) => {
    b.ground(26);
    b.line('M60 104C60 90 58 76 60 56', LEAF[1], 4);
    b.form('M59 88C48 74 32 76 26 82C34 92 48 94 59 88Z', LEAF, 30, 80, 0.86);
    b.form('M61 76C70 64 86 64 92 70C86 80 72 82 61 76Z', LEAF, 66, 70, 0.86);
    let shade = '';
    let face = '';
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
      const [x, y] = [60 + Math.cos(a) * 16, 40 + Math.sin(a) * 16];
      shade += O(x, y, 12);
      face += O(x - 1.6, y - 1.6, 10.6);
    }
    b.fill(shade, '#c95888');
    b.fill(face, '#ef7fa8');
    b.form(O(60, 40, 9), SUN, 54, 34, 0.85);
  },

  tree: (b, random) => {
    b.ground(40);
    b.form('M52 104C55 92 56 82 54 72L45 62L49 59L57 66L58 55H63L64 65L72 57L76 60L66 72C64 82 65 92 68 104Z', BARK, 52, 70, 0.9);
    b.fill(blobPath(60, 44, 40, 32, 11, 0.16, random), LEAF[1]);
    b.fill(blobPath(56, 40, 35, 27, 11, 0.16, random), LEAF[0]);
    b.fill(blobPath(45, 30, 15, 10, 8, 0.25, random), LEAF[2]);
  },

  pen: (b) => {
    b.ground(34);
    b.group('rotate(-38 60 60)', () => {
      b.fill('M12 60L30 51H38V69H30Z', GOLD[0]);
      b.line('M16 60H29', GOLD[1], 1.4);
      b.fill(box(36, 52, 10, 16, 2), VALLEY.indigo);
      b.fill(box(44, 50, 60, 20, 7), BLUE[0]);
      b.fill('M44 62H104V63C104 67 101 70 97 70H51C47 70 44 67 44 63Z', BLUE[1]);
      b.line('M52 55H96', BLUE[2], 2);
      b.fill(box(72, 50, 4, 20) + box(78, 45, 22, 4.5, 2), GOLD[0]);
    });
  },

  shoe: (b) => {
    const sole: Tone = ['#f3e6cc', '#d4c09e', '#ffffff'];
    b.ground(48, 60, 101);
    b.fill('M10 88C10 95 15 100 23 100H99C105 100 109 96 109 88Z', sole[1]);
    b.fill('M10 88C10 93 15 96 23 96H99C105 96 109 93 109 88Z', sole[0]);
    b.form('M13 89C11 79 19 73 31 71C43 69 51 62 57 50H95C100 50 104 54 104 60V89Z', RED, 20, 60, 0.94);
    b.fill('M90 50H95C100 50 104 54 104 60V89H92C95 76 95 62 90 50Z', RED[1]);
    b.fill(E(76, 51, 19, 4.5), '#7a2a22');
    b.fill('M54 57C55 47 61 42 68 43L66 59Z', RED[2]);
    b.line('M50 60L62 58M46 65L58 63M41 70L53 68', '#ffffff', 2.6);
  },

  bag: (b) => {
    b.ground(40, 60, 104);
    b.group(grow(1.06), () => {
      b.line('M30 52C26 16 94 16 90 52', '#8a5a36', 6);
      b.form(box(20, 46, 80, 52, 10), [VALLEY.red, VALLEY.redDark, '#dc6b5c'], 22, 48, 0.94);
      b.fill(box(20, 78, 80, 11), CREAM);
      b.fill(diamond(32, 83.5, 4, 4) + diamond(46, 83.5, 4, 4) + diamond(60, 83.5, 4, 4) + diamond(74, 83.5, 4, 4) + diamond(88, 83.5, 4, 4), VALLEY.indigo);
      b.fill('M20 56C20 50 25 46 31 46H89C95 46 100 50 100 56V66L60 74L20 66Z', VALLEY.redDark);
      b.fill(diamond(60, 61, 9, 7), GOLD[0]);
      b.fill(diamond(60, 61, 3.5, 3), VALLEY.indigo);
      b.line('M26 98V106M94 98V106', CREAM, 4);
    });
  },

  book: (b) => {
    b.ground(46, 60, 100);
    b.fill('M12 42L60 48L108 42V95L60 103L12 95Z', BLUE[1]);
    b.fill('M16 38C30 34 48 36 60 44V98C48 90 30 88 16 92Z', PAPER[0]);
    b.fill('M104 38C90 34 72 36 60 44V98C72 90 90 88 104 92Z', PAPER[1]);
    b.line('M24 50C34 48 44 49 52 53M24 60C34 58 44 59 52 63M24 70C34 68 44 69 52 73M24 80C32 78 40 79 46 81', '#c9b896', 2.2);
    b.line('M68 53C76 49 86 48 96 50M68 63C76 59 86 58 96 60M68 73C76 69 86 68 96 70', '#b9a580', 2.2);
    b.fill('M57 98H63V110L60 107L57 110Z', VALLEY.red);
  },

  cap: (b) => {
    const t: Tone = ['#3e8fbf', '#2b6a92', '#78b6dc'];
    b.ground(44, 58);
    b.form('M30 78C30 52 46 36 66 36C86 36 100 52 100 74C100 80 96 82 90 82H36C32 82 30 81 30 78Z', t, 40, 42, 0.9);
    b.line('M66 37C58 48 54 62 54 81M66 37C76 48 80 62 80 81', t[1], 1.8);
    b.fill(O(66, 36, 4), t[1]);
    b.fill('M40 76C26 76 12 80 10 87C9 92 16 94 26 93C42 91 58 85 64 79Z', t[1]);
    b.fill(oval(44, 50, 8, 4, -40), t[2]);
  },

  heart: (b) => {
    b.ground(30, 60, 104);
    b.form('M60 100C46 88 16 70 16 45C16 31 26 21 40 21C49 21 56 26 60 33C64 26 71 21 80 21C94 21 104 31 104 45C104 70 74 88 60 100Z', [VALLEY.red, VALLEY.redDark, '#ea7d70'], 30, 30, 0.88);
    b.fill(oval(34, 42, 6, 9, 35), '#ea7d70');
  },

  gift: (b) => {
    const t: Tone = ['#3fa08e', '#2b7a6b', '#7cc8b8'];
    b.ground(44);
    b.group(grow(1.15), () => {
      b.form(box(28, 56, 64, 46, 3), t, 30, 58, 0.93);
      b.fill(box(28, 57, 64, 3), t[1]);
      b.fill(box(54, 56, 12, 46), GOLD[0]);
      b.form(box(23, 44, 74, 14, 3), t, 25, 46, 0.95);
      b.fill(box(54, 44, 12, 14), GOLD[0]);
      b.fill('M60 45C52 28 34 30 38 40C40 46 50 47 60 45Z' + 'M60 45C68 28 86 30 82 40C80 46 70 47 60 45Z', GOLD[0]);
      b.fill('M58 44C52 36 44 36 44 40C46 43 52 44 58 44Z' + 'M62 44C68 36 76 36 76 40C74 43 68 44 62 44Z', GOLD[1]);
      b.fill(O(60, 44, 5), GOLD[1]);
    });
  },

  basket: (b) => {
    b.ground(42);
    b.group(grow(1.05), () => {
      b.line('M24 58C24 14 96 14 96 58', STRAW[1], 6);
      b.fill(E(60, 58, 40, 8), '#8a6428');
      b.form('M20 60H100L92 97C91 101 87 104 82 104H38C33 104 29 101 28 97Z', STRAW, 22, 62, 0.94);
      b.dash('M23 72H97', STRAW[1], 3.5, 6, 5);
      b.dash('M25 82H95', STRAW[1], 3.5, 6, 5, 5.5);
      b.dash('M27 92H93', STRAW[1], 3.5, 6, 5);
      b.line(E(60, 58, 41, 8.5), STRAW[2], 4.5);
    });
  },

  sock: (b) => {
    const red: Tone = [VALLEY.red, VALLEY.redDark, '#dc6b5c'];
    b.ground(38, 70, 104);
    b.form('M38 18H70V64C70 69 73 72 78 73L94 77C104 80 109 88 106 96C103 103 96 105 88 103L50 95C40 93 35 85 36 77L38 64Z', red, 40, 22, 0.95);
    b.fill('M94 77C104 80 109 88 106 96C103 103 96 105 88 103C93 96 93 84 94 77Z' + 'M36 77C35 85 40 93 50 95L52 85C45 83 41 78 38 70Z', CREAM);
    b.fill(box(38, 33, 32, 9), CREAM);
    b.line('M39 37.5L43 34.5L47 40.5L51 34.5L55 40.5L59 34.5L63 40.5L67 34.5L70 37', VALLEY.indigo, 1.8);
    b.fill(diamond(44, 52, 4, 5) + diamond(54, 52, 4, 5) + diamond(64, 52, 4, 5), GOLD[0]);
    b.fill(box(35, 12, 38, 14, 3), CREAM);
    b.line('M41 15V23M47 15V23M53 15V23M59 15V23M65 15V23', '#d9c28a', 1.6);
    b.line('M56 84L86 91', GOLD[0], 2.4, ' stroke-dasharray="3 4"');
  },
  horse: (b) => {
    const t: Tone = ['#b06c38', '#84491f', '#c98a54'];
    const mane = '#4a2e1e';
    b.ground(46, 62);
    beast(b, {
      t,
      body: [[30, 17], [37, 23], [43, 33], [50, 42], [62, 46], [76, 46], [88, 42], [97, 47], [101, 57], [98, 68], [91, 75], [78, 77], [62, 77], [49, 76], [41, 72], [35, 63], [31, 52], [25, 40], [23, 30]],
      head: [[28, 13], [35, 18], [34, 28], [27, 35], [17, 42], [10, 44], [5, 41], [6, 35], [14, 25], [21, 15]],
      fore: [44, 70, 10.5],
      hind: [87, 64, 15],
      foot: 'hoof',
      behind: () => b.fill(shape([[96, 48], [104, 53], [109, 67], [107, 86], [102, 92], [103, 78], [100, 64], [94, 56]]), mane),
      between: () => b.fill(shape([[28, 14], [36, 17], [43, 27], [50, 40], [45, 42], [38, 32], [32, 24], [26, 19]]), mane),
      front: () => {
        b.fill(poly(25, 16, 27, 5, 32, 15), t[0]);
        b.fill(shape([[22, 17], [25, 20], [16, 33], [11, 38], [9.5, 35], [17, 24]]), '#efe2cc');
        b.fill(oval(8.5, 38.5, 1.6, 1.1, -30), INK);
        eye(b, 21, 23, 2.1);
      },
    });
  },

  cow: (b) => {
    const t: Tone = ['#f7f0e3', '#d9ccb6', '#ffffff'];
    const patch = '#5e4031';
    b.ground(48, 62);
    beast(b, {
      t,
      body: [[30, 44], [40, 40], [54, 40], [72, 40], [88, 38], [98, 42], [103, 52], [102, 66], [97, 76], [88, 82], [70, 83], [52, 83], [42, 82], [36, 76], [32, 66], [29, 55]],
      head: [[20, 35], [33, 35], [39, 42], [40, 55], [38, 66], [33, 75], [24, 77], [16, 75], [11, 68], [11, 55], [14, 43]],
      fore: [42, 76, 13.5],
      hind: [89, 70, 17],
      foot: 'hoof',
      behind: () => {
        b.line('M102 48C106 58 107 70 106 80', t[1], 3);
        b.fill(oval(106, 84, 3.4, 6, 0), patch);
        b.fill(shape([[72, 81], [84, 81], [85, 87], [78, 90], [71, 87]]), PINK);
      },
      between: () => {
        b.fill(shape([[50, 41], [64, 41], [66, 49], [59, 55], [51, 51]]) + shape([[87, 40], [97, 43], [101, 52], [99, 60], [91, 58], [86, 49]]) + shape([[60, 62], [72, 60], [76, 68], [69, 74], [61, 71]]), patch);
        b.fill(oval(7, 45, 8, 3.6, 20) + oval(44, 44, 8, 3.6, -20), t[1]);
        b.fill('M17 37C13 33 12 28 14 24C17 28 20 32 23 36Z' + 'M36 36C40 32 41 27 39 23C36 27 33 31 30 35Z', '#efe2c4');
      },
      front: () => {
        b.fill(shape([[30, 37], [36, 38], [39, 45], [38, 52], [32, 51], [29, 44]]), patch);
        b.fill(shape([[12, 63], [22, 60], [32, 62], [37, 68], [33, 76], [24, 78], [15, 76], [11, 70]]), PINK);
        b.fill(oval(19, 69, 2, 1.4, 0) + oval(29, 69, 2, 1.4, 0), '#b5786a');
        eye(b, 19, 49, 2.1);
        eye(b, 33, 49, 2.1);
      },
    });
  },

  ewe: (b) => {
    const dark: Tone = ['#4a3a30', '#382b24', '#6a5648'];
    b.ground(44, 62);
    beast(b, {
      t: WOOL,
      wool: [66, 60, 27, 16, 12, 10],
      head: [[33, 44], [38, 50], [35, 60], [27, 68], [19, 71], [14, 67], [15, 59], [22, 49], [28, 44]],
      face: dark,
      fore: [47, 70, 6.5],
      hind: [84, 68, 8.5],
      legs: [dark[0], dark[1]],
      foot: 'hoof',
      between: () => b.fill(shape([[34, 45], [43, 44], [46, 47], [40, 50], [34, 49]]), dark[1]),
      front: () => {
        b.fill(shape([[22, 49], [14, 46], [10, 48], [15, 51], [22, 53]]), dark[0]);
        b.fill(puffs(31, 45, 5, 3, 5, 4.2), WOOL[0]);
        eye(b, 22, 55, 1.6, '#e9dcc8');
      },
    });
  },

  goat: (b) => {
    const t: Tone = ['#5e4c43', '#3f322c', '#7f6c62'];
    const horn = '#d9c39b';
    b.ground(42, 62);
    beast(b, {
      t,
      body: [[32, 30], [38, 35], [44, 44], [56, 47], [72, 47], [86, 45], [94, 46], [99, 52], [98, 62], [92, 72], [80, 76], [62, 76], [50, 75], [42, 70], [37, 62], [33, 52], [28, 42], [27, 34]],
      head: [[29, 24], [37, 28], [37, 37], [31, 43], [22, 49], [15, 51], [11, 48], [12, 42], [19, 32], [24, 26]],
      fore: [45, 70, 8],
      hind: [88, 66, 11.5],
      foot: 'hoof',
      behind: () => {
        b.fill(shape([[93, 48], [99, 40], [103, 37], [102, 43], [98, 50]]), t[0]);
        b.fill(shape([[31, 26], [35, 17], [43, 11], [51, 11], [45, 15], [39, 21], [35, 28]]), '#b9a47e');
      },
      front: () => {
        b.fill(shape([[27, 26], [30, 16], [38, 9], [47, 8], [41, 12], [35, 19], [32, 28]]), horn);
        b.fill(shape([[33, 30], [42, 32], [47, 37], [41, 38], [33, 35]]), t[1]);
        b.fill(shape([[12, 49], [18, 49], [18, 56], [15, 63], [12, 56]]), t[1]);
        eye(b, 25, 35, 1.6, '#e9b84a');
      },
    });
  },

  lamb: (b) => {
    const t: Tone = ['#fdf7ea', '#e3d5bb', '#ffffff'];
    b.ground(42, 64);
    b.group(grow(1.12, 64, 102), () => beast(b, {
      t,
      wool: [70, 64, 20, 13, 10, 9],
      head: [[31, 37], [41, 39], [45, 47], [42, 56], [33, 61], [25, 61], [20, 57], [20, 48], [25, 40]],
      fore: [54, 74, 6],
      hind: [84, 72, 8.5],
      legs: ['#efe4cf', '#d8c8ab'],
      foot: 'hoof',
      between: () => b.fill(shape([[42, 40], [50, 36], [54, 38], [48, 43], [43, 45]]), t[1]),
      front: () => {
        b.fill(shape([[22, 45], [12, 41], [9, 44], [14, 48], [22, 50]]), t[0]);
        b.fill(shape([[20, 45.5], [13, 43], [12, 44.5], [15, 46.5], [20, 48]]), PINK);
        b.fill(puffs(33, 38, 5, 2.4, 5, 3.8), t[0]);
        b.fill(oval(22, 56, 2.2, 1.6, 0), '#e8a7a0');
        eye(b, 31, 48, 1.9);
        // A bell on a red band round its neck, hanging at the throat.
        b.line('M47 51C46 57 43 61 38 63', VALLEY.red, 2.8);
        b.form(shape([[36, 63], [40, 63], [41.5, 68], [34.5, 68]]), GOLD, 36, 63, 0.8);
      },
    }));
  },

  phone: (b) => {
    const t: Tone = ['#47415e', '#2f2b42', '#6b6585'];
    b.ground(32);
    b.group('rotate(-10 60 58)', () => {
      b.form(box(34, 10, 52, 92, 10), t, 36, 12, 0.96);
      b.fill(box(39, 20, 42, 72, 4), '#cfe7f3');
      b.fill(poly(39, 62, 81, 30, 81, 42, 39, 74), '#e3f2f8');
      // A generic home screen of soft rounded tiles in the valley's colours.
      const tile = (col: number, row: number): string => box(43 + col * 13, 27 + row * 13, 9.5, 9.5, 2.6);
      const tiles: readonly [string, readonly (readonly [number, number])[]][] = [
        [VALLEY.red, [[0, 0], [2, 2], [1, 4]]],
        [VALLEY.gold, [[1, 0], [0, 3]]],
        [VALLEY.leaf, [[2, 0], [1, 2], [0, 4]]],
        [VALLEY.gate, [[0, 1], [2, 3], [2, 4]]],
        [CLAY[0], [[1, 1], [0, 2]]],
        [VALLEY.indigo, [[2, 1], [1, 3]]],
      ];
      b.fill(box(40, 78, 40, 13, 3), '#e3f2f8');
      for (const [colour, at] of tiles) b.fill(at.map(([col, row]) => tile(col, row + (row === 4 ? 0.15 : 0))).join(''), colour);
      b.fill(box(53, 14, 14, 2.6, 1.3) + box(52, 96, 16, 2.4, 1.2), t[2]);
    });
  },

  car: (b) => {
    b.ground(50, 60, 101);
    b.form('M12 82C12 74 17 70 25 69L38 51C40 47 44 45 49 45H75C80 45 84 47 87 51L98 67C106 69 110 74 110 81V87C110 90 108 92 105 92H15C13 92 12 90 12 88Z', RED, 24, 52, 0.94);
    b.fill('M41 54C42 51 44 50 47 50H58V67H33Z' + 'M62 50H74C77 50 79 51 81 54L90 67H62Z', SKY_PANE);
    b.line('M60 50V88M66 74H72', RED[1], 1.8);
    b.fill(O(34, 92, 12) + O(88, 92, 12), '#3d3a46');
    b.fill(O(34, 92, 5) + O(88, 92, 5), STEEL[0]);
    b.fill(oval(106, 76, 3, 4, 0), GOLD[2]);
    b.fill(oval(30, 60, 6, 2.2, -45), RED[2]);
  },

  money: (b) => {
    const note: Tone = ['#6cae72', '#4a8a55', '#b5dcaa'];
    b.ground(46);
    const bill = (): void => {
      b.fill(box(22, 34, 70, 40, 4), note[0]);
      b.line(box(27, 39, 60, 30, 2), note[2], 1.6);
      b.fill(O(57, 54, 9), note[2]);
      b.fill(O(57, 54, 4.5), note[1]);
    };
    b.group('rotate(14 57 54)', bill);
    b.group('translate(-4 8) rotate(-8 57 54)', bill);
    for (const y of [98, 91, 84]) {
      b.fill(E(88, y + 3, 17, 6.5), GOLD[1]);
      b.fill(E(88, y, 17, 6.5), GOLD[0]);
      b.line(E(88, y, 11, 4), GOLD[2], 1.6);
    }
  },

  cheese: (b) => {
    const t: Tone = ['#f6d572', '#dcae45', '#fbe7a4'];
    b.ground(46, 60, 101);
    b.fill(poly(12, 74, 98, 72, 98, 100, 12, 100), t[0]);
    b.fill(poly(98, 72, 84, 48, 84, 76, 98, 100), t[1]);
    b.fill(poly(12, 74, 84, 48, 98, 72), t[2]);
    b.fill(E(34, 86, 5, 4) + E(58, 90, 6, 4.5) + E(80, 84, 4, 3.4) + E(48, 80, 2.5, 2), t[1]);
    b.fill(E(62, 64, 5, 2.2) + E(78, 58, 3, 1.4), t[1]);
    b.fill(E(91, 72, 2.6, 4), '#c49536');
  },

  egg: (b) => {
    const egg = 'M0 -27C12 -27 21 -8 21 6C21 19 12 27 0 27C-12 27 -21 19 -21 6C-21 -8 -12 -27 0 -27Z';
    b.ground(44, 62);
    b.group('translate(76 68) rotate(14) scale(1.25)', () => {
      b.form(egg, ['#e9c49a', '#c99c6c', '#f6dfc2'], -12, -16, 0.9);
    });
    b.group('translate(46 74) rotate(-10) scale(1.25)', () => {
      b.form(egg, ['#fbf6ec', '#ddd1bc', '#ffffff'], -12, -16, 0.9);
      b.fill(oval(-9, -8, 4, 7, 15), '#ffffff');
    });
  },

  meat: (b) => {
    const meat: Tone = ['#cf4f45', '#9a332d', '#e47a6c'];
    b.ground(46);
    // A cut of meat on the board: its cut face in a rim of fat, the cut bone, and its thickness below.
    b.group('rotate(-10 60 62)', () => {
      const cut = shape([[12, 58], [18, 42], [36, 32], [60, 31], [84, 35], [102, 47], [106, 62], [98, 76], [78, 84], [52, 86], [28, 82], [14, 72]]);
      b.fill(cut, meat[1], ' transform="translate(0 7)"');
      b.fill(cut, '#f6dccb');
      b.fill(cut, meat[0], ' transform="matrix(0.86 0 0 0.82 1.96 15.12)"');
      b.fill(O(80, 48, 9.5), '#f3ead8');
      b.fill(O(80, 48, 4.4), '#e3c3a0');
      b.fill(oval(34, 52, 9, 4, -20), meat[2]);
    });
  },

  yoghurt: (b) => {
    b.ground(46);
    b.fill(E(60, 101, 18, 4), CLAY[1]);
    b.form('M16 64C16 88 36 102 60 102C84 102 104 88 104 64Z', CLAY, 28, 68, 0.94);
    // The painted zigzag of village pottery round the bowl.
    let zig = 'M24 78';
    for (let i = 1; i <= 12; i++) zig += `L${24 + i * 6} ${i % 2 ? 82 : 78}`;
    b.line(zig, CREAM, 2.4);
    b.fill(E(60, 64, 44, 11), CLAY[2]);
    b.fill(E(60, 64, 39, 8.5), '#fbf8f1');
    b.line('M44 64C48 60 62 59 70 62C76 65 68 69 58 67', '#e0d9cb', 2.4);
  },

  // A sindoq is the plain wooden chest a household keeps its linen and keepsakes in: planks, two iron straps and a hasp,
  // never a pirate's gold.
  chest: (b) => {
    const iron: Tone = ['#5b5552', '#3f3a38', '#7c7673'];
    b.ground(48, 62, 103);
    // The right end in shade, the front in the wood's face, the lid a little proud of both.
    b.fill(poly(88, 101, 88, 60, 104, 52, 104, 93), WOOD[1]);
    b.fill(box(16, 60, 72, 41), WOOD[0]);
    b.line('M16 74H88M16 88H88M88 74L104 66M88 88L104 80', WOOD[1], 1.4);
    b.fill(poly(13, 50, 29, 42, 108, 42, 92, 50), WOOD[2]);
    b.fill(box(13, 50, 79, 11, 1.5), WOOD[0]);
    b.fill(poly(92, 50, 108, 42, 108, 52, 92, 61), WOOD[1]);
    b.line('M15 60.4H91', WOOD[1], 1.2);
    // Two iron straps over the lid and down the front, with rivets.
    b.fill(box(28, 50, 7, 51) + box(69, 50, 7, 51), iron[0]);
    b.fill(poly(28, 50, 44, 42, 51, 42, 35, 50) + poly(69, 50, 85, 42, 92, 42, 76, 50), iron[2]);
    b.fill(box(33, 50, 2, 51) + box(74, 50, 2, 51), iron[1]);
    b.fill([54, 66, 80, 94].flatMap((y) => [O(31.5, y, 1.1), O(72.5, y, 1.1)]).join(''), iron[2]);
    // The hasp: a plain iron plate hanging from the lid over a staple.
    b.fill(box(48, 54, 9, 15, 1.5), iron[0]);
    b.fill(box(50.5, 66, 4, 6, 1.5), iron[1]);
  },

  key: (b) => {
    b.ground(36);
    b.group('rotate(-32 60 60)', () => {
      b.form(O(32, 60, 17) + O(32, 60, 7.5), GOLD, 20, 48, 0.9, ' fill-rule="evenodd"');
      b.fill(box(47, 54, 8, 12, 2), GOLD[1]);
      b.fill(box(54, 56, 50, 8, 3), GOLD[0]);
      b.fill(poly(84, 63, 84, 80, 90, 80, 90, 74, 96, 74, 96, 80, 102, 80, 102, 63), GOLD[1]);
      b.line('M58 58.5H98', GOLD[2], 1.6);
    });
  },

  letter: (b) => {
    b.ground(46, 60, 102);
    b.group('rotate(-6 60 64)', () => {
      b.form(box(16, 34, 88, 58, 4), PAPER, 18, 36, 0.97);
      b.fill(poly(18, 90, 60, 60, 102, 90), PAPER[2]);
      b.fill(poly(16, 36, 60, 70, 104, 36), '#efdfbf');
      b.fill(O(60, 69, 9.5), VALLEY.red);
      b.fill('M60 74C55 70 54 67 56 65C58 64 59 65 60 66C61 65 62 64 64 65C66 67 65 70 60 74Z', VALLEY.redDark);
    });
  },

  map: (b) => {
    b.ground(46);
    b.fill(poly(14, 32, 42, 24, 42, 96, 14, 104) + poly(42, 24, 78, 32, 78, 104, 42, 96) + poly(78, 32, 106, 24, 106, 96, 78, 104), PAPER[0]);
    b.fill(E(30, 82, 10, 7) + E(88, 46, 11, 7) + E(64, 92, 7, 5), GRASS[0]);
    b.line('M20 40C34 52 28 66 46 70C62 74 70 88 92 98', WATER[0], 3.6);
    b.fill(poly(50, 56, 57, 44, 64, 56) + poly(60, 56, 67, 46, 74, 56), CLAY[0]);
    b.dash('M24 96C38 92 50 84 58 76C66 68 78 66 86 60', VALLEY.red, 2.6, 4, 3);
    b.line('M84 50L92 58M92 50L84 58', VALLEY.red, 3);
    b.shade(poly(42, 24, 78, 32, 78, 104, 42, 96), 0.14);
  },

  door: (b) => {
    b.ground(44, 60, 104);
    b.form('M22 104V40C22 24 39 12 60 12C81 12 98 24 98 40V104Z', WALL, 30, 18, 0.96);
    b.fill('M32 104V43C32 30 45 21 60 21C75 21 88 30 88 43V104Z', BLUE[1]);
    b.fill('M34 104V44C34 32 46 24 60 24C74 24 85 32 85 44V104Z', BLUE[0]);
    b.fill(box(40, 46, 16, 22, 2) + box(64, 46, 16, 22, 2) + box(40, 74, 16, 24, 2) + box(64, 74, 16, 24, 2), BLUE[1]);
    b.line('M60 26V104', BLUE[1], 1.6);
    b.fill('M41 42C41 34 49 30 60 30C71 30 79 34 79 42Z', BLUE[2]);
    b.fill(O(67, 72, 2.8), GOLD[0]);
    b.fill(box(18, 100, 84, 6, 2), STONE[0]);
  },

  window: (b) => {
    b.ground(42, 60, 100);
    b.fill(poly(12, 20, 31, 26, 31, 86, 12, 92) + poly(89, 26, 108, 20, 108, 92, 89, 86), BLUE[0]);
    b.line('M15 34L28 37M15 46L28 48M15 58L28 59M15 70L28 70M15 82L28 81M92 37L105 34M92 48L105 46M92 59L105 58M92 70L105 70M92 81L105 82', BLUE[1], 2);
    b.fill(box(30, 24, 60, 64, 3), '#f6ecd6');
    b.fill(box(35, 29, 23, 25, 1.5) + box(62, 29, 23, 25, 1.5) + box(35, 58, 23, 25, 1.5) + box(62, 58, 23, 25, 1.5), SKY_PANE);
    b.fill(poly(36, 46, 48, 30, 54, 30, 36, 52) + poly(63, 46, 75, 30, 81, 30, 63, 52), '#e6f4fa');
    b.fill(box(24, 87, 72, 7, 2), STONE[0]);
    b.fill(box(24, 92, 72, 2), STONE[1]);
    b.fill('M50 87L52 76H68L70 87Z', CLAY[0]);
    b.fill(E(52, 74, 5, 3) + E(68, 73, 5, 3), LEAF[0]);
    b.fill(O(55, 69, 4.2) + O(63, 67, 4.2) + O(59, 62, 4), VALLEY.red);
  },

  table: (b) => {
    b.ground(50);
    b.line('M34 56V92M86 56V92', WOOD[1], 5);
    b.fill(poly(28, 41, 92, 41, 106, 54, 14, 54), WOOD[2]);
    b.fill(box(14, 54, 92, 7, 1), WOOD[0]);
    b.fill(box(19, 61, 82, 5), WOOD[1]);
    b.line('M20 60V104M100 60V104', WOOD[0], 6);
  },

  chair: (b) => {
    b.ground(36);
    b.line('M42 16V94M80 16V94', WOOD[1], 5);
    b.fill(box(42, 20, 38, 8, 2) + box(42, 34, 38, 6, 2), WOOD[0]);
    b.fill(poly(42, 60, 80, 60, 88, 72, 34, 72), STRAW[0]);
    b.line('M44 64H80M40 68H84', STRAW[1], 1.4);
    b.fill(box(34, 72, 54, 5, 1), WOOD[0]);
    b.line('M37 76V104M85 76V104', WOOD[0], 5.5);
    b.line('M37 92H85', WOOD[1], 3);
  },
  tenur: (b) => {
    b.ground(46);
    b.form('M20 104C20 70 36 34 50 30H70C84 34 100 70 100 104Z', CLAY, 34, 40, 0.92);
    b.fill(E(60, 30, 11, 3.4), '#7a4a2a');
    b.fill(oval(42, 52, 4, 12, 22), CLAY[2]);
    b.fill('M44 104V92C44 83 51 78 60 78C69 78 76 83 76 92V104Z', '#4a2a1e');
    b.glow('M48 104C46 96 50 92 53 87C55 91 57 91 58 85C62 89 64 93 63 97C66 95 68 93 68 89C72 95 73 100 71 104Z', VALLEY.fire);
    b.glow('M54 104C53 100 55 98 57 95C59 98 61 98 62 96C64 99 65 102 64 104Z', VALLEY.fireCore);
    b.fill(O(63, 21, 4.6) + O(57, 13, 3.6), VALLEY.smoke, ' fill-opacity="0.9"');
  },

  // The eye floats like the sky's things: a shadow under it would make it an object on a table.
  eye: (b) => {
    b.line('M28 30C44 20 76 20 92 30', '#6b4a32', 5);
    b.form('M14 64C28 46 44 40 60 40C76 40 92 46 106 64C92 82 76 88 60 88C44 88 28 82 14 64Z', WHITE, 30, 52, 0.95);
    b.form(O(60, 64, 20), ['#9a6a3e', '#6e4626', '#c39462'], 48, 52, 0.88);
    b.fill(O(60, 64, 9), INK);
    b.fill(O(53, 57, 4.2), '#ffffff');
    b.line('M14 64C28 46 44 40 60 40C76 40 92 46 106 64', INK, 3.5);
    b.line('M27 51L21 44M42 43L38 35M60 40V31M78 43L82 35M93 51L99 44', INK, 3);
  },

  leaf: (b) => {
    b.ground(32, 62);
    b.line('M30 98L18 108', LEAF[1], 4);
    b.fill('M30 98C22 66 42 30 98 16C80 40 62 70 30 98Z', LEAF[0]);
    b.fill('M30 98C62 70 80 40 98 16C104 56 80 92 30 98Z', LEAF[1]);
    b.line('M30 98C54 76 76 48 98 16', LEAF[2], 2);
    b.line('M42 86L36 70M52 74L48 56M64 60L62 42M76 46L76 32M50 82L66 82M60 70L78 68M72 56L88 52', LEAF[2], 1.6);
  },

  grapes: (b) => {
    const t: Tone = ['#7a55a0', '#553a78', '#a98bc8'];
    b.ground(28, 60);
    b.line('M60 32C60 24 62 20 67 15', BARK[0], 3.5);
    b.form('M64 30C62 22 66 14 74 12C76 6 86 6 88 12C96 12 100 20 96 26C94 32 86 34 80 32C74 36 66 34 64 30Z', LEAF, 70, 12, 0.88);
    b.line('M64 30L80 20M74 25L74 16M78 23L90 20', LEAF[2], 1.4);
    const rows: Pt[][] = [
      [[44, 40], [56, 38], [68, 38], [80, 42]],
      [[38, 52], [50, 50], [62, 50], [74, 52]],
      [[44, 63], [56, 62], [68, 63]],
      [[50, 74], [62, 74]],
      [[56, 86]],
    ];
    for (const row of rows) {
      b.fill(row.map(([x, y]) => O(x, y, 7.6)).join(''), t[1]);
      b.fill(row.map(([x, y]) => O(x - 1.3, y - 1.3, 6.2)).join(''), t[0]);
    }
    b.fill(rows.flat().map(([x, y]) => O(x - 3, y - 3, 1.5)).join(''), t[2]);
  },

  walnut: (b) => {
    const t: Tone = ['#bf9160', '#8f6438', '#dab385'];
    b.ground(42, 62);
    b.form('M46 30C50 30 54 33 56 36C66 40 74 50 74 64C74 82 62 94 46 94C30 94 18 82 18 64C18 50 26 40 36 36C38 33 42 30 46 30Z', t, 26, 40, 0.92);
    b.line('M46 32C40 48 52 66 46 92', t[1], 2.4);
    b.line('M27 56C31 52 33 60 37 56M28 72C32 70 34 76 38 72M54 50C58 46 60 54 64 50M54 70C58 68 60 74 64 70', t[1], 1.8);
    b.fill(E(84, 86, 25, 15), t[1]);
    b.fill(E(84, 84, 21, 11.5), '#ecd09a');
    b.line('M84 74V94M66 82C72 76 76 90 84 82C90 76 96 90 102 82', '#c9a368', 2);
  },

  cloud: (b) => {
    cloud(b, 60, 62, 1.25, ['#eaf2f9', '#bccfe2', '#ffffff']);
  },

  glasses: (b) => {
    const frame = '#b0392e';
    b.ground(42);
    b.line('M20 56L8 44M100 56L112 44', frame, 4);
    b.fill(O(38, 66, 19) + O(82, 66, 19), '#dcedf5', ' fill-opacity="0.85"');
    b.line('M27 60C29 54 33 51 38 50M71 60C73 54 77 51 82 50', '#ffffff', 3);
    b.line(O(38, 66, 19) + O(82, 66, 19), frame, 5);
    b.line('M56 60C58 55 62 55 64 60', frame, 4);
  },

  stone: (b) => {
    b.ground(48);
    b.form('M16 98C12 84 18 66 32 56C44 46 64 42 80 48C94 54 104 70 102 86C100 96 92 102 80 102H28C22 102 18 101 16 98Z', STONE, 30, 52, 0.92);
    b.fill('M32 56C44 46 64 42 80 48C86 52 84 58 76 60C62 64 44 64 32 56Z', STONE[2]);
    b.line('M66 66L72 76L68 86', STONE[1], 2);
    b.form(oval(98, 99, 10, 6, 0), STONE, 90, 95, 0.85);
    b.line('M14 102L10 92M18 102V90M22 102L26 93', LEAF[0], 2.4);
  },

  // A spring is water running from a cleft in the rocks into its pool.
  spring: (b) => {
    const wall: Tone = ['#ddd3bf', '#b9ab90', '#efe8da'];
    b.ground(52);
    // The village spring: a stone front with an arched niche, water falling from its spout into the trough.
    b.form('M12 84V34C12 28 16 24 22 24H98C104 24 108 28 108 34V84Z', wall, 14, 26, 0.97);
    b.line('M12 40H34M86 40H108M12 58H34M86 58H108M22 24V40M98 24V40M24 58V84M96 58V84', wall[1], 1.4);
    b.fill('M36 84V48C36 34 46 26 60 26C74 26 84 34 84 48V84Z', wall[1]);
    b.fill('M41 84V49C41 38 49 32 60 32C71 32 79 38 79 49V84Z', '#8f8270');
    b.form(box(54, 44, 12, 9, 2), STONE, 55, 45, 0.85);
    b.fill('M56 52H64L65 81H55Z', WATER[0]);
    b.line('M58.5 54V79', WATER[2], 1.6);
    b.form(box(18, 80, 84, 22, 3), STONE, 20, 81, 0.95);
    b.fill(box(16, 76, 88, 7, 3), STONE[2]);
    b.fill(box(21, 77, 78, 4, 2), WATER[0]);
    b.line(E(60, 79, 9, 1.6), WATER[2], 1.2);
    b.line('M10 104L6 94M14 104V92M106 104l3 -9M110 104v-10', LEAF[0], 2.4);
  },

  river: (b) => {
    b.ground(54, 62, 100);
    b.fill(E(60, 76, 52, 28), GRASS[1]);
    b.fill(E(60, 72, 52, 25), GRASS[0]);
    b.fill('M68 47C58 56 82 64 64 76C52 84 34 86 30 96C38 97 48 97 58 96C60 92 76 86 84 78C102 64 80 56 84 47C78 46 72 46 68 47Z', WATER[0]);
    b.line('M60 82C64 80 68 78 70 76M74 60C76 58 78 56 78 54M44 90C48 89 52 88 54 86', WATER[2], 2);
    poplar(b, 32, 72, 0.9);
    poplar(b, 98, 76, 0.8);
    b.fill(E(26, 86, 4, 2.4) + E(96, 86, 3.6, 2.2), STONE[0]);
  },

  mountain: (b) => {
    const rock: Tone = ['#9aa7c0', '#6f7d99', '#bfc9da'];
    b.ground(52, 60, 102);
    b.fill(poly(6, 100, 58, 18, 62, 40, 56, 60, 68, 100), rock[0]);
    b.fill(poly(58, 18, 112, 100, 68, 100, 56, 60, 62, 40), rock[1]);
    b.fill(poly(45, 39, 58, 18, 62, 40, 56, 46, 51, 40), VALLEY.snow);
    b.fill(poly(58, 18, 73, 41, 67, 45, 62, 40), VALLEY.snowShade);
    b.fill('M4 101C12 82 28 72 44 74C58 76 68 88 74 101Z', LEAF[0]);
    b.fill('M44 74C58 76 68 88 74 101H58C56 90 52 80 44 74Z', LEAF[1]);
  },

  ball: (b) => {
    b.ground(34, 62);
    b.group(grow(1.1, 60, 102), () => {
      b.fill(O(60, 64, 38), '#f7c63c');
      b.fill('M60 26C34 38 34 90 60 102C46 88 46 40 60 26Z', VALLEY.red);
      b.fill('M60 26C74 40 74 88 60 102C86 90 86 38 60 26Z', BLUE[0]);
      b.fill(O(60, 64, 6), '#fffaf0');
      b.shade(lune(60, 64, 38, 52, 56, 37));
      b.fill(oval(40, 46, 8, 4.5, -45), '#ffffff', ' fill-opacity="0.7"');
    });
  },

  school: (b) => {
    const wall: Tone = ['#f2d48a', '#d4ad5c', '#f8e6b6'];
    b.ground(52, 62);
    b.fill(poly(104, 102, 104, 56, 114, 52, 114, 96), wall[1]);
    b.fill(box(10, 56, 94, 46), wall[0]);
    b.fill(poly(6, 58, 16, 44, 104, 44, 114, 52, 104, 58), ROOF[0]);
    b.fill(box(6, 56, 98, 4), ROOF[1]);
    b.fill(poly(46, 46, 46, 26, 60, 14, 74, 26, 74, 46), wall[0]);
    b.fill(poly(42, 28, 60, 10, 78, 28, 74, 30, 60, 17, 46, 30), ROOF[1]);
    b.fill('M53 44V32A7 7 0 0 1 67 32V44Z', '#7a4a2a');
    b.form('M55 41C55 36 57 33 60 33C63 33 65 36 65 41Z', GOLD, 56, 34, 0.8);
    b.fill(box(16, 66, 12, 14, 1) + box(34, 66, 12, 14, 1) + box(74, 66, 12, 14, 1) + box(92, 66, 6, 14, 1), SKY_PANE);
    b.fill(box(16, 66, 12, 3) + box(34, 66, 12, 3) + box(74, 66, 12, 3) + box(92, 66, 6, 3), BLUE[0]);
    b.fill('M51 102V78A9 9 0 0 1 69 78V102Z', BLUE[0]);
    b.line('M60 70V102', BLUE[1], 1.6);
  },

  mill: (b) => {
    b.ground(50, 60, 103);
    b.fill(poly(58, 102, 58, 52, 70, 46, 70, 96), STONE[1]);
    b.fill(box(12, 52, 46, 50), STONE[0]);
    b.fill(poly(10, 52, 20, 44, 72, 44, 60, 52), STONE[2]);
    b.fill('M24 102V86C24 81 28 78 32 78C36 78 40 81 40 86V102Z', '#5a3a2a');
    b.lit(box(42, 62, 8, 9, 1), VALLEY.window, LAMP);
    b.fill(E(84, 100, 28, 6), WATER[0]);
    b.line(O(84, 72, 24), WOOD[1], 5);
    b.line('M84 48V96M60 72H108M67 55L101 89M101 55L67 89', WOOD[0], 3);
    let blades = '';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      blades += oval(84 + Math.cos(a) * 26, 72 + Math.sin(a) * 26, 5, 2.6, (a * 180) / Math.PI);
    }
    b.fill(blades, WOOD[0]);
    b.fill(O(84, 72, 4.5), WOOD[1]);
    b.fill('M112 32L92 40V44L112 37Z', WOOD[1]);
    b.fill('M92 42C88 44 88 50 90 56H95C94 50 95 46 98 43Z', WATER[0]);
  },

  watermelon: (b) => {
    const rind: Tone = ['#4f9a48', '#357235', '#7fbf6a'];
    b.ground(46, 62);
    b.form(E(78, 60, 30, 24), rind, 56, 42, 0.92);
    b.line('M56 50C62 44 70 40 78 38M54 62C62 54 74 48 92 44M58 74C66 66 80 60 100 58', rind[1], 3.4);
    b.fill('M48 30L86 94C76 102 62 106 48 106C34 106 20 102 10 94Z', rind[1]);
    b.fill('M48 33L82 91C73 98 61 101 48 101C35 101 23 98 14 91Z', '#eef3d2');
    b.fill('M48 36L78 88C70 94 60 96 48 96C36 96 26 94 18 88Z', '#e8533f');
    b.fill(oval(40, 70, 1.8, 3.2, 20) + oval(56, 70, 1.8, 3.2, -20) + oval(34, 82, 1.8, 3.2, 20) + oval(48, 84, 1.8, 3.2, 0) + oval(62, 82, 1.8, 3.2, -20) + oval(48, 58, 1.8, 3.2, 0), INK);
  },

  tomato: (b) => {
    const t: Tone = ['#e8452f', '#b52f22', '#f48a6e'];
    b.ground(36);
    b.form('M60 42C82 36 102 48 102 70C102 90 84 102 60 102C36 102 18 90 18 70C18 48 38 36 60 42Z', t, 30, 50, 0.9);
    b.line('M48 46C44 60 44 80 48 96M72 46C76 60 76 80 72 96', t[1], 1.6, ' stroke-opacity="0.5"');
    b.fill(poly(60, 36, 64, 42, 76, 40, 68, 47, 72, 54, 62, 49, 52, 56, 54, 47, 44, 42, 56, 42), LEAF[0]);
    b.line('M60 42C60 36 62 32 66 30', LEAF[1], 3.4);
    b.fill(oval(36, 58, 4.5, 8, 30), t[2]);
  },

  potato: (b) => {
    const t: Tone = ['#cc9a62', '#9c6c38', '#e3bb84'];
    b.ground(46);
    b.form('M16 70C14 56 26 46 42 48C52 49 58 44 70 44C86 44 96 56 94 70C92 84 80 92 64 92C54 92 48 96 36 94C24 92 18 82 16 70Z', t, 26, 52, 0.92);
    b.form('M74 84C80 76 96 76 104 82C110 88 106 100 94 102C82 104 70 96 74 84Z', t, 78, 80, 0.88);
    b.line('M32 62q3 -2 5 0M52 56q3 -2 5 0M70 60q3 -2 5 0M44 76q3 -2 5 0M60 72q3 -2 5 0M86 88q3 -2 5 0', t[1], 1.8);
    b.fill(oval(36, 56, 8, 3, -15), t[2]);
  },

  onion: (b) => {
    const t: Tone = ['#dc9a4c', '#ad6a26', '#f0c27e'];
    b.ground(34);
    b.line('M60 26C60 20 62 14 64 10', '#b98b4c', 3);
    b.line('M56 102L52 108M60 102V109M64 102L68 108', '#e9d7b3', 2);
    b.form('M60 24C62 36 68 42 80 50C94 58 100 72 96 86C92 98 78 104 60 104C42 104 28 98 24 86C20 72 26 58 40 50C52 42 58 36 60 24Z', t, 34, 54, 0.9);
    b.line('M60 28C50 44 40 60 40 76C40 88 48 98 56 102M60 28C70 44 80 60 80 76C80 88 72 98 64 102', t[1], 1.6);
    b.fill(oval(36, 70, 4, 10, 15), t[2]);
  },

  pomegranate: (b) => {
    const t: Tone = ['#b3313f', '#861f2c', '#d9606a'];
    b.ground(46, 62);
    b.fill(poly(42, 26, 44, 16, 48, 22, 52, 14, 56, 22, 60, 16, 62, 28), t[1]);
    b.form(O(50, 58, 32), t, 30, 38, 0.9);
    b.fill(oval(34, 46, 5, 9, 30), t[2]);
    b.fill(E(84, 88, 26, 16), t[1]);
    b.fill(E(84, 86, 22, 12.5), '#f6d8c4');
    let seeds = '';
    for (const [x, y] of [[72, 82], [80, 80], [88, 80], [96, 82], [68, 89], [76, 88], [84, 87], [92, 88], [100, 89], [76, 95], [84, 95], [92, 95]] as const) seeds += O(x, y, 3.2);
    b.fill(seeds, '#c42a48');
  },

  cucumber: (b) => {
    const t: Tone = ['#4f8a3a', '#3a6b2a', '#7fb35a'];
    b.ground(46);
    b.group('rotate(-32 58 60)', () => {
      b.form('M12 60C12 50 20 46 30 46H86C98 46 106 52 106 60C106 68 98 74 86 74H30C20 74 12 70 12 60Z', t, 16, 48, 0.94);
      b.fill(O(24, 54, 1.6) + O(40, 52, 1.6) + O(56, 53, 1.6) + O(72, 52, 1.6) + O(88, 54, 1.6) + O(32, 60, 1.6) + O(64, 60, 1.6) + O(96, 60, 1.6), t[2]);
      b.fill(box(104, 57, 6, 6, 2), '#b9a35a');
    });
    b.fill(oval(90, 94, 16, 9, -8), t[1]);
    b.fill(oval(90, 93, 13.5, 7.2, -8), '#d8ecb0');
    b.fill(oval(86, 92, 1.6, 1, -8) + oval(94, 91, 1.6, 1, -8) + oval(90, 96, 1.6, 1, -8) + oval(86, 96, 1.4, 0.9, -8) + oval(94, 95, 1.4, 0.9, -8), '#a6c97a');
  },
  honey: (b) => {
    b.ground(38);
    b.group(grow(1.05), () => {
      b.fill(box(30, 40, 60, 64, 10), GLASS[1]);
      b.form(box(33, 50, 54, 51, 8), GOLD, 36, 52, 0.94);
      b.fill(box(36, 32, 48, 10, 2), GLASS[1]);
      b.fill('M28 36C28 26 40 22 60 22C80 22 92 26 92 36L95 46L85 41L75 46L66 41L56 46L46 41L36 46L25 41Z', VALLEY.red);
      b.line('M32 42C44 46 76 46 88 42', '#8a5a36', 2.4);
      b.fill('M40 46V58C40 61 45 61 45 58V48Z', GOLD[0]);
      b.fill(box(42, 64, 36, 24, 4), CREAM);
      const hex = (cx: number, cy: number): string => poly(cx - 4, cy, cx - 2, cy - 3.5, cx + 2, cy - 3.5, cx + 4, cy, cx + 2, cy + 3.5, cx - 2, cy + 3.5);
      b.fill(hex(54, 72) + hex(66, 72) + hex(60, 79.5), GOLD[1]);
      b.fill(box(35, 52, 5, 34, 2.5), GOLD[2]);
    });
  },

  milk: (b) => {
    b.ground(42, 64);
    b.form('M46 16H66V26C66 32 80 38 80 52V96C80 101 76 104 71 104H41C36 104 32 101 32 96V52C32 38 46 32 46 26Z', GLASS, 36, 30, 0.96);
    b.form('M35 50C35 44 38 40 44 38H68C74 40 77 44 77 50V95C77 99 74 101 70 101H42C38 101 35 99 35 95Z', WHITE, 38, 42, 0.94);
    b.fill(box(44, 10, 24, 9, 3), BLUE[0]);
    b.fill(box(35, 62, 42, 16), BLUE[0]);
    b.fill('M56 64C58 68 61 71 61 73C61 76 59 77 56 77C53 77 51 76 51 73C51 71 54 68 56 64Z', '#ffffff');
    b.fill(box(38, 46, 4, 50, 2), '#ffffff');
    b.form('M84 74H106L103 102C103 104 101 105 99 105H91C89 105 87 104 87 102Z', GLASS, 85, 76, 0.94);
    b.fill('M86 80H104L102 101C102 102 101 103 99 103H91C89 103 88 102 88 101Z', WHITE[0]);
  },

  olive: (b) => {
    const olive: Tone = ['#4f3d5c', '#35283f', '#806b91'];
    const leaf: Tone = ['#7f9f58', '#5d7d3e', '#b2c98c'];
    b.ground(38);
    b.line('M16 92C36 76 58 60 104 30', BARK[0], 3.5);
    b.form(oval(36, 62, 16, 4.6, -60), leaf, 30, 52, 0.86);
    b.form(oval(80, 30, 17, 4.6, -20), leaf, 66, 28, 0.86);
    b.form(oval(90, 56, 16, 4.6, 30), leaf, 78, 50, 0.86);
    b.form(oval(58, 40, 15, 4.4, -75), leaf, 54, 28, 0.86);
    b.form(oval(40, 88, 9, 12, -20), olive, 34, 80, 0.86);
    b.form(oval(62, 76, 9, 12, -15), olive, 56, 68, 0.86);
    b.form(oval(80, 62, 8.5, 11, -10), ['#9db24c', '#76893a', '#c9d98a'], 74, 54, 0.86);
    b.fill(oval(37, 84, 2, 3.6, -20) + oval(59, 72, 2, 3.6, -15), olive[2]);
  },

  fish: (b) => {
    const t: Tone = ['#4aa3c8', '#2f7fa6', '#9ad6ee'];
    b.ground(40, 62);
    b.fill(shape([[50, 40], [58, 30], [70, 28], [78, 40]]) + shape([[56, 79], [62, 89], [70, 90], [74, 80]]), t[1]);
    b.fill(shape([[90, 58], [106, 40], [111, 46], [110, 60], [111, 74], [106, 80], [90, 62]]), t[1]);
    underside(b, [[12, 60], [20, 48], [34, 40], [52, 37], [70, 39], [86, 47], [94, 60], [86, 73], [70, 81], [52, 83], [34, 80], [20, 72]], t, 0.9);
    b.line('M38 46C42 54 42 66 38 74', t[1], 2);
    b.fill(shape([[44, 64], [54, 62], [58, 68], [52, 72], [45, 69]]), t[1]);
    b.fill(O(27, 56, 4.2), '#ffffff');
    b.fill(O(26.4, 56, 2.3), INK);
  },

  glass: (b) => {
    b.ground(30);
    b.group(grow(1.05), () => {
      b.fill('M34 26H86L79 98C79 101 76 104 72 104H48C44 104 41 101 41 98Z', GLASS[0]);
      b.fill('M38 56H82L77 97C77 99 75 101 72 101H48C45 101 43 99 43 97Z', '#a9d8ee');
      b.fill('M70 56H82L77 97C77 99 75 101 72 101H68C72 90 72 70 70 56Z', '#8cc6e2');
      b.fill(E(60, 56, 22, 3.8), '#d3edf8');
      b.line(E(60, 26, 26, 4), GLASS[1], 2.4);
      b.fill('M41 32H47L50 94H45Z', '#ffffff', ' fill-opacity="0.85"');
      b.fill(box(42, 96, 36, 6, 3), GLASS[1]);
    });
  },

  cup: (b) => {
    const t: Tone = ['#4a8dcc', '#2f6aa3', '#8bbde8'];
    b.ground(46, 60);
    b.group(grow(1.25, 58, 102), () => {
      b.line('M82 58C98 56 100 80 82 82', t[1], 7);
      b.form('M28 48H86V74C86 90 74 102 57 102C40 102 28 90 28 74Z', t, 30, 50, 0.93);
      b.fill(box(28, 60, 58, 10), '#f6eedd');
      b.fill(diamond(36, 65, 3.4, 3.4) + diamond(48, 65, 3.4, 3.4) + diamond(60, 65, 3.4, 3.4) + diamond(72, 65, 3.4, 3.4) + diamond(84, 65, 2, 3.4), VALLEY.red);
      b.fill(E(57, 48, 29, 6.5), t[2]);
      b.fill(E(57, 48, 25, 4.6), '#6b3f24');
    });
  },

  spoon: (b) => {
    b.ground(30);
    b.group('rotate(35 60 58)', () => {
      b.form('M60 8C71 8 77 19 77 31C77 43 70 50 64 53L63.5 84C67 90 67 100 60 104C53 100 53 90 56.5 84L56 53C50 50 43 43 43 31C43 19 49 8 60 8Z', STEEL, 46, 12, 0.92);
      b.fill(oval(60, 30, 11, 17, 0), STEEL[1]);
      b.fill(oval(55, 24, 3, 8, 10), STEEL[2]);
    });
  },

  // The double teapot of a Kurdish house: the brew in the small pot, kept hot over the big kettle's steam.
  teapot: (b) => {
    b.ground(44);
    b.line('M30 82C18 80 14 72 10 64', COPPER[1], 6);
    b.line('M88 72C102 72 104 92 90 94', COPPER[1], 5);
    b.form('M24 100C18 88 22 70 36 64H84C98 70 102 88 96 100Z', COPPER, 30, 66, 0.94);
    b.fill(box(34, 60, 52, 6, 3), COPPER[1]);
    b.fill('M44 54C36 52 30 46 27 36L31 35C34 42 40 46 46 47Z', '#d6cdbd');
    b.line('M76 42C88 41 90 56 78 58', '#d6cdbd', 4.4);
    b.form('M42 60C38 48 46 38 60 38C74 38 82 48 78 60Z', ['#f4efe6', '#d6cdbd', '#ffffff'], 46, 40, 0.92);
    b.fill(O(54, 50, 2.6) + O(66, 50, 2.6) + O(60, 46, 2.6), VALLEY.red);
    b.fill(E(60, 38, 10, 3), '#d6cdbd');
    b.fill(O(60, 33, 3.6), VALLEY.red);
    b.fill(oval(40, 78, 4, 9, 20), COPPER[2]);
    b.line('M24 30C20 24 28 20 24 14', '#d8d2c8', 3);
  },

  sun: (b) => {
    let rays = '';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      const [px, py] = [-s, c];
      const r1 = 33;
      const r2 = i % 2 ? 44 : 50;
      rays += poly(60 + c * r1 + px * 6, 60 + s * r1 + py * 6, 60 + c * r2, 60 + s * r2, 60 + c * r1 - px * 6, 60 + s * r1 - py * 6);
    }
    b.round(rays, '#f2a33a', 3);
    b.form(O(60, 60, 31), SUN, 42, 42, 0.9);
    b.fill(oval(48, 46, 9, 5, -40), SUN[2]);
  },

  // A crescent with craters and the rest of the moon faintly behind it, so it reads as the moon, never a slice of fruit.
  moon: (b) => {
    const t: Tone = ['#f5df8f', '#ddb95a', '#fbefc4'];
    b.fill(O(56, 60, 40), '#ebe5d4');
    b.fill(lune(56, 60, 40, 76, 46, 34), t[0]);
    b.fill(O(32, 66, 5) + O(46, 88, 3.6) + O(28, 48, 2.6), t[1]);
  },

  star: (b) => {
    const t: Tone = ['#f7c63c', '#e29a24', '#fde49a'];
    const pts = starPoints(60, 62, 48, 0.46);
    b.fill(poly(...pts.flat()), t[0]);
    let shade = '';
    for (let i = 0; i < 10; i += 2) {
      const tip = pts[i]!;
      const inner = pts[(i + 1) % 10]!;
      shade += poly(60, 62, tip[0], tip[1], inner[0], inner[1]);
    }
    b.fill(shade, t[1]);
  },

  snow: (b) => {
    const t: Tone = ['#8cc2e4', '#5b97c4', '#d7ecf8'];
    let arms = '';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      const at = (r: number, side: number, out: number): string => `${f(60 + c * r + -s * side * out)} ${f(60 + s * r + c * side * out)}`;
      arms += `M60 60L${at(44, 0, 0)}`;
      arms += `M${at(22, -1, 10)}L${at(30, 0, 0)}L${at(22, 1, 10)}`;
      arms += `M${at(34, -1, 7)}L${at(40, 0, 0)}L${at(34, 1, 7)}`;
    }
    b.line(arms, t[1], 6.4, ' transform="translate(1.6 1.6)"');
    b.line(arms, t[0], 5.4);
    b.fill(O(60, 60, 7), t[2]);
  },

  rain: (b) => {
    cloud(b, 60, 36, 1.05, ['#c7d3e1', '#9aabc0', '#e9eff6']);
    const drop = (x: number, y: number): string => `M${f(x)} ${f(y)}C${f(x + 2)} ${f(y + 5)} ${f(x + 5)} ${f(y + 8)} ${f(x + 5)} ${f(y + 11)}C${f(x + 5)} ${f(y + 14)} ${f(x + 2.6)} ${f(y + 16)} ${f(x)} ${f(y + 16)}C${f(x - 2.6)} ${f(y + 16)} ${f(x - 5)} ${f(y + 14)} ${f(x - 5)} ${f(y + 11)}C${f(x - 5)} ${f(y + 8)} ${f(x - 2)} ${f(y + 5)} ${f(x)} ${f(y)}Z`;
    b.fill(drop(36, 66) + drop(60, 70) + drop(84, 66) + drop(48, 88) + drop(72, 90), WATER[0]);
  },

  fire: (b) => {
    b.ground(44);
    b.glow('M60 12C70 28 88 42 86 66C85 84 74 94 60 94C46 94 35 84 34 66C33 50 44 42 48 30C52 40 56 40 56 30C56 22 58 18 60 12Z', '#e8553a');
    b.glow('M60 34C68 46 78 56 76 72C75 84 68 90 60 90C52 90 45 84 44 72C44 62 50 56 54 48C56 54 58 54 59 48C60 42 60 38 60 34Z', VALLEY.fire);
    b.glow('M60 58C65 66 69 72 68 80C67 86 64 89 60 89C56 89 53 86 52 80C52 74 56 70 58 64C59 68 60 66 60 58Z', VALLEY.fireCore);
    b.line('M24 100L92 84', WOOD[1], 10);
    b.line('M28 84L96 100', WOOD[0], 10);
    b.fill(O(96, 100, 5) + O(24, 100, 5), WOOD[2]);
    b.fill(E(16, 102, 7, 4.5) + E(104, 102, 7, 4.5), STONE[0]);
  },

  bird: (b) => {
    const t: Tone = ['#a8703f', '#7c4f2a', '#cf9a64'];
    b.ground(34, 60);
    b.line('M12 92C40 88 70 84 108 74', BARK[0], 4.5);
    b.form(oval(98, 70, 9, 4, -30), LEAF, 92, 66, 0.86);
    b.line('M54 79L52 88M64 79L66 87', '#c08a5a', 2.4);
    b.fill(shape([[72, 52], [88, 47], [104, 44], [102, 52], [92, 57], [80, 62]]), t[1]);
    underside(b, [[28, 50], [30, 40], [38, 32], [50, 30], [62, 33], [72, 42], [80, 52], [78, 66], [68, 77], [56, 80], [42, 78], [32, 68]], t, 0.92);
    b.fill(shape([[30, 56], [36, 68], [46, 76], [58, 79], [70, 74], [73, 68], [62, 72], [48, 70], [38, 62]]), '#efdcc0');
    b.fill(shape([[50, 46], [62, 44], [74, 47], [80, 54], [74, 63], [62, 66], [56, 62], [56, 54]]), t[1]);
    b.line('M60 56L72 54', '#efdcc0', 1.8);
    b.fill(shape([[30, 41], [36, 33], [46, 30], [44, 35], [38, 40]]), '#8a8a92');
    b.fill(poly(29, 44, 19, 47, 29, 50), INK);
    eye(b, 36, 43, 2.1);
  },

  rose: (b) => {
    const t: Tone = ['#d23a4a', '#a32535', '#ec6f7c'];
    b.ground(26);
    b.group(grow(1.05), () => {
      b.line('M60 104C60 92 58 80 60 62', LEAF[1], 4.5);
      b.fill(poly(58, 92, 53, 90, 58, 87) + poly(61, 78, 66, 76, 61, 73), LEAF[1]);
      b.form('M59 92C48 78 32 80 26 86C34 96 48 98 59 92Z', LEAF, 30, 84, 0.86);
      b.form('M61 80C70 68 86 68 92 74C86 84 72 86 61 80Z', LEAF, 66, 74, 0.86);
      b.fill('M34 36C34 26 46 20 60 22C74 20 86 26 86 36C86 54 76 66 60 66C44 66 34 54 34 36Z', t[1]);
      b.fill('M36 34C40 26 50 24 60 26C70 24 80 26 84 34C80 42 70 44 60 42C50 44 40 42 36 34Z', t[0]);
      b.fill('M34 40C38 56 48 64 60 64C72 64 82 56 86 40C80 50 70 54 60 54C50 54 40 50 34 40Z', t[0]);
      b.line('M50 34C52 28 66 28 68 34C70 40 58 42 56 36C55 33 59 31 62 33', t[1], 2.6);
      b.fill(oval(42, 46, 3.4, 7, 25), t[2]);
    });
  },

  clock: (b) => {
    const red: Tone = [VALLEY.red, VALLEY.redDark, '#dc6b5c'];
    b.ground(34, 60, 104);
    b.line('M42 92L34 104M78 92L86 104', red[1], 5);
    b.form(oval(30, 26, 13, 9, -40), GOLD, 22, 20, 0.85);
    b.form(oval(90, 26, 13, 9, 40), GOLD, 82, 18, 0.85);
    b.line('M60 22V28', GOLD[1], 4);
    b.form(O(60, 64, 37), red, 36, 40, 0.92);
    b.fill(O(60, 64, 29), '#fbf5e8');
    let ticks = '';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const len = i % 3 ? 3 : 5.5;
      ticks += `M${f(60 + Math.sin(a) * 25)} ${f(64 - Math.cos(a) * 25)}L${f(60 + Math.sin(a) * (25 - len))} ${f(64 - Math.cos(a) * (25 - len))}`;
    }
    b.line(ticks, INK, 2.2);
    b.line('M60 64V46M60 64L73 71', INK, 3.6);
    b.fill(O(60, 64, 3.4), red[0]);
  },

  bus: (b) => {
    const t: Tone = ['#f2b632', '#c98f1f', '#f8d57a'];
    b.ground(54, 60, 99);
    b.form(box(6, 34, 108, 60, 10), t, 8, 36, 0.97);
    b.fill(box(6, 74, 108, 6), VALLEY.red);
    b.fill(box(26, 42, 14, 18, 2) + box(44, 42, 14, 18, 2) + box(62, 42, 14, 18, 2) + box(80, 42, 14, 18, 2), SKY_PANE);
    b.fill('M98 42H106C108 42 110 44 110 46V60H98Z', SKY_PANE);
    b.fill(box(10, 42, 12, 42, 2), '#8fbcd4');
    b.line('M16 44V82', t[1], 1.6);
    b.fill(O(32, 94, 10) + O(90, 94, 10), '#3d3a46');
    b.fill(O(32, 94, 4) + O(90, 94, 4), STEEL[0]);
    b.fill(oval(110, 70, 2.6, 4, 0), '#fff3c4');
    b.fill(box(20, 36, 82, 3, 1.5), t[2]);
  },
  tractor: (b) => {
    const t: Tone = ['#4f9a48', '#357235', '#7fbf6a'];
    b.ground(50);
    b.line('M38 60V36', '#4a4752', 4);
    b.fill(box(35, 32, 6, 4, 1), '#4a4752');
    b.line('M64 58V30M96 58V30', t[1], 4);
    b.fill(box(66, 32, 28, 26), SKY_PANE);
    b.fill(box(58, 24, 42, 7, 2), t[1]);
    b.form('M14 82V66C14 62 17 60 21 60H70V82Z', t, 16, 61, 0.95);
    b.line('M17 64V78', t[1], 2);
    b.fill(O(84, 80, 23) + O(30, 91, 13), '#3d3a46');
    b.fill(O(84, 80, 11) + O(30, 91, 6), '#f2b632');
    b.fill(O(84, 80, 4) + O(30, 91, 2.2), '#3d3a46');
    b.fill('M58 74C60 58 72 50 86 50C100 50 110 60 112 74H104C102 64 94 58 86 58C76 58 68 64 66 74Z', t[0]);
    b.fill(oval(15, 70, 2, 3, 0), GOLD[2]);
  },

  train: (b) => {
    b.ground(54, 60, 103);
    b.line('M4 104H116', STEEL[1], 3);
    b.fill(O(28, 14, 5) + O(20, 8, 4) + O(36, 10, 3.6), VALLEY.smoke, ' fill-opacity="0.9"');
    b.fill(box(22, 22, 16, 6, 2) + box(25, 26, 10, 22), '#3d3a46');
    b.form('M16 52C16 48 19 46 23 46H76V82H23C19 82 16 79 16 76Z', BLUE, 18, 48, 0.95);
    b.fill('M48 46C48 38 60 38 60 46Z', GOLD[0]);
    b.line('M34 47V81M62 47V81', GOLD[0], 2.4);
    b.form(box(74, 30, 32, 52, 3), RED, 76, 32, 0.95);
    b.fill(box(80, 38, 20, 16, 2), SKY_PANE);
    b.fill(box(70, 25, 40, 7, 2) + box(12, 82, 96, 6, 2), '#3d3a46');
    b.fill(poly(4, 94, 12, 82, 16, 82, 16, 94), VALLEY.red);
    b.fill(O(88, 94, 11) + O(56, 95, 9) + O(32, 95, 9), '#3d3a46');
    b.fill(O(88, 94, 4.4) + O(56, 95, 3.6) + O(32, 95, 3.6), STEEL[0]);
    b.line('M32 95H88', STEEL[0], 2.4);
    b.fill(O(14, 62, 3.6), GOLD[2]);
  },

  plane: (b) => {
    b.group('rotate(-14 60 60)', () => {
      b.fill(poly(54, 56, 66, 56, 58, 30, 50, 30), STEEL[1]);
      b.fill(poly(18, 58, 10, 30, 20, 30, 34, 54), VALLEY.red);
      b.form('M12 60C12 54 18 51 28 51H92C104 51 114 56 114 61C114 66 104 70 92 70H28C18 70 12 66 12 60Z', WHITE, 16, 52, 0.96);
      b.fill('M100 54C106 55 110 57 112 60H100Z', BLUE[1]);
      b.fill(O(38, 59, 2.6) + O(48, 59, 2.6) + O(58, 59, 2.6) + O(68, 59, 2.6) + O(78, 59, 2.6) + O(88, 59, 2.6), SKY_PANE);
      b.line('M16 65H108', BLUE[0], 2.6);
      b.fill(poly(48, 64, 70, 64, 54, 96, 42, 96), STEEL[0]);
      b.fill(box(52, 74, 14, 7, 3.5), STEEL[1]);
      b.fill(poly(12, 62, 4, 72, 14, 72, 22, 64), STEEL[0]);
    });
  },

  taxi: (b) => {
    const t: Tone = ['#f5c330', '#c99a1c', '#fbe08a'];
    b.ground(50, 60, 101);
    b.form(box(52, 36, 18, 8, 2), ['#fbf3dc', '#d8c9a6', '#ffffff'], 53, 37, 0.9);
    b.form('M12 82C12 74 17 70 25 69L38 51C40 47 44 45 49 45H75C80 45 84 47 87 51L98 67C106 69 110 74 110 81V87C110 90 108 92 105 92H15C13 92 12 90 12 88Z', t, 24, 52, 0.94);
    b.fill('M41 54C42 51 44 50 47 50H58V67H33Z' + 'M62 50H74C77 50 79 51 81 54L90 67H62Z', SKY_PANE);
    b.dash('M14 75H108', INK, 3.4, 3.4, 3.4);
    b.dash('M14 78.4H108', INK, 3.4, 3.4, 3.4, 3.4);
    b.line('M60 50V73M60 81V88', t[1], 1.8);
    b.fill(O(34, 92, 12) + O(88, 92, 12), '#3d3a46');
    b.fill(O(34, 92, 5) + O(88, 92, 5), STEEL[0]);
    b.fill(oval(106, 70, 3, 3.6, 0), '#fff3c4');
  },

  bicycle: (b) => {
    b.ground(48);
    b.line('M32 64V100M14 82H50M19 69L45 95M45 69L19 95M90 64V100M72 82H108M77 69L103 95M103 69L77 95', '#c9ced6', 1.2);
    b.line(O(32, 82, 18) + O(90, 82, 18), '#3d3a46', 4.4);
    b.line('M32 82L52 82L76 56L48 56L32 82M48 56L52 82M76 56L90 82', VALLEY.red, 4.4);
    b.line('M48 56L45 46M76 56L72 38', '#3d3a46', 3.6);
    b.fill(oval(44, 45, 8, 3, -6), '#3d3a46');
    b.line('M66 38H78', '#3d3a46', 4);
    b.fill(O(52, 82, 4.2), GOLD[0]);
    b.line('M48 88L56 76', '#3d3a46', 2.4);
  },

  ticket: (b) => {
    b.ground(44, 60, 100);
    b.group('rotate(-10 60 60)', () => {
      const shape = 'M14 36H106V52A8 8 0 0 0 106 68V84H14V68A8 8 0 0 0 14 52Z';
      b.form(shape, ['#f6dfa6', '#d9b56a', '#fbefcf'], 16, 38, 0.97);
      b.fill('M82 36H106V52A8 8 0 0 0 106 68V84H82Z', VALLEY.red);
      b.dash('M82 39V82', '#fbefcf', 2.4, 3, 3);
      b.fill(diamond(94, 60, 5, 7), GOLD[2]);
      b.fill(box(26, 46, 44, 6, 3) + box(26, 58, 32, 5, 2.5) + box(26, 69, 38, 5, 2.5), '#d9b56a');
    });
  },

  wolf: (b) => {
    const t: Tone = ['#8e939c', '#686d77', '#b5b9c0'];
    const pale = '#e6e3dc';
    b.ground(46, 60);
    beast(b, {
      t,
      body: [[30, 50], [33, 38], [41, 31], [49, 33], [55, 42], [68, 46], [82, 46], [92, 48], [97, 56], [94, 66], [86, 70], [74, 70], [62, 72], [52, 76], [44, 76], [38, 71], [33, 62]],
      head: [[29, 29], [38, 27], [46, 31], [47, 39], [42, 45], [34, 47], [26, 47], [16, 46], [9, 44], [8, 40], [12, 37], [22, 35], [26, 32]],
      fore: [46, 66, 9],
      hind: [85, 60, 13],
      foot: 'paw',
      behind: () => {
        b.fill(shape([[93, 52], [101, 60], [105, 74], [103, 87], [99, 82], [97, 70], [91, 60]]), t[0]);
        b.fill(shape([[38, 30], [42, 17], [44, 16], [47, 32]]), t[1]);
      },
      between: () => b.fill(shape([[30, 50], [33, 62], [38, 71], [44, 75], [40, 77], [33, 70], [29, 60]]), pale),
      front: () => {
        b.fill(shape([[32, 31], [34, 18], [36, 17], [41, 29]]), t[0]);
        b.fill(shape([[9, 44], [16, 46], [26, 47], [34, 47], [37, 50], [31, 53], [21, 51], [12, 48]]), pale);
        b.fill(oval(9, 40, 2.6, 2.1, 0), INK);
        eye(b, 28, 37, 1.5, '#e9b84a');
      },
    });
  },

  bear: (b) => {
    const t: Tone = ['#8a5a3a', '#65402a', '#a9784f'];
    b.ground(48, 60);
    beast(b, {
      t,
      body: [[30, 52], [36, 42], [46, 34], [58, 32], [68, 36], [80, 38], [92, 42], [100, 52], [102, 64], [98, 76], [90, 84], [76, 86], [60, 86], [46, 86], [38, 82], [32, 72], [28, 62]],
      head: [[14, 55], [19, 47], [27, 44], [37, 46], [42, 53], [42, 62], [38, 70], [30, 74], [22, 74], [15, 72], [9, 70], [6, 66], [8, 61]],
      fore: [44, 80, 15],
      hind: [88, 76, 17],
      far: [8, -8],
      foot: 'paw',
      front: () => {
        b.fill(O(32, 46, 5.5), t[0]);
        b.fill(O(32, 46, 2.6), t[1]);
        b.fill(shape([[6, 66], [8, 61], [14, 59], [20, 61], [22, 67], [18, 72], [10, 70]]), '#c49a6c');
        b.fill(oval(7.5, 63, 2.6, 2.1, 0), INK);
        eye(b, 24, 56, 1.9);
      },
    });
  },

  fox: (b) => {
    const t: Tone = ['#e2742f', '#b5531c', '#f2a065'];
    const white = '#fbf3e6';
    const sock = '#4a2e22';
    b.ground(46, 62);
    beast(b, {
      t,
      body: [[34, 54], [38, 47], [46, 49], [58, 52], [72, 52], [84, 51], [90, 54], [92, 60], [88, 68], [78, 72], [62, 72], [52, 74], [45, 72], [39, 66]],
      head: [[31, 41], [40, 40], [46, 44], [46, 52], [40, 56], [30, 58], [20, 57], [11, 55], [10, 52], [16, 49], [26, 45]],
      fore: [47, 68, 7],
      hind: [84, 63, 10.5],
      foot: 'paw',
      legs: [sock, '#36211a'],
      behind: () => {
        b.fill(shape([[88, 56], [98, 51], [108, 54], [113, 64], [111, 77], [103, 83], [104, 74], [100, 66], [92, 62]]), t[0]);
        b.fill(shape([[111, 77], [103, 83], [104, 76], [108, 71], [112, 70]]), white);
        b.fill(shape([[40, 41], [44, 28], [46, 27], [47, 43]]), sock);
      },
      between: () => b.fill(shape([[36, 56], [42, 64], [47, 72], [42, 73], [36, 66], [34, 60]]), white),
      front: () => {
        b.fill(shape([[33, 42], [35, 28], [37, 27], [42, 40]]), sock);
        b.fill(shape([[11, 55], [20, 57], [30, 58], [40, 56], [42, 60], [34, 63], [22, 62], [14, 59]]), white);
        b.fill(oval(10.5, 52.5, 2.3, 1.9, 0), INK);
        eye(b, 30, 48, 1.8);
      },
    });
  },

  deer: (b) => {
    const t: Tone = ['#b8693a', '#8a4a24', '#d6905c'];
    b.ground(42, 64);
    beast(b, {
      t,
      body: [[33, 26], [39, 33], [44, 44], [56, 50], [72, 50], [86, 48], [94, 50], [97, 56], [95, 64], [88, 70], [76, 72], [60, 72], [50, 71], [44, 66], [39, 56], [34, 44], [30, 34]],
      head: [[30, 20], [38, 22], [40, 28], [34, 32], [24, 36], [16, 38], [12, 36], [13, 32], [20, 26], [26, 21]],
      fore: [47, 66, 6.5],
      hind: [88, 62, 10],
      foot: 'hoof',
      behind: () => b.fill(shape([[40, 23], [47, 15], [52, 14], [50, 20], [43, 26]]), t[1]),
      between: () => b.fill(shape([[93, 51], [97, 56], [96, 63], [92, 62], [91, 56]]), '#f6eee2'),
      front: () => {
        b.line('M31 20L29 9M29.6 14L26 11M34.5 20L36.5 9', '#e2cfa8', 2.4);
        b.fill(shape([[35, 22], [41, 14], [46, 13], [45, 18], [39, 25]]), t[0]);
        b.fill(shape([[37, 21], [41, 16], [43.5, 15.5], [42.5, 18], [39, 22]]), '#e7b9a0');
        b.fill(oval(12.5, 34.5, 2, 1.7, 0), INK);
        eye(b, 28, 27, 1.9);
      },
    });
  },

  gazelle: (b) => {
    const t: Tone = ['#d9a866', '#b07f40', '#ecc88f'];
    const stripe = '#6b4a2e';
    b.ground(42, 64);
    beast(b, {
      t,
      body: [[33, 26], [39, 33], [44, 44], [56, 50], [72, 50], [86, 49], [94, 51], [96, 57], [94, 64], [88, 69], [76, 71], [60, 71], [50, 70], [44, 66], [39, 56], [34, 44], [30, 34]],
      head: [[30, 20], [37, 22], [39, 28], [33, 32], [24, 35], [17, 37], [13, 35], [14, 31], [21, 26], [26, 21]],
      fore: [47, 66, 5.5],
      hind: [88, 62, 9],
      foot: 'hoof',
      under: 0.95,
      behind: () => {
        b.line('M33.5 21C33 14 37 9 42 7', '#2c221c', 3);
        b.line('M95 54L99 61', stripe, 2.6);
      },
      between: () => {
        b.fill(shape([[46, 63], [60, 66], [76, 66], [91, 62], [89, 68], [76, 71], [60, 71], [50, 70]]), '#fbf6ee');
        b.line('M46 62C58 65.5 76 65.5 90 61.5', stripe, 2.6);
      },
      front: () => {
        b.line('M29.5 21C27 13 30 7 36 4', '#3d2f26', 3);
        b.fill(shape([[35, 22], [42, 17], [46, 17], [42, 22], [38, 25]]), t[0]);
        b.line('M15.5 33.5L28.5 25.5', '#fbf6ee', 1.6);
        b.fill(oval(13.5, 33.8, 1.8, 1.5, 0), INK);
        eye(b, 28, 27, 1.8);
      },
    });
  },

  snake: (b) => {
    const t: Tone = ['#6fb04a', '#4f8a34', '#a6d77a'];
    b.ground(46);
    const body = 'M106 96C96 102 76 102 60 100C40 98 24 94 26 86C28 78 50 77 70 79C86 80 92 72 84 64C76 57 62 60 58 48C56 42 58 36 62 32';
    b.line(body, t[1], 14);
    b.line(body, t[0], 10.5, ' transform="translate(-1 -1.4)"');
    b.form(shape([[56, 28], [62, 22], [72, 20], [80, 24], [81, 31], [74, 36], [63, 36], [57, 33]]), t, 58, 21, 0.9);
    b.line('M81 29L87 30M87 30L90.5 27.5M87 30L90 33.5', TONGUE, 1.6);
    eye(b, 70, 26, 2);
  },

  // The kid is cream and patched, smooth-coated, hornless but for buds, so it is never the bearded goat, the lamb or the
  // gazelle; short-legged and deep-bodied, with a goat's long muzzle and ears out to the side, never a foal's long neck.
  kid: (b) => {
    const t: Tone = ['#f3e4cc', '#d3bc98', '#fbf3e4'];
    const patch = '#a8703f';
    b.ground(36, 64);
    beast(b, {
      t,
      body: [[40, 44], [45, 51], [54, 56], [68, 56], [80, 55], [88, 58], [91, 65], [88, 73], [80, 78], [66, 80], [54, 80], [47, 77], [43, 70], [41, 61], [37, 53]],
      head: [[36, 33], [43, 36], [46, 42], [42, 48], [34, 53], [27, 57], [21, 57], [18, 53], [21, 47], [27, 40], [31, 35]],
      fore: [53, 75, 7.5],
      hind: [83, 71, 10.5],
      far: [6, -5],
      foot: 'hoof',
      behind: () => {
        b.fill(shape([[89, 59], [93, 52], [97, 50], [96, 55], [92, 62]]), t[0]);
        // The far ear, out to the other side and slightly forward.
        b.fill(shape([[33, 38], [26, 34], [22, 35], [25, 39], [32, 41]]), t[1]);
      },
      between: () => b.fill(shape([[62, 56], [75, 56], [78, 64], [70, 70], [62, 65]]), patch),
      front: () => {
        b.fill(shape([[36, 34], [43, 36], [46, 42], [43, 46], [39, 40]]), patch);
        // The near ear, held out and slightly down behind the eye.
        b.fill(shape([[41, 39], [49, 39], [55, 43], [49, 45], [42, 44]]), t[0]);
        b.fill(shape([[44, 40.6], [49.5, 40.8], [52.5, 43], [48.5, 43.6], [44, 42.6]]), '#e6b8a4');
        // Two buds where the horns will be.
        b.fill(oval(34.5, 33.6, 2, 2.6, -20) + oval(38.6, 34.2, 1.9, 2.4, 10), '#d9c39b');
        // A goat's long soft muzzle: paler at the lips, a nostril and the line of the mouth.
        b.fill(shape([[18.5, 50], [24, 49], [27, 53], [24, 57], [19.5, 56.5]]), t[2]);
        b.fill(oval(19.8, 51.4, 1.4, 1, -20), '#8a6a5a');
        b.line('M19.6 55.2C21.4 55.8 23.2 55.6 24.6 54.6', '#b59a7c', 1.1);
        eye(b, 31, 43, 1.9);
      },
    });
  },

  // The black goat-hair tent of the summer pastures, long and low on its poles and ropes.
  tent: (b) => {
    const t: Tone = ['#4a3e38', '#2e2622', '#76675c'];
    b.ground(52, 60, 100);
    b.line('M16 66L4 98M104 62L116 96M38 58L28 96M82 56L94 96', '#8a6a4a', 1.4);
    b.line('M60 54V40', WOOD[0], 3);
    b.form('M12 98L16 64C30 56 44 58 60 52C76 58 90 56 104 60L108 98Z', t, 16, 60, 0.97);
    b.line('M17 74C40 68 80 68 105 72M15 86C40 82 80 82 107 86', t[2], 2);
    b.line('M17 64C30 57 44 59 60 53C76 59 90 57 103 61', '#8f7f72', 2.4);
    // The open front: dark inside by day, lit by the lamp within by evening.
    b.lit('M42 98L47 72H75L80 98Z', '#2a221f', LAMP);
    b.fill(box(46, 90, 30, 8), VALLEY.red);
    b.fill(diamond(61, 94, 5, 3), GOLD[0]);
    b.fill(box(52, 82, 10, 8, 3), CREAM);
  },

  hand: (b) => {
    const skin: Tone = ['#e8b48a', '#c98d63', '#f5d0b0'];
    // A left hand held up, palm out: four spread fingers (the middle longest), the thumb from the lower palm, a sleeve at the wrist.
    const fingers = box(26, 40, 10, 30, 5) + box(40, 24, 11, 42, 5.5) + box(55, 15, 11.5, 48, 5.75) + box(70.5, 22, 11, 42, 5.5);
    const palm = shape([[27, 60], [27, 76], [32, 90], [41, 99], [54, 102], [68, 100], [78, 92], [83, 80], [82, 64], [77, 57], [56, 55]]);
    b.cut(fingers + palm + oval(90, 75, 17, 8, -46) + box(40, 96, 34, 13), skin, 2, 1.4);
    b.form(box(36, 106, 42, 12, 3), BLUE, 37, 107, 0.92);
  },

  ear: (b) => {
    const skin: Tone = ['#e8b48a', '#c98d63', '#f5d0b0'];
    b.form('M34 46C34 24 50 10 70 10C90 10 104 26 102 48C100 66 88 70 84 82C80 96 74 108 58 108C44 108 38 98 40 88C42 80 50 78 50 70C50 62 34 62 34 46Z', skin, 44, 18, 0.93);
    b.fill('M50 46C50 32 60 24 70 24C82 24 88 34 88 44C88 56 78 60 74 70C72 76 66 78 62 74C60 70 64 66 66 62C70 56 76 52 76 44C76 38 72 34 68 34C62 34 58 40 58 46Z', skin[1]);
    b.fill(oval(62, 60, 6, 9, 20), '#b47a52');
  },

  nose: (b) => {
    const skin: Tone = ['#e8b48a', '#c98d63', '#f5d0b0'];
    // A nose in three-quarter view: the bridge down to the round tip, one nostril's wing behind it.
    b.fill(shape([[54, 10], [64, 10], [68, 30], [73, 52], [78, 64], [86, 70], [88, 82], [80, 91], [68, 92], [58, 90], [46, 92], [34, 90], [28, 80], [32, 70], [42, 58], [50, 34]]), skin[0]);
    b.fill(shape([[64, 10], [68, 30], [73, 52], [78, 64], [86, 70], [88, 82], [80, 91], [70, 91], [76, 82], [72, 72], [64, 66], [60, 50], [60, 28]]), skin[1]);
    b.fill(shape([[42, 88], [48, 84], [55, 85], [57, 89], [50, 91]]), '#a86e4c');
    b.fill(oval(40, 74, 5, 3.2, -30), skin[2]);
  },

  tooth: (b) => {
    b.form('M30 34C30 20 40 14 50 16C54 17 57 19 60 19C63 19 66 17 70 16C80 14 90 20 90 34C90 48 86 56 84 70C82 84 80 100 72 102C66 104 64 92 62 82C61 78 59 78 58 82C56 92 54 104 48 102C40 100 38 84 36 70C34 56 30 48 30 34Z', WHITE, 36, 20, 0.93);
    b.fill(oval(42, 32, 4, 9, 20), '#ffffff');
  },

  foot: (b) => {
    const skin: Tone = ['#e8b48a', '#c98d63', '#f5d0b0'];
    // The sole of a bare foot: toes in an arc (the big toe largest), the arch drawn in on the inner side.
    const sole = shape([[40, 46], [40, 58], [45, 68], [47, 80], [44, 92], [45, 102], [52, 110], [62, 112], [72, 107], [78, 96], [82, 80], [88, 64], [93, 52], [86, 44], [72, 40], [56, 40]]);
    const toes = E(49, 33, 9.5, 12) + E(64, 34.5, 6.8, 8.6) + E(75, 37, 6.2, 7.6) + E(84.5, 42, 5.6, 6.6) + E(91, 49, 5, 5.8);
    b.group('rotate(-8 64 70)', () => b.cut(sole + toes, skin, 1.8, 1.4));
  },

  medicine: (b) => {
    const amber: Tone = ['#c9822e', '#9a5a1c', '#e8b066'];
    b.ground(46, 62);
    b.form(box(32, 44, 42, 58, 8), amber, 34, 46, 0.95);
    b.fill(box(41, 34, 24, 12, 2), amber[1]);
    b.form(box(37, 18, 32, 17, 4), WHITE, 38, 19, 0.92);
    b.fill(box(37, 60, 32, 28, 3), CREAM);
    b.fill('M53 66C56 71 59 74 59 77C59 80 56 82 53 82C50 82 47 80 47 77C47 74 50 71 53 66Z', '#e86f8a');
    b.fill(box(36, 50, 4, 46, 2), amber[2]);
    b.group('rotate(-22 92 92)', () => {
      b.fill(box(64, 89, 22, 5, 2.5), STEEL[0]);
      b.fill(E(96, 91.5, 12, 7), STEEL[1]);
      b.fill(E(96, 91, 9, 4.6), '#e86f8a');
    });
    b.group('rotate(-25 22 96)', () => {
      b.fill(box(10, 91, 12, 10, 5) + box(16, 91, 6, 10), VALLEY.red);
      b.fill(box(22, 91, 12, 10, 5) + box(22, 91, 6, 10), '#fbf6ee');
    });
  },

  drum: (b) => {
    const red: Tone = [VALLEY.red, VALLEY.redDark, '#dc6b5c'];
    b.ground(42);
    b.form('M24 46V88C24 98 40 104 60 104C80 104 96 98 96 88V46Z', red, 28, 50, 0.97);
    b.line('M26 52L38 88L50 52L62 92L74 52L86 88L94 54', GOLD[0], 2.4);
    b.fill('M24 84C24 94 40 100 60 100C80 100 96 94 96 84V90C96 100 80 106 60 106C40 106 24 100 24 90Z', WOOD[1]);
    b.fill(E(60, 46, 36, 10), WOOD[1]);
    b.fill(E(60, 45, 33, 8.4), '#f6ead0');
    b.line('M68 40C78 24 92 18 106 18', WOOD[0], 5);
    b.fill(O(106, 18, 4), WOOD[1]);
    b.line('M46 40L22 12', WOOD[2], 2.6);
  },

  wheat: (b) => {
    const t: Tone = ['#e7b752', '#bf8a2c', '#f6d88a'];
    b.ground(30);
    // One ear of wheat, since the word is singular: paired grains up the stalk, each with its whisker.
    b.line('M60 104C60 92 59 80 60 70', t[1], 3);
    let grains = '';
    let awns = '';
    for (let i = 0; i < 6; i++) {
      const y = 68 - i * 7.5;
      grains += oval(55.5, y, 4.4, 7, -22) + oval(64.5, y - 4, 4.4, 7, 22);
      awns += `M52 ${y - 6}L46 ${y - 18}M68 ${y - 10}L74 ${y - 22}`;
    }
    grains += oval(60, 24, 3.4, 6.6, 0);
    b.line(awns, t[2], 1.2);
    b.fill(grains, t[1]);
    b.fill(grains, t[0], ' transform="translate(-0.8 -0.8)"');
    b.form('M60 100C48 90 44 78 46 64C53 75 58 86 61 96Z', LEAF, 48, 68, 0.9);
  },

  corn: (b) => {
    const t: Tone = ['#f5c63c', '#d49c1f', '#fbe08a'];
    b.ground(36);
    b.group('rotate(-20 60 60)', () => {
      b.form(box(46, 12, 28, 84, 14), t, 48, 16, 0.95);
      b.line('M52 20V88M60 17V91M68 20V88', t[2], 5, ' stroke-dasharray="0.1 7.2"');
      b.line('M71.5 24V84', t[1], 4.4, ' stroke-dasharray="0.1 7.2"');
      b.form('M48 96C34 84 28 64 30 44C40 62 46 74 58 86Z', LEAF, 34, 50, 0.9);
      b.form('M72 96C86 84 92 64 90 44C80 62 74 74 62 86Z', LEAF, 82, 54, 0.9);
      b.fill('M44 108C46 94 52 86 60 80C68 86 74 94 76 108Z', LEAF[0]);
    });
  },
};

/**
 * Animals in the catalogue's style that are not catalogue words, for the book's scenes (book.ts): Zerê, the road's
 * golden doe (no antlers, larger ears, slimmer neck); Dapîr's white goat with her long beard and the collar a clue
 * hangs on; and a ram with curled horns. The catalogue's deer, goat and sheep stay as they are, since each word has one
 * picture.
 */
const KIN = {
  doe: (b) => {
    const t: Tone = ['#d9a548', '#ad7a2c', '#eccb7f'];
    b.ground(42, 64);
    beast(b, {
      t,
      body: [[33, 27], [38, 34], [44, 45], [56, 50], [72, 50], [86, 48], [94, 50], [97, 56], [95, 64], [88, 70], [76, 72], [60, 72], [50, 71], [44, 66], [40, 57], [35.5, 45], [31, 35]],
      head: [[30, 20], [38, 22], [40, 28], [34, 32], [24, 36], [16, 38], [12, 36], [13, 32], [20, 26], [26, 21]],
      fore: [47, 66, 6],
      hind: [88, 62, 9.5],
      foot: 'hoof',
      behind: () => b.fill(shape([[39, 23], [47, 12], [54, 9.5], [52.5, 17], [44, 26]]), t[1]),
      between: () => {
        b.fill(shape([[93, 51], [97, 56], [96, 63], [92, 62], [91, 56]]), '#f6eee2');
        b.fill(shape([[33, 34], [38, 36], [42, 46], [39, 48], [34, 40]]), '#f2dcae');
      },
      front: () => {
        // The large ears a doe listens with, lined pale inside.
        b.fill(shape([[33.5, 22], [39.5, 11], [47, 7.5], [47.5, 15], [40.5, 25]]), t[0]);
        b.fill(shape([[37, 20.5], [41.5, 13], [45.5, 10.5], [45.5, 15.5], [40, 22.5]]), '#f4dcc0');
        b.fill(shape([[14.5, 33], [20, 31], [22, 34.5], [17, 37.5], [13.5, 36]]), '#f2dcae');
        b.fill(oval(12.5, 34.5, 2, 1.7, 0), INK);
        eye(b, 28, 27, 2.1);
      },
    });
  },

  whiteGoat: (b) => {
    const t: Tone = ['#f4efe6', '#d6ccbb', '#ffffff'];
    const horn = '#cdb68a';
    b.ground(42, 62);
    beast(b, {
      t,
      body: [[32, 30], [38, 35], [44, 44], [56, 47], [72, 47], [86, 45], [94, 46], [99, 52], [98, 62], [92, 72], [80, 76], [62, 76], [50, 75], [42, 70], [37, 62], [33, 52], [28, 42], [27, 34]],
      head: [[29, 24], [37, 28], [37, 37], [31, 43], [22, 49], [15, 51], [11, 48], [12, 42], [19, 32], [24, 26]],
      fore: [45, 70, 8],
      hind: [88, 66, 11.5],
      legs: ['#ece5d8', '#cbc0ae'],
      foot: 'hoof',
      behind: () => {
        b.fill(shape([[93, 48], [99, 40], [103, 37], [102, 43], [98, 50]]), t[0]);
        b.fill(shape([[31, 26], [35, 17], [43, 11], [51, 11], [45, 15], [39, 21], [35, 28]]), '#b5a07a');
      },
      between: () => {
        // Her collar, with the clue rolled up and tied to it.
        b.line('M34 33C36 40 40 44 46 45', VALLEY.red, 3.4);
        b.fill(box(38.5, 43, 5.5, 8, 1.4), PAPER[0]);
        b.line('M39 46.5H43.5', PAPER[1], 1);
      },
      front: () => {
        b.fill(shape([[27, 26], [30, 16], [38, 9], [47, 8], [41, 12], [35, 19], [32, 28]]), horn);
        b.fill(shape([[33, 30], [42, 32], [47, 37], [41, 38], [33, 35]]), t[1]);
        // Her long beard.
        b.fill(shape([[12, 48], [19, 48], [21, 56], [19, 66], [16, 72], [13.5, 64], [12, 56]]), '#e3dccf');
        b.line('M15 52C15.6 58 15.4 64 16 69', '#cfc6b6', 1.1);
        eye(b, 25, 35, 1.6, '#e9b84a');
      },
    });
  },

  ram: (b) => {
    const dark: Tone = ['#4a3a30', '#382b24', '#6a5648'];
    const horn: Tone = ['#d4bf96', '#a8916a', '#ead9b8'];
    b.ground(46, 62);
    beast(b, {
      t: WOOL,
      wool: [66, 59, 28, 17, 12, 10.5],
      head: [[33, 44], [38, 50], [35, 60], [27, 68], [19, 71], [14, 67], [15, 59], [22, 49], [28, 44]],
      face: dark,
      fore: [47, 71, 7],
      hind: [84, 69, 9],
      legs: [dark[0], dark[1]],
      foot: 'hoof',
      between: () => b.fill(shape([[34, 45], [43, 44], [46, 47], [40, 50], [34, 49]]), dark[1]),
      front: () => {
        b.fill(puffs(32, 44, 5.5, 3, 5, 4.4), WOOL[0]);
        // The curled horn: back from the crown, round and down past the ear, its tip turned forward.
        const curl = 'M30 45C35 37 47 38 49 47C51 56 43 61 37 58C33 56 34 51 38 51';
        b.line(curl, horn[1], 7.4);
        b.line(curl, horn[0], 5.4, ' transform="translate(-0.6 -0.6)"');
        b.line('M33 42C38 39 44 40 46 44', horn[2], 1.4);
        eye(b, 22, 55, 1.6, '#e9dcc8');
      },
    });
  },
} as const satisfies Readonly<Record<string, Draw>>;

/** An animal the book shows that is not a catalogue word. */
export type WordPictureKin = keyof typeof KIN;

/** One of them on the 120-unit canvas as embeddable markup, on its shade patch, in the light card's colours. */
export function wordPictureKinBody(kin: WordPictureKin): string {
  const draw = Object.prototype.hasOwnProperty.call(KIN, kin) ? KIN[kin] : undefined;
  if (!draw) throw new RangeError(`art: no animal called ${String(kin)}`);
  const brush = new Brush(false);
  draw(brush);
  return String(brush);
}

export interface WordPictureOptions {
  id: WordPictureId;
  dark?: boolean;
  size?: number;
  /** The accessible label; without one the picture is decorative and hidden. */
  title?: string;
  idPrefix?: string;
}

/**
 * A word's picture on the 120-unit canvas: the thing centred on its shade patch over a transparent ground. Decorative
 * and hidden from screen readers unless given a `title`, since the apps say the word beside it.
 */
export function wordPictureSvg(opts: WordPictureOptions): string {
  const { id, dark = false } = opts;
  const draw = Object.prototype.hasOwnProperty.call(PICTURES, id) ? PICTURES[id] : undefined;
  if (!draw) throw new RangeError(`art: no word picture ${String(id)}`);
  const size = opts.size ?? CANVAS;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const prefix = prefixFor(opts.idPrefix, 'word-picture', id, dark);
  const brush = new Brush(dark);
  draw(brush, seeded(`word-picture|${id}`));
  const label = opts.title
    ? ` role="img" aria-labelledby="${prefix}t"><title id="${prefix}t">${escapeXml(opts.title)}</title>`
    : ' aria-hidden="true" focusable="false">';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${CANVAS} ${CANVAS}"${label}${brush}</svg>`;
}
