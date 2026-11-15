/**
 * The word pictures: one small painted picture for each everyday word a
 * lesson's "pick the picture" exercise can ask for. The bubble says the word
 * and the learner taps the one of three or four cards that shows it, so each
 * picture has to read at a glance at 72–96 px, for a child first and without
 * talking down to an adult.
 *
 * `WORD_PICTURES` is the catalogue the server's exercise schema and the road
 * checker read: an ascii id for each picture, the Kurmancî word it shows (in
 * the Hawar alphabet) and its English meaning.
 *
 * They are painted as the lesson road's valley is (art/valley.ts): flat
 * planes with no outlines, each form one face, one step of shade toward the
 * lower right and at most one patch of light, the light from the upper left.
 * Each thing stands alone in the middle of the 120-unit canvas on a soft
 * patch of shade, on a transparent ground, so the apps can lay it on any
 * card; what hangs in the sky (the sun, the moon, a star, a cloud, rain,
 * snow) floats without one. Where a thing has a Kurdish shape it is drawn in
 * it: tea in a tulip glass on its saucer, flat bread from the tenûr, a kilim
 * bag, a knitted wool sock, the double teapot, a blue village door.
 *
 * By evening (a dark card) every colour is taken a little toward the dusk's
 * violet, and the darkest ones are lifted instead, so a black goat or a
 * phone still stands out from the card. Fire stays warm.
 */
import { CANVAS, escapeXml, mix, n, n2, prefixFor, seeded, type Pt } from './svg.js';
import { VALLEY, blobPath, dusk, ellipsePath, smoothPath, warm } from './valley.js';

/** Every word that has a picture: its Kurmancî word and its English meaning. */
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
  car: { ku: 'erebe', en: 'car' },
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
} as const satisfies Readonly<Record<string, { readonly ku: string; readonly en: string }>>;

/** A word that has a picture. */
export type WordPictureId = keyof typeof WORD_PICTURES;

/** Every word that has a picture, in the catalogue's order. */
export const WORD_PICTURE_IDS: readonly WordPictureId[] = Object.freeze(Object.keys(WORD_PICTURES) as WordPictureId[]);

// ───────────────────────────────────────────────────────────── colours

/** A form's three tones: its face, its one step of shade, and its patch of light. */
type Tone = readonly [face: string, shade: string, light: string];

const RED: Tone = ['#e0503f', '#b5382c', '#f08b7e'];
const LEAF: Tone = [VALLEY.leaf, VALLEY.leafShade, VALLEY.leafLight];
const GRASS: Tone = ['#b3d184', '#93b566', '#cfe3a4'];
const BARK: Tone = [VALLEY.trunk, '#664026', '#a8774e'];
const WOOD: Tone = ['#b8804d', '#8a5a33', '#d6a46f'];
const STRAW: Tone = ['#e3b866', '#b98b3c', '#f4d996'];
const CLAY: Tone = ['#d58f55', '#a6632f', '#ecb37f'];
const WALL: Tone = [VALLEY.wall, VALLEY.wallSide, VALLEY.roof];
const ROOF: Tone = [VALLEY.red, VALLEY.redDark, '#dc6b5c'];
const GOLD: Tone = [VALLEY.gold, VALLEY.goldDark, VALLEY.goldLight];
const SUN: Tone = ['#f7c63c', '#e29a24', '#fde49a'];
const BLUE: Tone = [VALLEY.gate, VALLEY.gateDark, '#7fb4e2'];
const GLASS: Tone = ['#e1eff5', '#b3cdd8', '#ffffff'];
const WATER: Tone = ['#5aaee0', '#3a86bf', '#cdeaf6'];
const WHITE: Tone = ['#f6f2ea', '#d6cdbd', '#ffffff'];
const PAPER: Tone = ['#fbf1dc', '#e2cfaa', '#fffaf0'];
const STONE: Tone = ['#a9acb3', '#80848c', '#cdd0d5'];
const COPPER: Tone = ['#cd7c3e', '#9a5326', '#eaa96d'];
const STEEL: Tone = ['#c5ccd5', '#949dab', '#eef1f5'];
const WOOL: Tone = [VALLEY.wool, VALLEY.woolShade, '#ffffff'];
/** The near-black of an animal's face and hooves, a phone, a pupil: never pure black. */
const INK = VALLEY.ink;
const HOOF = VALLEY.hoof;
const PINK = '#f2b0a2';
const TONGUE = '#e8798a';
const CREAM = '#f6e3b0';
const SKY_PANE = '#c4e4f1';
/** A window lit by evening, as the valley's houses are. */
const LAMP = '#f2c35c';

