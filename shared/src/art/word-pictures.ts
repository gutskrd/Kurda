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
  horse: (b) => {
    const t: Tone = ['#b06c38', '#82491f', '#cf9058'];
    const mane = '#4a2e1e';
    b.ground(44, 64);
    b.fill('M98 52C108 56 111 72 106 90C103 80 99 70 95 64Z', mane);
    b.line('M54 76L52 101M86 74L90 100', t[1], 7);
    b.fill('M40 60C40 50 50 46 62 46H86C96 46 101 52 101 62C101 72 95 78 85 78H54C46 78 40 70 40 60Z', t[0]);
    b.line('M46 74L44 102M80 76L82 102', t[0], 7.5);
    b.line('M41 102H48M79 102H86M49 101H55M87 100H93', mane, 3.5);
    b.fill('M58 50C52 40 46 28 40 20C37 16 33 14 29 15L26 11L24 17C19 21 13 29 11 35C9 40 11 44 16 44C20 44 24 40 28 38C32 46 34 56 40 66Z', t[0]);
    b.fill('M29 15C39 16 49 28 58 48L52 51C46 39 40 29 32 22Z', mane);
    b.fill('M22 22C19 26 15 31 13 35L17 36C19 31 22 27 25 24Z', '#f1e3cf');
    b.fill(O(24, 25, 1.9) + O(13, 40, 1.2), INK);
    b.fill(oval(66, 53, 13, 3.2, 0), t[2]);
  },

  cow: (b) => {
    const t: Tone = ['#f7f0e3', '#d9ccb6', '#ffffff'];
    const patch = '#5e4031';
    b.ground(46, 62);
    b.line('M102 52C106 60 107 70 106 80', t[1], 3);
    b.fill(oval(106, 83, 3.4, 6, 0), patch);
    b.line('M52 80V100M80 80V100', t[1], 8);
    b.fill('M34 52C34 46 40 42 48 42H92C98 42 102 46 102 54V70C102 78 96 82 88 82H46C38 82 34 76 34 70Z', t[0]);
    b.fill('M56 42C58 52 72 56 78 46C80 44 80 43 79 42Z' + 'M84 62C90 56 100 58 102 62V70C102 76 98 80 92 80C86 76 80 70 84 62Z' + 'M44 66C48 62 56 64 56 70C56 76 50 80 44 78Z', patch);
    b.fill('M40 74C52 82 76 82 100 74C98 79 94 82 88 82H46C43 82 41 78 40 74Z', t[1]);
    b.fill(E(78, 85, 7, 4), PINK);
    b.line('M42 78V102M90 78V102', t[0], 8);
    b.line('M38 102H46M86 102H94M48 100H56M76 100H84', patch, 3.5);
    b.fill('M18 34C14 30 13 25 15 21C19 25 23 29 25 34Z' + 'M40 34C44 30 45 25 43 21C39 25 35 29 33 34Z', '#efe2c4');
    b.fill(oval(12, 43, 7, 3.4, 20) + oval(46, 43, 7, 3.4, -20), t[1]);
    b.fill('M16 48C16 40 21 34 29 34C37 34 42 40 42 48V60C42 66 38 70 32 70H26C20 70 16 66 16 60Z', t[0]);
    b.fill('M30 34C37 34 42 40 42 48V54C36 54 32 48 30 40Z', patch);
    b.fill(E(29, 65, 12, 7.5), PINK);
    b.fill(O(24, 65, 1.6) + O(34, 65, 1.6) + O(22, 48, 2) + O(36, 48, 2), INK);
    b.line('M30 72L36 80', VALLEY.red, 2.4);
    b.form('M33 80L39 76L44 84L38 87Z', GOLD, 36, 78, 0.8);
  },

  ewe: (b) => {
    b.ground(44, 62);
    b.line('M46 78V102M56 80V101M74 80V101M84 78V102', HOOF, 5.5);
    b.fill(puffs(66, 62, 28, 17, 12, 10, 0.2), WOOL[1]);
    b.fill(puffs(64, 60, 26, 15, 12, 9.2, 0.2), WOOL[0]);
    b.fill(oval(36, 47, 8, 3.4, -15) + oval(13, 50, 7, 3.2, 25), HOOF);
    b.fill(oval(24, 56, 10, 14, -32), HOOF);
    b.fill(puffs(30, 44, 6, 4, 5, 4.4), WOOL[0]);
    b.fill(O(21, 54, 1.7), '#efe6d6');
    b.fill(oval(56, 50, 10, 4, -8), WOOL[2]);
  },

  goat: (b) => {
    const t: Tone = ['#5e4c43', '#3f322c', '#7f6c62'];
    b.ground(42, 60);
    b.line('M93 50L101 40', t[0], 4.5);
    b.line('M54 72L54 101M78 72L76 101', t[1], 5.5);
    b.fill('M40 56C40 48 48 44 58 44H82C90 44 96 50 96 58C96 68 90 74 82 74H54C46 74 40 66 40 56Z', t[0]);
    b.line('M46 70L45 103M84 70L86 103', t[0], 6);
    b.fill('M46 54C40 46 36 38 32 32C28 28 24 29 20 33L13 44C11 48 13 52 17 52C22 52 26 48 28 46C32 52 38 60 44 64Z', t[0]);
    b.fill('M17 51L14 64L23 53Z', t[1]);
    b.fill('M29 31C30 19 39 11 52 13C46 16 40 21 35 32Z', '#d9c39b');
    b.fill('M31 35C38 36 43 41 43 46C37 46 32 42 30 37Z', t[1]);
    b.fill(O(25, 38, 2.2), GOLD[0]);
    b.fill(oval(66, 51, 12, 3, 0), t[2]);
  },

  lamb: (b) => {
    b.ground(36, 62);
    const t: Tone = ['#fdf7ea', '#e3d5bb', '#ffffff'];
    b.line('M52 74L49 101M60 76V101M76 76V101M84 74L88 99', t[1], 5);
    b.line('M47 102H52M58 102H63M74 102H79M87 100H92', HOOF, 3);
    b.fill(puffs(68, 62, 19, 12, 10, 8.4, 0.3), t[1]);
    b.fill(puffs(66.5, 60.5, 18, 11, 10, 7.8, 0.3), t[0]);
    b.fill(oval(19, 44, 8, 3.6, 25) + oval(50, 40, 8, 3.6, -30), t[1]);
    b.fill(oval(19, 44, 5, 1.8, 25), PINK);
    b.form(oval(34, 48, 13, 12, -10), t, 26, 40, 0.92);
    b.fill(puffs(36, 36, 5, 2.5, 5, 3.6), t[0]);
    b.fill(O(30, 47, 2.1), INK);
    b.fill(poly(22, 53, 26, 53, 24, 56), TONGUE);
    b.line('M38 58C42 63 50 63 53 58', VALLEY.red, 2.6);
    b.form(O(46, 65, 4.2), GOLD, 44, 63, 0.8);
  },

  phone: (b) => {
    const t: Tone = ['#47415e', '#2f2b42', '#6b6585'];
    b.ground(32);
    b.group('rotate(-10 60 58)', () => {
      b.form(box(34, 10, 52, 92, 10), t, 36, 12, 0.96);
      b.fill(box(39, 20, 42, 72, 4), '#cfe7f3');
      b.fill(poly(39, 62, 81, 30, 81, 42, 39, 74), '#e3f2f8');
      b.fill(O(60, 56, 12), '#3fa45b');
      b.line('M55 51C54 58 58 62.5 65 63', '#ffffff', 3.4);
      b.fill(O(55.2, 50.5, 2.6) + O(65.5, 63, 2.6), '#ffffff');
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
    b.fill(box(22, 34, 70, 40, 4), note[1], ' transform="rotate(-6 57 54)" fill-opacity="0.001"');
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
    b.ground(40, 62);
    b.group('translate(74 72) rotate(14)', () => {
      b.form(egg, ['#e9c49a', '#c99c6c', '#f6dfc2'], -12, -16, 0.9);
    });
    b.group('translate(48 77) rotate(-10)', () => {
      b.form(egg, ['#fbf6ec', '#ddd1bc', '#ffffff'], -12, -16, 0.9);
      b.fill(oval(-9, -8, 4, 7, 15), '#ffffff');
    });
  },

  meat: (b) => {
    const t: Tone = ['#d65a4c', '#a63b32', '#ec8d7f'];
    const bone = '#f3ead8';
    b.ground(42);
    b.line('M64 58L90 32', bone, 11);
    b.fill(O(88, 24, 7.5) + O(97, 33, 7.5), bone);
    b.fill(O(86, 22, 3), '#ffffff');
    b.fill(oval(50, 72, 39, 29, -28), '#f2c6b4');
    b.form(oval(50, 72, 35, 25, -28), t, 28, 60, 0.9);
    b.line('M32 70C40 64 50 66 58 60M42 84C50 78 62 80 70 72', '#ec8d7f', 2.4);
  },

  yoghurt: (b) => {
    b.ground(46);
    b.fill(E(60, 101, 18, 4), CLAY[1]);
    b.form('M16 64C16 88 36 102 60 102C84 102 104 88 104 64Z', CLAY, 28, 68, 0.94);
    let zig = 'M24 78';
    for (let i = 1; i <= 12; i++) zig += `L${f(24 + i * 6)} ${f(78 + (i % 2 ? 4 : 0) + Math.abs(i - 6) * -0.0)}`;
    b.line(zig, CREAM, 2.4);
    b.fill(E(60, 64, 44, 11), CLAY[2]);
    b.fill(E(60, 64, 39, 8.5), '#fbf8f1');
    b.line('M44 64C48 60 62 59 70 62C76 65 68 69 58 67', '#e0d9cb', 2.4);
  },

  chest: (b) => {
    b.ground(48, 62, 103);
    b.fill(poly(88, 101, 88, 58, 104, 50, 104, 93), WOOD[1]);
    b.fill(box(16, 58, 72, 43), WOOD[0]);
    b.fill('M16 58C16 44 30 38 52 38C74 38 88 44 88 58Z', WOOD[2]);
    b.fill('M88 58C88 44 74 38 52 38L68 30C90 30 104 36 104 50Z', WOOD[1]);
    b.fill(box(16, 56, 72, 5) + box(28, 58, 6, 43) + box(70, 58, 6, 43), GOLD[0]);
    b.fill(poly(88, 58, 104, 50, 104, 54, 88, 62), GOLD[1]);
    b.form(box(45, 60, 14, 17, 2), GOLD, 46, 61, 0.86);
    b.fill('M52 64.5A2.4 2.4 0 1 1 51.99 64.5M50.6 66.5H53.4L54.2 72H49.8Z', INK);
    b.fill(diamond(52, 89, 7, 6), VALLEY.red);
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
    b.fill(O(63, 19, 5) + O(57, 11, 4) + O(64, 5, 3), VALLEY.smoke, ' fill-opacity="0.9"');
  },

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
    b.form('M62 30C64 18 78 12 90 18C88 22 92 28 86 30C84 34 74 36 62 30Z', LEAF, 66, 20, 0.86);
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

  spring: (b) => {
    b.ground(48);
    b.form('M14 80C8 62 18 40 38 34C52 31 62 42 62 56V82Z', STONE, 22, 40, 0.92);
    b.form('M56 72C56 50 70 34 88 36C104 38 110 58 106 80Z', STONE, 64, 40, 0.92);
    b.fill('M54 52C56 47 62 47 64 52C64 64 66 74 70 86H56C56 74 54 64 54 52Z', WATER[0]);
    b.line('M58 56C58 66 59 74 61 82', WATER[2], 2);
    b.fill(E(62, 92, 42, 11), WATER[1]);
    b.fill(E(62, 91, 38, 9), WATER[0]);
    b.line(E(63, 89, 14, 3.4), WATER[2], 1.8);
    b.fill(E(24, 94, 7, 4) + E(98, 96, 8, 4.5) + E(82, 102, 6, 3.5), STONE[0]);
    b.line('M18 100L14 90M22 100V88M100 102l3 -9M104 102v-10', LEAF[0], 2.4);
  },

  river: (b) => {
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
    b.fill(O(60, 64, 38), '#f7c63c');
    b.fill('M60 26C34 38 34 90 60 102C46 88 46 40 60 26Z', VALLEY.red);
    b.fill('M60 26C74 40 74 88 60 102C86 90 86 38 60 26Z', BLUE[0]);
    b.fill('M60 26C40 32 28 48 22 64C34 62 46 52 60 26Z' + 'M60 102C80 96 92 80 98 64C86 66 74 76 60 102Z', '#ffffff', ' fill-opacity="0.001"');
    b.fill(O(60, 64, 6), '#fffaf0');
    b.shade(lune(60, 64, 38, 52, 56, 37));
    b.fill(oval(40, 46, 8, 4.5, -45), '#ffffff', ' fill-opacity="0.7"');
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
    b.fill(O(79, 79, 1) + O(87, 79, 1) + O(75, 87, 1) + O(83, 86, 1) + O(91, 87, 1) + O(83, 94, 1), '#f7a3b0');
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
