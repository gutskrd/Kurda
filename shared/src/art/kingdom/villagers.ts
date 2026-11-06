/**
 * The village's people at their chores: men in şal û şapik, the suit of
 * trousers and short jacket cut from one cloth, a patterned sash round the
 * waist and a cloth wound round the head; women in long bright dresses with a
 * short vest over them, a headscarf, and a band of coins across the brow and
 * at the belt; children; an elder with a white beard and a stick.
 *
 * Each person is a few layers that move on their own: the body (with the arm
 * that stays still), the head (which nods), the arm that works (and the tool
 * in its hand: a hoe, a shepherd's staff, bread for the tenûr, a water jar on
 * the shoulder, a glass of tea, a weaver's shuttle) and, for those whose legs
 * show, the legs. Every layer of one person shares one box, so they lie over
 * one another; a leg hangs from the hip at its own origin, like an animal's.
 *
 * Drawn standing, facing us a little to the right, in the village's ink with
 * a lighter outline than the buildings', since they are so much smaller; the
 * light from the upper left, a shade down their right side. A person stands
 * thirty-two of these units tall, feet at 0.
 */
import { n } from '../svg.js';
import { INK, disc, oval, type Palette } from './pen.js';

/** One person's box, shared by their layers, in their own units: room round them for their tools. */
export const VILLAGER_BOX = { x: -16, y: -36, w: 32, h: 37 } as const;
/** A leg's box, its origin at the hip. */
export const VILLAGER_LEG_BOX = { x: -2.8, y: -0.6, w: 5.6, h: 15 } as const;
/** How tall a person stands in these units, feet to the top of the head. */
export const VILLAGER_TALL = 33;
/** Where the joints are, in these units: the hips, the working shoulder, the foot of the neck. */
export const VILLAGER_JOINTS = { hips: [[-1.9, -13.2], [1.9, -13.2]] as const, shoulder: [4.2, -22.4] as const, neck: [0, -24.6] as const };

/** The colours of what a person wears. */
interface Outfit {
  /** the suit, or the dress */
  cloth: string;
  shade: string;
  /** the sash, or the vest */
  band: string;
  /** the head cloth, or the headscarf */
  head: string;
  /** a pattern on the head cloth or along the dress's hem */
  trim: string;
  skin: string;
}

const SKIN = { light: '#e6b48e', mid: '#cf9468', deep: '#ad7652' };

/** Everyone the village keeps, and what they wear (by day; at dusk a little dimmer). */
export const OUTFITS = {
  // the shepherd: a brown suit, a red sash, a black and white head cloth
  shepherd: { cloth: '#8a7058', shade: '#6f5843', band: '#c4453a', head: '#2f2a2c', trim: '#f2ece2', skin: SKIN.mid },
  // the farmer: an olive suit, a dark red sash, a red and white head cloth
  farmer: { cloth: '#7d8150', shade: '#62663d', band: '#9b2f2a', head: '#c94a3c', trim: '#f6efe2', skin: SKIN.deep },
  // the rider: a grey-blue suit, a saffron sash
  rider: { cloth: '#6a7488', shade: '#535c6e', band: '#e0a531', head: '#3a3436', trim: '#efe7da', skin: SKIN.light },
  // the elder: a dark suit, a white head cloth, a white beard
  elder: { cloth: '#5b4a40', shade: '#46382f', band: '#7b5b3a', head: '#f1ece3', trim: '#c8bfb2', skin: SKIN.mid },
  // the baker: a rose dress, a green vest, a white scarf
  baker: { cloth: '#cf3f7c', shade: '#a82f63', band: '#2f8a5e', head: '#f6f1e8', trim: '#f2c14e', skin: SKIN.light },
  // the water carrier: an emerald dress, a red vest, a saffron scarf
  carrier: { cloth: '#2c9a6c', shade: '#227a55', band: '#c4453a', head: '#f0b43c', trim: '#f6e9c8', skin: SKIN.mid },
  // the weaver: a violet dress, a gold vest, a red scarf
  weaver: { cloth: '#7d4fb4', shade: '#623d90', band: '#e0a531', head: '#d4473b', trim: '#f6e9c8', skin: SKIN.deep },
  // a boy in a red shirt and blue trousers, a girl in a yellow dress
  boy: { cloth: '#d4473b', shade: '#ad3529', band: '#3f5f9a', head: '#3b2a22', trim: '#f2ece2', skin: SKIN.light },
  girl: { cloth: '#f0b43c', shade: '#cc9128', band: '#2f8a5e', head: '#3b2a22', trim: '#cf3f7c', skin: SKIN.mid },
} as const satisfies Record<string, Outfit>;
export type Villager = keyof typeof OUTFITS;
const WOMEN = new Set<Villager>(['baker', 'carrier', 'weaver', 'girl']);
const CHILDREN = new Set<Villager>(['boy', 'girl']);