/** The patch of shade every thing stands on: the valley's earth in shade, soft enough for any card. */
const GROUND = VALLEY.earthShade;

/** How dark a colour looks, 0 (black) to 1 (white). */
function luma(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
}

/**
 * A day colour as a dark card shows it: a little toward the dusk's violet,
 * as the valley goes by evening, and lifted toward a pale lilac when that
 * would leave it too dark to see on the card.
 */
function night(hex: string): string {
  const m = dusk(hex, true, 0.18);
  const y = luma(m);
  return y < 0.34 ? mix(m, '#d9d3f2', Math.min(0.5, (0.34 - y) * 1.3)) : m;
}

// ───────────────────────────────────────────────────────────── shapes

const f = n;
type Rand = () => number;

/** A circle as a path, so many can share one element. */
const O = (cx: number, cy: number, r: number): string => ellipsePath(cx, cy, r, r);
const E = ellipsePath;

/** An ellipse turned `deg` degrees about its centre, as a path. */
function oval(cx: number, cy: number, rx: number, ry: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [Math.cos(a) * rx, Math.sin(a) * rx];
  const arc = `A${f(rx)} ${f(ry)} ${f(deg)} 1 0`;
  return `M${f(cx - dx)} ${f(cy - dy)}${arc} ${f(cx + dx)} ${f(cy + dy)}${arc} ${f(cx - dx)} ${f(cy - dy)}Z`;
}

/** A rectangle with its corners rounded by `r`, drawn the way the circles are (anticlockwise), so the two join in one path. */
function box(x: number, y: number, w: number, h: number, r = 0): string {
  if (r <= 0) return `M${f(x)} ${f(y)}v${f(h)}h${f(w)}v${f(-h)}Z`;
  const q = Math.min(r, w / 2, h / 2);
  const c = `a${f(q)} ${f(q)} 0 0 0`;
  return (
    `M${f(x + q)} ${f(y)}${c} ${f(-q)} ${f(q)}v${f(h - 2 * q)}${c} ${f(q)} ${f(q)}h${f(w - 2 * q)}` +
    `${c} ${f(q)} ${f(-q)}v${f(-(h - 2 * q))}${c} ${f(-q)} ${f(-q)}Z`
  );
}

/** A closed polygon through x, y pairs. */
function poly(...xy: number[]): string {
  let d = '';
  for (let i = 0; i + 1 < xy.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${f(xy[i]!)} ${f(xy[i + 1]!)}`;
  return `${d}Z`;
}

/** A diamond about a point: the lozenge of a kilim or a knitted band. */
const diamond = (cx: number, cy: number, rx: number, ry: number): string => poly(cx, cy - ry, cx + rx, cy, cx, cy + ry, cx - rx, cy);

/** Which way an arc goes round (cx, cy) from one point through another to a third: SVG's large-arc and sweep flags. */
function arcFlags(cx: number, cy: number, from: Pt, via: Pt, to: Pt): [number, number] {
  const turn = Math.PI * 2;
  const at = (p: Pt): number => Math.atan2(p[1] - cy, p[0] - cx);
  const norm = (a: number): number => ((a % turn) + turn) % turn;
  const span = norm(at(to) - at(from));
  if (norm(at(via) - at(from)) < span) return [span > Math.PI ? 1 : 0, 1];
  return [turn - span > Math.PI ? 1 : 0, 0];
}

/** The part of one circle that another does not cover: a crescent moon, or the shade on a ball. */
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

/** Round puffs set about an ellipse, and the ellipse filling their middle: wool, or a cloud. */
function puffs(cx: number, cy: number, rx: number, ry: number, count: number, r: number, from = 0): string {
  let d = E(cx, cy, rx, ry);
  for (let i = 0; i < count; i++) {
    const a = from + (i / count) * Math.PI * 2;
    d += O(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, r);
  }
  return d;
}

/** A five-pointed star about a point, its points `r` out and its inner corners `k` of that. */
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

/**
 * What a picture is painted with: flat fills and round-ended lines, every
 * colour given as the day's and shown as the card's light asks.
 */
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

  /** A window or a lamp: its day colour by day, and lit warm by evening. */
  lit(d: string, day: string, evening: string): void {
    this.out += `<path d="${d}" fill="${this.dark ? warm(evening, true) : day}"/>`;
  }

  /** A line for a thing that is a line: a stalk, a seam, a strap, a whisker, steam. */
  line(d: string, hex: string, width: number, more = ''): void {
    this.out += `<path d="${d}" fill="none" stroke="${this.c(hex)}" stroke-width="${f(width)}" stroke-linecap="round" stroke-linejoin="round"${more}/>`;
  }

  /** A run of short square-ended dashes along a line: weaving, a dotted route. */
  dash(d: string, hex: string, width: number, on: number, off: number, offset = 0): void {
    const shift = offset ? ` stroke-dashoffset="${f(offset)}"` : '';
    this.out += `<path d="${d}" fill="none" stroke="${this.c(hex)}" stroke-width="${f(width)}" stroke-dasharray="${f(on)} ${f(off)}"${shift}/>`;
  }

  /**
   * A form in one face and one step of shade: the whole shape in its shade,
   * and its face over it drawn `k` of its size toward (ax, ay), a point near
   * its lit upper-left edge, so the shade shows as a band to the lower right.
   */
  form(d: string, t: Tone, ax: number, ay: number, k = 0.88, more = ''): void {
    this.fill(d, t[1], more);
    this.fill(d, t[0], `${more} transform="matrix(${n2(k)} 0 0 ${n2(k)} ${f(ax * (1 - k))} ${f(ay * (1 - k))})"`);
  }

  /** A see-through darkening laid over a form of many colours (a ball, a folded map), its one step of shade. */
  shade(d: string, opacity = 0.16): void {
    this.out += `<path d="${d}" fill="${this.dark ? '#120e26' : '#3d2a1f'}" fill-opacity="${n2(opacity)}"/>`;
  }

  /** The soft patch of shade a thing stands on. */
  ground(rx: number, cx = 60, cy = 104): void {
    const colour = this.dark ? dusk(GROUND, true, 0.62) : GROUND;
    this.out += `<path d="${E(cx, cy, rx, rx * 0.15)}" fill="${colour}" fill-opacity="${this.dark ? '0.6' : '0.45'}"/>`;
  }

  /** What `draw` paints, moved or turned as one. */
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

/** A sugar cube or a block seen from above and to the left: its front-bottom corner (x, y), its edge `s`. */
function cube(b: Brush, x: number, y: number, s: number, t: Tone): void {
  const w = s * 0.87;
  const h = s * 0.5;
  b.fill(poly(x, y, x - w, y - h, x - w, y - h - s, x, y - s), t[0]);
  b.fill(poly(x, y, x + w, y - h, x + w, y - h - s, x, y - s), t[1]);
  b.fill(poly(x, y - s, x - w, y - h - s, x, y - 2 * h - s, x + w, y - h - s), t[2]);
}

/** A round-crowned fruit tree standing at (x, y): its trunk, its crown in shade, face and light, and its fruit. */
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

/** A cloud of round puffs, in its shade and its face. */
function cloud(b: Brush, cx: number, cy: number, s: number, t: Tone): void {
  const d = O(cx - 22 * s, cy + 4 * s, 16 * s) + O(cx, cy - 7 * s, 22 * s) + O(cx + 23 * s, cy + 3 * s, 17 * s) + E(cx, cy + 10 * s, 38 * s, 12 * s);
  b.form(d, t, cx - 30 * s, cy - 20 * s, 0.92);
  b.fill(oval(cx - 8 * s, cy - 16 * s, 9 * s, 5 * s, -18), t[2]);
}

/** A poplar of the valley's river banks: lit down its left side. */
function poplar(b: Brush, x: number, y: number, s: number): void {
  b.fill(box(x - 1.4 * s, y - 8 * s, 2.8 * s, 8 * s), BARK[0]);
  const top = y - 46 * s;
  const shape = `M${f(x)} ${f(top)}C${f(x + 9 * s)} ${f(top + 12 * s)} ${f(x + 9 * s)} ${f(y - 14 * s)} ${f(x)} ${f(y - 6 * s)}C${f(x - 9 * s)} ${f(y - 14 * s)} ${f(x - 9 * s)} ${f(top + 12 * s)} ${f(x)} ${f(top)}Z`;
  b.form(shape, [VALLEY.poplarLight, VALLEY.poplarShade, VALLEY.poplarLight], x - 6 * s, top + 10 * s, 0.82);
}

// ───────────────────────────────────────────────────────────── the pictures

const APPLE = 'M60 41C49 31 22 35 22 63C22 86 39 104 51 104C55 104 57 102 60 102C63 102 65 104 69 104C81 104 98 86 98 63C98 35 71 31 60 41Z';

const PICTURES: Partial<Record<WordPictureId, Draw>> = {
  apple: (b) => {
    b.ground(32);
    b.line('M60 41C59 32 62 25 67 20', BARK[0], 4.5);
    b.form('M63 31C68 19 82 16 92 21C88 33 74 38 63 31Z', LEAF, 64, 24, 0.84);
    b.line('M67 29C74 26 81 23 88 22', LEAF[2], 1.4);
    b.form(APPLE, RED, 32, 44);
    b.fill(oval(39, 58, 5, 9, 20), RED[2]);
  },

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

  water: (b) => {
    b.fill(E(60, 103, 38, 6.5), WATER[2]);
    b.line(E(60, 103, 24, 3.6), WATER[0], 1.6);
    b.form('M60 12C66 24 92 48 92 71C92 89 78 101 60 101C42 101 28 89 28 71C28 48 54 24 60 12Z', WATER, 40, 46);
    b.fill('M41 74C41 63 46 54 52 46C50 56 48 63 48 72C48 78 50 83 53 87C46 85 41 80 41 74Z', WATER[2]);
    b.fill(O(22, 92, 3.6) + O(98, 90, 3) + O(30, 82, 2.2), WATER[0]);
  },

  sugar: (b) => {
    b.ground(42, 62);
    const t: Tone = ['#eee9df', '#cdc4b2', '#fbf9f4'];
    cube(b, 82, 97, 22, t);
    cube(b, 46, 104, 25, t);
    cube(b, 46, 79, 25, t);
    b.fill(O(36, 88, 1) + O(52, 92, 1) + O(40, 62, 1) + O(56, 50, 1) + O(88, 76, 1) + O(70, 82, 1), t[1]);
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
    b.ground(36, 64);
    b.line('M56 92L55 104M50 105H60M70 91L71 104M66 105H76', GOLD[0], 3);
    b.fill(smoothPath([[80, 62], [83, 44], [90, 30], [99, 29], [105, 44], [104, 62], [97, 74]], true), '#7c4426');
    b.form(smoothPath([[31, 38], [36, 31], [45, 31], [50, 38], [52, 48], [58, 57], [70, 59], [84, 56], [96, 59], [99, 70], [92, 83], [78, 92], [58, 94], [44, 89], [35, 77], [33, 64], [33, 54], [29, 47]], true), ['#d27a3c', '#a5552a', '#e9a066'], 40, 40);
    b.fill(smoothPath([[52, 68], [64, 62], [80, 64], [88, 71], [80, 80], [66, 84], [58, 80]], true), '#a5552a');
    b.line('M58 70C66 67 74 67 82 70', '#e9a066', 2);
    b.fill('M33 33C31 26 36 23 38 28C39 21 45 21 44 28C47 23 52 26 48 33Z', VALLEY.red);
    b.fill('M29 46C26 52 29 57 33 55C35 53 34 49 32 46Z', VALLEY.red);
    b.fill(poly(31, 39, 21, 43, 31, 47), GOLD[0]);
    b.fill(O(37, 39, 2.2), INK);
  },

  dog: (b) => {
    const t: Tone = ['#d6a061', '#a8733d', '#ecc28a'];
    b.ground(42, 58);
    b.line('M92 60C101 54 104 44 99 35', t[0], 7);
    b.line('M52 74V102M84 74L86 102', t[1], 8);
    b.fill('M36 62C36 51 46 47 58 47H82C92 47 96 54 96 63C96 73 89 79 79 79H50C41 79 36 72 36 62Z', t[0]);
    b.fill('M44 72C56 79 72 79 92 72C89 77 85 79 79 79H50C47 79 45 76 44 72Z', t[1]);
    b.line('M44 74V103M76 75L77 103', t[0], 9);
    b.fill('M34 66C30 58 28 48 32 40L50 40C52 48 50 56 46 62Z', t[0]);
    b.fill('M24 45C17 46 12 44 12 39C12 34 17 32 23 32C25 26 31 23 38 24C46 25 51 31 51 39C51 47 45 52 37 52C31 52 27 49 24 45Z', t[0]);
    b.fill(oval(19, 40, 8, 6, 0), t[2]);
    b.fill('M20 45C20 52 27 52 26 46Z', TONGUE);
    b.fill('M37 25C45 22 51 28 50 38C49 45 44 46 42 42C40 37 38 31 37 25Z', '#8a5a36');
    b.fill(O(13, 37, 2.8) + O(30, 34, 2.2), INK);
    b.line('M36 51L48 57', VALLEY.red, 5);
    b.fill(oval(64, 53, 12, 3, 0), t[2]);
  },

  cat: (b) => {
    const t: Tone = ['#ea9748', '#bd6c2a', '#f8c48a'];
    b.ground(34, 62);
    b.line('M84 101C98 103 106 93 102 81C100 75 96 73 92 75', t[1], 8);
    b.form('M38 104C32 104 30 98 32 88C34 76 40 64 50 58C56 55 66 55 72 58C82 64 88 76 90 90C91 99 88 104 82 104Z', t, 40, 60, 0.9);
    b.fill('M50 62C56 66 64 66 70 62C72 74 68 88 60 92C52 88 48 74 50 62Z', t[2]);
    b.fill(E(52, 102, 7, 4) + E(68, 102, 7, 4), t[2]);
    b.line('M80 74C84 76 86 80 87 85M76 66C80 68 83 72 84 77', t[1], 2.5);
    b.fill('M42 37L40 13L58 26Z' + 'M78 37L80 13L62 26Z', t[0]);
    b.form('M40 44C40 32 48 24 60 24C72 24 80 32 80 44C80 54 72 60 60 60C48 60 40 54 40 44Z', t, 46, 28, 0.92);
    b.fill('M44 32L44 19L53 26Z' + 'M76 32L76 19L67 26Z', PINK);
    b.line('M56 28L57 34M64 28L63 34M60 27V33', t[1], 2);
    b.fill(E(52, 43, 3.6, 4.4) + E(68, 43, 3.6, 4.4), '#9cc95a');
    b.line('M52 40.5V45.5M68 40.5V45.5', INK, 1.8);
    b.fill(poly(57, 50, 63, 50, 60, 53.5), TONGUE);
    b.line('M45 52L31 50M45 55L32 58M75 52L89 50M75 55L88 58', '#fff3e2', 1.3);
  },

  donkey: (b) => {
    const t: Tone = ['#a59c98', '#7c7471', '#c6bfbb'];
    const pale = '#ebe5df';
    b.ground(42, 62);
    b.line('M96 56C101 62 102 72 101 82', HOOF, 3);
    b.fill(oval(101, 85, 3.2, 6, 0), HOOF);
    b.line('M54 76L53 101M85 76L87 101', t[1], 7);
    b.fill('M40 58C40 49 48 45 58 45H82C92 45 97 52 97 61C97 71 91 78 81 78H53C45 78 40 69 40 58Z', t[0]);
    b.fill('M48 72C58 78 74 78 92 73C89 77 85 78 81 78H53C51 78 49 75 48 72Z', pale);
    b.line('M46 74L45 102M78 75L79 102', t[0], 7.5);
    b.line('M42 102H49M75 102H82M50 101H56M84 101H90', HOOF, 3.5);
    b.fill('M38 30C35 20 36 10 40 7C44 11 45 20 43 30Z', t[1]);
    b.fill('M38 66C34 56 31 46 29 38L45 33C49 41 53 49 56 56Z', t[0]);
    b.fill('M16 54C11 53 10 47 13 44L26 30C30 26 37 26 41 30C45 34 46 40 42 46L32 56C28 58 21 56 16 54Z', t[0]);
    b.fill('M16 54C11 53 10 47 13 44L18 39C22 41 25 46 25 52C23 55 19 55 16 54Z', pale);
    b.fill('M32 29C28 19 29 9 33 6C37 10 38 19 37 29Z', t[0]);
    b.fill('M33 26C32 19 32 13 34 11C35 14 36 19 35 26Z', PINK);
    b.line('M41 30C45 38 50 47 55 55', HOOF, 4);
    b.fill(O(29, 38, 2) + O(14, 49, 1.3), INK);
    b.fill(box(58, 44, 24, 23, 2), VALLEY.red);
    b.fill(box(58, 50, 24, 3), CREAM);
    b.fill(diamond(70, 59, 4, 5), VALLEY.indigo);
  },

  orchard: (b, random) => {
    b.fill(E(60, 97, 52, 12), GRASS[1]);
    b.fill(E(59, 94, 51, 10.5), GRASS[0]);
    fruitTree(b, random, 84, 92, 21, 19, VALLEY.fruit);
    fruitTree(b, random, 38, 96, 25, 22, VALLEY.apple);
    b.line('M18 96l-2 -5M20 96v-6M98 92l2 -5M70 100l-1 -5M72 100l2 -4', GRASS[1], 2);
  },

  bread: (b) => {
    b.ground(44);
    const flat: Tone = ['#efc987', '#cf9f58', '#f8e2b2'];
    b.form(oval(76, 50, 27, 31, 16), flat, 58, 30, 0.9);
    let dots = '';
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      dots += O(75 + Math.cos(a) * 15, 50 + Math.sin(a) * 18, 2);
    }
    b.fill(dots + O(75, 50, 2.4), flat[1]);
    const crust: Tone = ['#e2a95c', '#b07a34', '#f6cf94'];
    b.form('M14 84C14 64 32 52 56 52C80 52 98 64 98 84C98 92 91 96 83 96H29C21 96 14 92 14 84Z', crust, 24, 58, 0.9);
    b.fill(oval(36, 72, 3.6, 11, 28) + oval(56, 70, 3.6, 12, 28) + oval(76, 72, 3.6, 11, 28), '#f7dcae');
    b.fill(oval(30, 62, 7, 2.6, -22), crust[2]);
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
    b.line('M30 52C26 16 94 16 90 52', '#8a5a36', 6);
    b.form(box(20, 46, 80, 52, 10), [VALLEY.red, VALLEY.redDark, '#dc6b5c'], 22, 48, 0.94);
    b.fill(box(20, 78, 80, 11), CREAM);
    b.fill(diamond(32, 83.5, 4, 4) + diamond(46, 83.5, 4, 4) + diamond(60, 83.5, 4, 4) + diamond(74, 83.5, 4, 4) + diamond(88, 83.5, 4, 4), VALLEY.indigo);
    b.fill('M20 56C20 50 25 46 31 46H89C95 46 100 50 100 56V66L60 74L20 66Z', VALLEY.redDark);
    b.fill(diamond(60, 61, 9, 7), GOLD[0]);
    b.fill(diamond(60, 61, 3.5, 3), VALLEY.indigo);
    b.line('M26 98V106M94 98V106', CREAM, 4);
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
    b.ground(40);
    b.form(box(28, 56, 64, 46, 3), t, 30, 58, 0.93);
    b.fill(box(28, 57, 64, 3), t[1]);
    b.fill(box(54, 56, 12, 46), GOLD[0]);
    b.form(box(23, 44, 74, 14, 3), t, 25, 46, 0.95);
    b.fill(box(54, 44, 12, 14), GOLD[0]);
    b.fill('M60 45C52 28 34 30 38 40C40 46 50 47 60 45Z' + 'M60 45C68 28 86 30 82 40C80 46 70 47 60 45Z', GOLD[0]);
    b.fill('M58 44C52 36 44 36 44 40C46 43 52 44 58 44Z' + 'M62 44C68 36 76 36 76 40C74 43 68 44 62 44Z', GOLD[1]);
    b.fill(O(60, 44, 5), GOLD[1]);
  },

  basket: (b) => {
    b.ground(42);
    b.line('M24 58C24 14 96 14 96 58', STRAW[1], 6);
    b.fill(E(60, 58, 40, 8), '#8a6428');
    b.form('M20 60H100L92 97C91 101 87 104 82 104H38C33 104 29 101 28 97Z', STRAW, 22, 62, 0.94);
    b.dash('M23 72H97', STRAW[1], 3.5, 6, 5);
    b.dash('M25 82H95', STRAW[1], 3.5, 6, 5, 5.5);
    b.dash('M27 92H93', STRAW[1], 3.5, 6, 5);
    b.line(E(60, 58, 41, 8.5), STRAW[2], 4.5);
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
};

export interface WordPictureOptions {
  id: WordPictureId;
  dark?: boolean;
  size?: number;
  /** its name for a screen reader; without one the picture is decorative and hidden */
  title?: string;
  idPrefix?: string;
}

/**
 * A word's picture on the 120-unit canvas: the thing in the middle on its
 * patch of shade, on a transparent ground. Decorative and hidden from screen
 * readers unless it is given a `title`, since the apps say the word beside it.
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