/** What a person's working hand holds. */
export type Tool = 'none' | 'hoe' | 'staff' | 'bread' | 'jar' | 'glass' | 'shuttle';

/** A small pen for people: an outline round the whole, lighter than the buildings', and faces with a fine line. */
class Figure {
  private outline = '';
  private body = '';
  sil(d: string): this {
    this.outline += d;
    return this;
  }
  fill(d: string, colour: string): this {
    this.body += `<path d="${d}" fill="${colour}" stroke-width="0.55"/>`;
    return this;
  }
  flat(d: string, colour: string): this {
    this.body += `<path d="${d}" fill="${colour}" stroke="none"/>`;
    return this;
  }
  line(d: string, width = 0.55, colour = INK): this {
    this.body += `<path d="${d}" fill="none"${colour === INK ? '' : ` stroke="${colour}"`} stroke-width="${n(width)}"/>`;
    return this;
  }
  svg(): string {
    return (this.outline ? `<path d="${this.outline}" fill="${INK}" stroke-width="1.7"/>` : '') + this.body;
  }
}

/** A colour darkened by a share, as a hex colour. */
function scaled(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const ch = (s: number): string => Math.round(((v >> s) & 255) * k).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** A colour a little dimmer, for dusk. */
const dim = (hex: string, pal: Palette): string => (pal.dusk ? scaled(hex, 0.86) : hex);
/** The shade of a colour, down a form's right side. */
const darker = (hex: string): string => scaled(hex, 0.84);

function outfit(who: Villager, pal: Palette): Outfit {
  const o: Outfit = OUTFITS[who];
  return { cloth: dim(o.cloth, pal), shade: dim(o.shade, pal), band: dim(o.band, pal), head: dim(o.head, pal), trim: dim(o.trim, pal), skin: dim(o.skin, pal) };
}

const SHADE_SKIN = (o: Outfit): string => (o.skin === SKIN.light ? '#cf9a74' : o.skin === SKIN.mid ? '#b57d55' : '#93603f');

/** The arm that hangs still on the left: a sleeve and a hand. */
function stillArm(f: Figure, o: Outfit, woman: boolean): void {
  const sleeve = woman ? 'M-3.6 -23Q-5.8 -22.6 -6 -20.4L-6.6 -15.4Q-5.4 -14.6 -4.3 -15.2L-3.8 -20Z' : 'M-3.6 -23Q-5.6 -22.8 -5.8 -20.6L-6.2 -15.6Q-5.2 -15 -4.4 -15.4L-3.8 -20Z';
  const hand = disc(-5.5, -14.6, 1.1);
  f.sil(sleeve + hand).fill(hand, o.skin).fill(sleeve, o.cloth);
}

/** A man's or a boy's body: the short jacket, the shirt's collar, the sash and its end, the still arm. */
function manBody(who: Villager, pal: Palette): string {
  const o = outfit(who, pal);
  const f = new Figure();
  stillArm(f, o, false);
  const jacket = 'M-4.5 -23.4Q0 -24.8 4.5 -23.4L4.9 -12.6Q0 -11.4 -4.9 -12.6Z';
  const sash = 'M-4.8 -16.6Q0 -15.4 4.8 -16.6L4.9 -14.2Q0 -13 -4.9 -14.2Z';
  const end = 'M-3.4 -14.6l-0.9 4.2l1.5 0.2l0.7 -4.2Z';
  f.sil(jacket + end).fill(jacket, o.cloth);
  f.flat('M1.8 -23.9Q4.2 -23.7 4.5 -23.4L4.9 -12.6Q3.5 -12.2 2.3 -12Q2.8 -18 1.8 -23.9Z', o.shade);
  f.fill('M-1.5 -23.9L0 -20.6L1.5 -23.9Z', '#f4efe6').line('M0 -20.6V-16.4');
  f.fill(end, o.band).fill(sash, o.band).line('M-4.8 -15.4Q0 -14.2 4.8 -15.4', 0.45, o.trim);
  if (who === 'elder') {
    // his stick, in the still hand
    f.sil('M-6 -15.2L-6.8 0.2L-5.6 0.2L-4.9 -15.2Z').fill('M-6 -15.2L-6.8 0.2L-5.6 0.2L-4.9 -15.2Z', '#7a5234');
  }
  return f.svg();
}

/** A woman's or a girl's body: the long dress and its embroidered hem, the vest, the belt of coins, her feet, the still arm. */
function womanBody(who: Villager, pal: Palette): string {
  const o = outfit(who, pal);
  const f = new Figure();
  const feet = oval(-1.6, 0, 1.3, 0.7) + oval(1.7, 0, 1.3, 0.7);
  f.sil(feet).fill(feet, '#3b2a22');
  stillArm(f, o, true);
  const dress = 'M-4.3 -23.2Q0 -24.6 4.3 -23.2L5.8 -1.4Q0 0.2 -5.8 -1.4Z';
  f.sil(dress).fill(dress, o.cloth);
  f.flat('M1.6 -23.8Q4 -23.6 4.3 -23.2L5.8 -1.4Q4.2 -0.8 2.8 -0.6Q3 -12 1.6 -23.8Z', o.shade);
  f.fill('M-5.7 -3.6Q0 -2 5.7 -3.6L5.8 -1.4Q0 0.2 -5.8 -1.4Z', o.trim);
  f.line('M-4.6 -2.7l0.8 0.6l0.8 -0.6l0.8 0.6l0.8 -0.6M1.4 -2.4l0.8 0.6l0.8 -0.6l0.8 0.6l0.8 -0.6', 0.4, o.shade);
  const vest = 'M-4.3 -23.2Q-2.2 -23.9 -1.2 -23.9L-1 -15.6L-4.6 -15.8ZM4.3 -23.2Q2.2 -23.9 1.2 -23.9L1 -15.6L4.6 -15.8Z';
  f.fill(vest, o.band);
  if (!CHILDREN.has(who)) {
    f.fill('M-4.7 -16.4Q0 -15.4 4.7 -16.4L4.8 -15Q0 -14 -4.8 -15Z', '#e3a83a');
    let coins = '';
    for (let x = -3.6; x <= 3.7; x += 1.2) coins += disc(x, -14 + Math.abs(x) * 0.05, 0.45);
    f.flat(coins, '#f6d36b');
  }
  return f.svg();
}

/** A man's head: his neck, his face, his eyes, his moustache (or an elder's white beard), and the cloth wound round his head, or a boy's cap. */
function manHead(who: Villager, pal: Palette): string {
  const o = outfit(who, pal);
  const f = new Figure();
  const neck = 'M-1.3 -25.4h2.6v2.6h-2.6Z';
  const face = disc(0, -27.6, 3.3);
  const wrap = who === 'boy' ? 'M-3.4 -28.4Q-3.6 -32.2 0 -32.4Q3.6 -32.2 3.4 -28.4Q1.6 -29.4 0 -29.4Q-1.6 -29.4 -3.4 -28.4Z' : 'M-3.8 -27.8Q-4.4 -32.6 0 -33Q4.4 -32.6 3.8 -27.8Q2 -29.8 0 -29.6Q-2 -29.8 -3.8 -27.8Z';
  const beard = 'M-3 -27.2Q-3.2 -22.4 0 -21.8Q3.2 -22.4 3 -27.2Q1.5 -25.2 0 -25.4Q-1.5 -25.2 -3 -27.2Z';
  f.sil(neck + face + wrap + (who === 'elder' ? beard : '')).fill(neck, o.skin).fill(face, o.skin);
  f.flat('M1.2 -30.7Q4.3 -28.4 1.6 -24.5Q3.2 -27.8 1.2 -30.7Z', SHADE_SKIN(o));
  f.flat(disc(-1.15, -27.5, 0.45) + disc(1.2, -27.5, 0.45), INK);
  if (who === 'elder') f.fill(beard, '#f1ece4').line('M-1.8 -25.9Q0 -26.6 1.8 -25.9', 0.7, '#d8d0c4');
  else if (who !== 'boy') f.flat('M-2.1 -25.8Q-1 -26.9 0 -26.2Q1 -26.9 2.1 -25.8Q1 -25.2 0 -25.6Q-1 -25.2 -2.1 -25.8Z', '#3b2a22');
  f.fill(wrap, o.head);
  if (who === 'boy') f.line('M-3.2 -29.2Q0 -30.4 3.2 -29.2', 0.5, '#5a4036');
  else {
    // the wound folds, and the pattern of the cloth: dots on the dark, a check on the red
    f.line('M-3.5 -29.4Q0 -31.2 3.5 -29.4M-3 -31Q0 -32.4 3 -31', 0.45, o.trim);
    f.flat(disc(-2.2, -30.2, 0.3) + disc(0.4, -31, 0.3) + disc(2.4, -30.2, 0.3) + disc(-0.9, -32, 0.25), o.trim);
    f.line('M3.4 -28.6l1.4 1.2M3.7 -29.4l1.5 0.8', 0.5, o.head);
  }
  return f.svg();
}

/** A woman's head: the headscarf falling behind her shoulders, her face, the band of coins across her brow; a girl's dark hair and plait. */
function womanHead(who: Villager, pal: Palette): string {
  const o = outfit(who, pal);
  const f = new Figure();
  const face = disc(0, -27.3, 3.05);
  if (who === 'girl') {
    const hair = 'M-3.2 -27.4Q-3.6 -31.6 0 -31.8Q3.6 -31.6 3.2 -27.4Q1.6 -29.6 0 -29.4Q-1.6 -29.6 -3.2 -27.4Z';
    const plait = 'M2.4 -28Q4.8 -26 4.2 -22.4L3.2 -22.6Q3.6 -25.6 1.8 -27.2Z';
    f.sil(face + hair + plait).fill(face, o.skin).fill(plait, o.head).fill(hair, o.head);
    f.flat(disc(-1.1, -27.2, 0.42) + disc(1.15, -27.2, 0.42), INK).flat(disc(4, -22.6, 0.6), o.trim);
    return f.svg();
  }
  const scarf = 'M-4.2 -26.4Q-4.8 -32.6 0 -32.9Q4.8 -32.6 4.2 -26.4L5 -22.6Q0 -21.4 -5 -22.6Z';
  const brow = 'M-3.3 -28.3Q-3.2 -31.3 0 -31.5Q3.2 -31.3 3.3 -28.3Q1.8 -30.3 0 -30.2Q-1.8 -30.3 -3.3 -28.3Z';
  f.sil(scarf + face).fill(scarf, o.head);
  f.flat('M2.6 -31.6Q4.6 -29.8 4.6 -24.4L5 -22.6Q3.8 -22.2 3 -22.2Q4 -27 2.6 -31.6Z', darker(o.head));
  f.fill(face, o.skin).flat('M1.2 -30.2Q4 -28 1.4 -24.4Q2.9 -27.6 1.2 -30.2Z', SHADE_SKIN(o));
  f.flat(disc(-1.1, -27.2, 0.42) + disc(1.15, -27.2, 0.42), INK);
  f.fill(brow, o.head);
  let coins = '';
  for (let x = -2.4; x <= 2.5; x += 1.2) coins += disc(x, -29.7 + Math.abs(x) * 0.18, 0.55);
  f.fill(coins, '#f2c14e');
  return f.svg();
}

/** The working arm, hanging from the shoulder, and what its hand holds. */
function workingArm(who: Villager, tool: Tool, pal: Palette): string {
  const o = outfit(who, pal);
  const f = new Figure();
  const woman = WOMEN.has(who);
  const wood = '#8a5a34';
  if (tool === 'jar') {
    // the jar on her shoulder, her arm up to hold it
    const jar = 'M3.6 -29.8Q2.6 -27.4 3.8 -25.2Q5.6 -23.6 7.6 -25Q8.8 -27.4 7.6 -29.8Q5.6 -31 3.6 -29.8Z';
    const neck = 'M4.6 -29.6l0.2 -1.6h2l0.2 1.6Z';
    const sleeve = 'M3.6 -23Q5.6 -23.2 6.4 -24.8L7.4 -27.6Q8.6 -27.4 8.6 -26.2L7.6 -22.8Q6.6 -20.8 4.2 -20.6Z';
    const hand = disc(8, -27.2, 1.05);
    f.sil(jar + neck + sleeve + hand).fill(neck, '#b5653a').fill(jar, '#c8743f');
    f.flat('M6.2 -30Q8.4 -28.4 7.4 -25.2Q6.8 -24.6 6.2 -24.4Q7.4 -27.4 6.2 -30Z', '#a85b33').line('M3.8 -27.6Q5.6 -27 7.8 -27.6', 0.45, '#f2d6a8');
    f.fill(sleeve, o.cloth).fill(hand, o.skin);
    return f.svg();
  }
  const sleeve = woman ? 'M3.6 -23Q5.8 -22.6 6 -20.4L6.6 -15.4Q5.4 -14.6 4.3 -15.2L3.8 -20Z' : 'M3.6 -23Q5.6 -22.8 5.8 -20.6L6.2 -15.6Q5.2 -15 4.4 -15.4L3.8 -20Z';
  const hand = disc(5.5, -14.6, 1.1);
  if (tool === 'hoe') {
    const handle = 'M3.1 -19.7L4 -20.1L12.4 -1.7L11.5 -1.3Z';
    const blade = 'M10.4 -2.8L14.2 -0.8L13.4 0.6L10 -1.2Z';
    f.sil(handle + blade).fill(handle, wood).fill(blade, '#8f959c');
  }
  if (tool === 'staff') {
    const staff = 'M5.6 -29.2Q6.6 -31 7.8 -29.8L7.2 -29.2Q6.6 -29.8 6.4 -29L6.6 0.2L5.6 0.2Z';
    f.sil(staff).fill(staff, wood);
  }
  if (tool === 'shuttle') f.sil('M4.2 -14.2l4.6 -0.8l0.3 1.4l-4.6 0.8Z').fill('M4.2 -14.2l4.6 -0.8l0.3 1.4l-4.6 0.8Z', '#c79a5b');
  f.sil(sleeve + hand).fill(sleeve, o.cloth).fill(hand, o.skin);
  if (tool === 'bread') {
    const bread = oval(7.2, -14.4, 2.6, 1.1);
    f.sil(bread).fill(bread, '#e8b86a').flat(disc(6.4, -14.6, 0.3) + disc(7.8, -14.2, 0.3), '#b9813d');
  }
  if (tool === 'glass') {
    const glass = 'M5 -18.2h1.8l-0.3 2.6h-1.2Z';
    f.sil(glass).fill(glass, '#f3e3cf').flat('M5.2 -17.4h1.4l-0.2 1.6h-1Z', '#b5432a');
  }
  return f.svg();
}

/** One leg in its trouser, hanging from the hip, its shoe at its foot (the men's and the boy's legs show; the women's dresses reach their feet). */
function leg(who: Villager, pal: Palette): string {
  const o = outfit(who, pal);
  const f = new Figure();
  const trouser = who === 'boy' ? 'M-1.6 0Q-2 6 -1.4 11.6L1.4 11.6Q2 6 1.6 0Z' : 'M-1.8 0Q-2.6 6 -1.5 11.6L1.5 11.6Q2.6 6 1.8 0Z';
  const shoe = 'M-1.6 11.2Q-1.9 13.4 0 13.4L2.5 13.3Q2.7 11.9 1.4 11.2Z';
  f.sil(trouser + shoe).fill(trouser, who === 'boy' ? o.band : o.cloth).flat('M0.3 0Q1.9 6 1.2 11.6L1.5 11.6Q2.6 6 1.8 0Z', who === 'boy' ? '#2f4a7a' : o.shade);
  f.line('M-1.5 10.6h3', 0.45).fill(shoe, '#3b2a22');
  return f.svg();
}

/** The rider on his donkey, from the waist down: his near leg over its side, his foot in the stirrup. */
function riderSeat(pal: Palette): string {
  const o = outfit('rider', pal);
  const f = new Figure();
  const thigh = 'M-2.2 -13.8Q3.2 -14.4 4.4 -11.6L4.2 -5.2L2.2 -5.2L2.2 -10.4Q0 -11.2 -2.4 -11.6Z';
  const shoe = 'M1.8 -5.6Q1.6 -3.4 3.4 -3.4L5.8 -3.6Q5.8 -5 4.4 -5.6Z';
  f.sil(thigh + shoe).fill(thigh, o.cloth).flat('M2.4 -12.6Q4.2 -12 4.4 -11.6L4.2 -5.2L3.2 -5.2Z', o.shade).fill(shoe, '#3b2a22');
  return f.svg();
}

/** Every person's layers, as sprites: their names and how each is drawn. */
export const VILLAGER_LAYERS = {
  shepherdBody: (pal: Palette) => manBody('shepherd', pal),
  shepherdHead: (pal: Palette) => manHead('shepherd', pal),
  shepherdArm: (pal: Palette) => workingArm('shepherd', 'staff', pal),
  shepherdLeg: (pal: Palette) => leg('shepherd', pal),
  farmerBody: (pal: Palette) => manBody('farmer', pal),
  farmerHead: (pal: Palette) => manHead('farmer', pal),
  farmerArm: (pal: Palette) => workingArm('farmer', 'hoe', pal),
  farmerLeg: (pal: Palette) => leg('farmer', pal),
  riderBody: (pal: Palette) => manBody('rider', pal),
  riderHead: (pal: Palette) => manHead('rider', pal),
  riderArm: (pal: Palette) => workingArm('rider', 'none', pal),
  riderSeat,
  elderBody: (pal: Palette) => manBody('elder', pal),
  elderHead: (pal: Palette) => manHead('elder', pal),
  elderArm: (pal: Palette) => workingArm('elder', 'glass', pal),
  elderLeg: (pal: Palette) => leg('elder', pal),
  bakerBody: (pal: Palette) => womanBody('baker', pal),
  bakerHead: (pal: Palette) => womanHead('baker', pal),
  bakerArm: (pal: Palette) => workingArm('baker', 'bread', pal),
  carrierBody: (pal: Palette) => womanBody('carrier', pal),
  carrierHead: (pal: Palette) => womanHead('carrier', pal),
  carrierArm: (pal: Palette) => workingArm('carrier', 'jar', pal),
  weaverBody: (pal: Palette) => womanBody('weaver', pal),
  weaverHead: (pal: Palette) => womanHead('weaver', pal),
  weaverArm: (pal: Palette) => workingArm('weaver', 'shuttle', pal),
  boyBody: (pal: Palette) => manBody('boy', pal),
  boyHead: (pal: Palette) => manHead('boy', pal),
  boyArm: (pal: Palette) => workingArm('boy', 'none', pal),
  boyLeg: (pal: Palette) => leg('boy', pal),
  girlBody: (pal: Palette) => womanBody('girl', pal),
  girlHead: (pal: Palette) => womanHead('girl', pal),
  girlArm: (pal: Palette) => workingArm('girl', 'none', pal),
} as const;
export type VillagerSprite = keyof typeof VILLAGER_LAYERS;

/** Each layer's box: a leg's from its hip, the rest the person's own. */
export const VILLAGER_SPRITE_BOX: Readonly<Record<VillagerSprite, { x: number; y: number; w: number; h: number }>> = Object.fromEntries(
  (Object.keys(VILLAGER_LAYERS) as VillagerSprite[]).map((s) => [s, s.endsWith('Leg') ? VILLAGER_LEG_BOX : VILLAGER_BOX]),
) as Record<VillagerSprite, { x: number; y: number; w: number; h: number }>;

/** Whether a person's legs show (the women's and the girl's dresses reach their feet). */
export const showsLegs = (who: Villager): boolean => !WOMEN.has(who);
export const isChild = (who: Villager): boolean => CHILDREN.has(who);
