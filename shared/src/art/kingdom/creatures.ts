/**
 * The valley's moving things as sprites, each drawn about its own origin in
 * its own small box, for the village's life (life.ts) to lay over the scene
 * and move: the animals in parts that move on their own (a body, a head that
 * grazes, legs that swing from the hip in a walk, a tail that swishes), the
 * water (shimmer on the lake, the waterfall's falling streaks and its foam,
 * a jumping fish, the mill's wheel turning), the wind (a gust running over a
 * field, a cloud's shadow sliding over the land, a cloth on the line), and
 * the camp's flame.
 *
 * Every animal faces right; the life turns it round by flipping it. Legs hang
 * from their top (the hip), so a leg turns about its own origin.
 */
import { n } from '../svg.js';
import { INK, Part, disc, oval, type Palette, type Tri } from './pen.js';
import { boat as boatMarkup, clothMarkup, flame as flameMarkup, stand } from './farm.js';

/** Each sprite's own box (its viewBox), its origin wherever it was drawn about. */
// one animal's body, head and tail share a box, so they lie over one another as layers
export const CREATURE_BOX = {
  fleece: { x: -14, y: -18, w: 32, h: 20 },
  goatBody: { x: -14, y: -24, w: 32, h: 26 },
  cow: { x: -22, y: -30, w: 44, h: 26 },
  cowHead: { x: -22, y: -30, w: 44, h: 26 },
  cowTail: { x: -22, y: -30, w: 44, h: 26 },
  donkey: { x: -20, y: -38, w: 44, h: 32 },
  donkeyHead: { x: -20, y: -38, w: 44, h: 32 },
  dogWalk: { x: -14, y: -25, w: 32, h: 22 },
  dogHead: { x: -14, y: -25, w: 32, h: 22 },
  legDark: { x: -1.2, y: 0, w: 2.4, h: 7 },
  legLight: { x: -1.4, y: 0, w: 2.8, h: 10 },
  legGrey: { x: -1.4, y: 0, w: 2.8, h: 11 },
  chick: { x: -3, y: -5, w: 6.4, h: 5.4 },
  catSleep: { x: -8, y: -8, w: 16, h: 8.4 },
  fish: { x: -5, y: -3, w: 10, h: 6 },
  shimmer: { x: -16, y: -3, w: 32, h: 6 },
  flow: { x: -14, y: 0, w: 28, h: 80 },
  foam: { x: -10, y: -8, w: 20, h: 10 },
  wheel: { x: -12, y: -12, w: 24, h: 24 },
  boat: { x: -17, y: -10, w: 34, h: 16 },
  gust: { x: -30, y: -6, w: 60, h: 12 },
  cloudShadow: { x: -40, y: -10, w: 80, h: 20 },
  flame: { x: -5, y: -11, w: 10, h: 11.5 },
  clothA: { x: -4, y: -2, w: 8, h: 11 },
  clothB: { x: -4, y: -2, w: 8, h: 11 },
  clothC: { x: -4, y: -2, w: 8, h: 13 },
  clothD: { x: -4, y: -2, w: 8, h: 11 },
  tree: { x: -24, y: -64, w: 48, h: 66 },
} as const;
export type CreatureSprite = keyof typeof CREATURE_BOX;

/** A fat-tailed sheep's fleece without its legs (the life hangs them on): round lobes, lit on the left, the curls marked. */
function fleece(pal: Palette): string {
  const p = new Part(0);
  const lobes: [number, number, number][] = [[-7, -9, 5], [-2, -11.5, 5.6], [3.6, -10.6, 5], [7.4, -8.4, 4.2], [-9.6, -6.4, 4], [0, -6.4, 6.2], [-11.2, -9.6, 3.2]];
  for (const [x, y, r] of lobes) p.sil(disc(x, y, r));
  p.flat(lobes.map(([x, y, r]) => disc(x, y, r)).join(''), pal.dusk ? '#c9b9a4' : '#dccbb0');
  p.flat(lobes.map(([x, y, r]) => disc(x - r * 0.15, y - r * 0.2, r * 0.8)).join(''), pal.dusk ? '#e9dccb' : '#fffaf0');
  p.line('M-6 -10q1.6 1.6 3.2 0M1 -12.4q1.6 1.6 3.2 0M-3 -6q1.6 1.6 3.2 0', 0.7);
  return p.svg();
}

/** A black goat's body without its legs: long hair hanging in a fringe, a short tail up. */
function goatBody(pal: Palette): string {
  const p = new Part(0);
  const body = 'M-10 -14q8 -3.6 19.6 -0.4q2.6 3 1 6.4l-1.2 2.4l-1.4 -1.2l-1.2 2l-1.6 -1.6l-1.4 2l-1.6 -1.8l-1.6 2l-1.6 -1.8l-1.6 2l-1.4 -1.8l-1.6 1.6l-1.4 -2l-1.8 0.8q-2.6 -5 0.4 -9Z';
  const tail = 'M-10 -13.4l-2.6 -3.4l1.8 -0.4l2.4 2.6Z';
  p.sil(body + tail).fill(tail, '#3a2c26').fill(body, pal.dusk ? '#3b2e29' : '#47362f');
  p.flat('M-7 -14.4q7 -2.6 15 -0.6q-6 0.6 -15 2.8Z', pal.dusk ? '#55443b' : '#66524a');
  return p.svg();
}

/** A small brown mountain cow (facing right), the hardy kind the high villages keep: a cream belly and muzzle, a dark line down her back. */
function cow(pal: Palette): string {
  const p = new Part(0);
  const body = 'M-16 -20q2 -3.6 8 -3.4h14q6 0 8 3.6q1.4 4 -0.6 8.6q-1.4 2.4 -5 2.6h-17.4q-4.4 -0.4 -6.2 -3.4q-1.6 -4 -0.8 -8Z';
  const brown = pal.dusk ? '#94573a' : '#b0683f';
  p.sil(body).fill(body, brown);
  p.flat('M-14 -11q8 3 26 0q-1 2.6 -4.6 2.8h-17.2q-3 -0.4 -4.2 -2.8Z', pal.dusk ? '#e3cfb3' : '#f3e2c4');
  p.flat('M-14 -21q10 -3 26 0q-12 -1 -26 2Z', pal.dusk ? '#6e3f2a' : '#7e4529');
  p.flat('M0 -20q6 -1 10 1q2 4 -1 6q-6 1 -9 -2q-2 -3 0 -5Z', pal.dusk ? '#7e4a31' : '#99573a');
  return p.svg();
}

/** The cow's head: short curved horns, ears out to the side, a pale muzzle. */
function cowHead(pal: Palette): string {
  const p = new Part(0);
  const head = 'M10 -24q4 -2 7 0.4q2.6 2.6 2 7q-0.6 2.6 -3.4 3q-3.6 0.2 -5 -2.8q-1.6 -4 -0.6 -7.6Z';
  const ear = 'M10.6 -21.6q-3.4 -1 -4.6 0.8q2 1.4 4.8 0.8Z';
  const horns = 'M12 -24.4q-1.4 -3.6 0.8 -4.6q-0.4 2.4 1 4.2ZM16 -24.2q1.6 -3.4 -0.2 -4.8q0.2 2.4 -1.2 4.4Z';
  p.sil(head + ear + horns).fill(horns, '#efe3cc').fill(ear, pal.dusk ? '#7e4a31' : '#99573a').fill(head, pal.dusk ? '#94573a' : '#b0683f');
  p.flat('M14 -17q3.4 -0.6 5.2 0.8q-0.4 2.4 -2.4 2.8q-2.4 0 -2.8 -3.6Z', pal.dusk ? '#e3cfb3' : '#f3e2c4');
  p.flat(disc(14.6, -21, 0.7), INK).flat(disc(17.4, -15.6, 0.45), INK);
  return p.svg();
}

/** The cow's tail, from her rump down, its brush dark, to swish. */
function cowTail(pal: Palette): string {
  const p = new Part(0);
  p.line('M-16 -19q-3 2 -2.6 9', 2.4).line('M-16 -19q-3 2 -2.6 9', 1, pal.dusk ? '#94573a' : '#b0683f');
  p.sil(oval(-18.4, -9, 1.4, 2.4)).fill(oval(-18.4, -9, 1.4, 2.4), '#3c2a22');
  return p.svg();
}

/** A grey donkey (facing right): a pale belly and muzzle, a dark stripe over the shoulders. */
function donkey(pal: Palette): string {
  const p = new Part(0);
  const body = 'M-14 -22q2 -3 7 -3h12q5 0 7 3q1.6 4 0 8q-1.4 3 -4.6 3h-16q-4 0 -5.6 -3q-1.6 -4 0.2 -8Z';
  const tail = 'M-14 -21q-3.2 1 -3.4 7l1.4 0.4q0 -4.6 2.4 -6Z';
  const grey = pal.dusk ? '#857c78' : '#9c928c';
  p.sil(body + tail).fill(tail, '#4a403c').fill(body, grey);
  p.flat('M-12 -13.6q8 2.6 22 0q-1 2.6 -4 2.6h-14.6q-2.6 -0.2 -3.4 -2.6Z', pal.dusk ? '#cfc7c0' : '#e4ddd6');
  p.line('M2 -25l1 6', 1.2, '#4a403c');
  return p.svg();
}

/** The donkey's head: long ears up, a pale muzzle, a short dark mane. */
function donkeyHead(pal: Palette): string {
  const p = new Part(0);
  const neck = 'M6 -24q4 -6 9 -7q3 0 4.6 3q1.6 4 0.6 7.6q-1 2 -3 1.6l-3 -2q-3.6 1.6 -7.2 -0.4Z';
  const ears = 'M12.6 -30.4q-1.6 -5 0.4 -6.4q1.4 2.6 1.2 6.2ZM15 -30.6q0.4 -5.2 2.4 -5.8q0.6 3 -0.8 6.2Z';
  p.sil(neck + ears).fill(ears, pal.dusk ? '#857c78' : '#9c928c').fill(neck, pal.dusk ? '#857c78' : '#9c928c');
  p.flat('M16.6 -22.4q2.6 0 3.4 1.4q-0.4 2 -2 2.2q-1.8 -0.4 -1.4 -3.6Z', pal.dusk ? '#cfc7c0' : '#e4ddd6');
  p.line('M7 -24.4q3 -5 7 -6.4', 1.6, '#4a403c').flat(disc(15.6, -26, 0.7), INK);
  return p.svg();
}

/** The shepherd's dog trotting (facing right), without its legs: fawn, a dark saddle. */
function dogWalk(pal: Palette): string {
  const p = new Part(0);
  const body = 'M-9 -14q1 -3 6 -3h9q4 0 5.4 2.6q1 3 -0.4 5.4q-1.4 2 -4 2h-11q-4 0 -5 -2.6q-1 -2.4 0 -4.4Z';
  p.sil(body).fill(body, pal.dusk ? '#c9a46f' : '#e2bf86');
  p.flat('M-6 -16.4q6 -1.6 12 0q-1 3 -6 3q-5 0 -6 -3Z', pal.dusk ? '#6e5038' : '#7d5a3e');
  return p.svg();
}

/** The dog's head as it trots: ears pricked, a dark muzzle, and its tail up behind. */
function dogHead(pal: Palette): string {
  const p = new Part(0);
  const head = 'M6 -15q0.6 -4.4 4.6 -5q4 -0.4 5.2 2.8q0.8 2.2 -0.8 4l-3.4 1.2q-3.6 0.4 -5.6 -3Z';
  const muzzle = 'M12.8 -16.4q2.6 -0.4 3.2 1.6q-0.6 1.8 -3 2q-1.6 -1.4 -0.2 -3.6Z';
  const ears = 'M7.6 -19.4l-0.6 -3.4l2.6 2ZM10.6 -20.4l0.4 -3.4l1.8 2.8Z';
  const tail = 'M-9 -14q-3.6 -2 -3 -6.6q1.6 3.4 3.6 4.6Z';
  p.sil(head + ears + tail).fill(tail, pal.dusk ? '#c9a46f' : '#e2bf86').fill(ears, '#4a3428').fill(head, pal.dusk ? '#d3ae78' : '#ebc890').fill(muzzle, '#3e2c24');
  p.flat(disc(11, -17.4, 0.65), INK);
  return p.svg();
}

/** A leg, hanging from the hip at its origin: dark for sheep and goats, pale for the cow and the dog, grey for the donkey; a hoof or a paw at its foot. */
function leg(tone: string, foot: string, w: number, h: number): string {
  return `<path d="M0 0.4V${n(h - 1)}" fill="none" stroke="${INK}" stroke-width="${n(w + 1.2)}"/><path d="M0 0.4V${n(h - 1)}" fill="none" stroke="${tone}" stroke-width="${n(w)}"/><path d="${oval(0.2, h - 1, w * 0.62, 0.8)}" fill="${foot}" stroke-width="0.6"/>`;
}

/** A chick, round and yellow, its beak to the right. */
function chick(pal: Palette): string {
  const p = new Part(0);
  p.line('M-0.6 -1v1M0.8 -1v1', 0.7, '#e0a52e');
  p.sil(disc(0, -2.6, 2.2) + disc(1.8, -3.8, 1.3)).flat(disc(0, -2.6, 2.2) + disc(1.8, -3.8, 1.3), pal.dusk ? '#e9c552' : '#ffd84a');
  p.flat(disc(-0.5, -3, 1.2), pal.dusk ? '#f3d977' : '#ffe98a').fill('M3 -4l1.2 0.4l-1.2 0.4Z', '#f08a24', ' stroke-width="0.4"').flat(disc(2.1, -4.1, 0.35), INK);
  return p.svg();
}

/** The cat asleep on a roof, curled into a ginger ring, its tail over its nose. */
function catSleep(pal: Palette): string {
  const p = new Part(0);
  const body = 'M-7 0q-1 -6 4 -7.4q5 -1.4 8.4 1.6q2.4 2.6 1.2 5.8Z';
  const head = 'M2.4 -3.6q0.2 -3 3 -3.4l0.8 -1.4l1 1.6q1.4 1 1 3.2q-0.6 2.6 -3.2 2.6q-2.4 0 -2.6 -2.6Z';
  p.sil(body + head).fill(body, pal.dusk ? '#c8813f' : '#e8964a').fill(head, pal.dusk ? '#d38c48' : '#f0a457');
  p.line('M-4.6 -4.4q1.2 0.8 2.4 0M-1.6 -5.6q1.2 0.8 2.4 0M4.2 -3.6q0.8 0.6 1.6 0', 0.6, '#a85a22');
  p.line('M-6.6 -0.4q4 1.6 10 0.2', 1.6, pal.dusk ? '#c8813f' : '#e8964a');
  return p.svg();
}

/** A fish leaping, silver with a blue back, curved as it jumps. */
function fish(pal: Palette): string {
  const p = new Part(0);
  const body = 'M-4.6 0.4q2.4 -3.4 6.6 -2.6q2.2 0.6 2.6 2q-1.4 1.6 -3.6 1.6q-3.6 0.4 -5.6 -1ZM-4.6 0.4l-1.4 -2l0.2 3.6Z';
  p.sil(body).fill(body, pal.dusk ? '#b9c6d4' : '#dfe8ef').flat('M-3 -1q2.4 -2 5.4 -1.4q-2.6 0.4 -5.4 1.4Z', pal.water.right).flat(disc(2.6, -0.8, 0.4), INK);
  return p.svg();
}

/** Light glancing off the lake: three short strokes of foam, the middle one longest. */
function shimmer(pal: Palette): string {
  return `<path d="M-14 0q4 -1.6 8 0M-4 -1q6 -2 12 0M10 0.6q2.6 -1 5 0" fill="none" stroke="${pal.dusk ? '#c9e2f2' : '#ffffff'}" stroke-width="1.6"/>`;
}

/** The waterfall's falling streaks, twice as tall as they show, to slide down in a loop. */
function flow(): string {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const x = -11 + i * 4.4;
    for (let k = 0; k < 4; k++) d += `M${n(x + (i % 2) * 0.6)} ${n(k * 20 + (i % 3) * 6)}l${n(i % 2 ? 0.6 : -0.4)} ${n(9 + (i % 2) * 3)}`;
  }
  return `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="1.8"/>`;
}

/** A heap of foam where the water lands. */
function foam(pal: Palette): string {
  const d = disc(-5, -3, 4.4) + disc(1, -4.6, 5) + disc(6, -2.6, 3.8) + oval(0, 0, 9.4, 2.4);
  return `<path d="${d}" fill="#ffffff" stroke="${pal.foam}" stroke-width="1"/>`;
}

/** The mill's wheel, face on (the life sets it on its edge by squashing it): rim, eight spokes, eight paddles. */
function wheel(pal: Palette): string {
  let spokes = '';
  let paddles = '';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    spokes += `M0 0L${n(c * 9)} ${n(s * 9)}`;
    paddles += `M${n(c * 8)} ${n(s * 8)}L${n(c * 11.4)} ${n(s * 11.4)}`;
  }
  return (
    `<path d="${disc(0, 0, 9)}" fill="none" stroke="${INK}" stroke-width="3.6"/><path d="${disc(0, 0, 9)}" fill="none" stroke="${pal.wood.left}" stroke-width="1.8"/>` +
    `<path d="${spokes}" fill="none" stroke="${INK}" stroke-width="1.2"/><path d="${paddles}" fill="none" stroke="${INK}" stroke-width="3.8"/><path d="${paddles}" fill="none" stroke="${pal.wood.top}" stroke-width="2"/>` +
    `<path d="${disc(0, 0, 2)}" fill="${pal.woodDark.left}" stroke="${INK}" stroke-width="0.8"/>`
  );
}

/** A gust running over a field: a lens of light on the crop. */
function gust(pal: Palette): string {
  return `<path d="M-28 0Q-14 -5.6 0 -5.6Q14 -5.6 28 0Q14 5 0 5Q-14 5 -28 0Z" fill="${pal.dusk ? '#f3e2b0' : '#fff6d2'}" fill-opacity="0.45" stroke="none"/>`;
}

/** A cloud's shadow on the ground, soft and flat. */
function cloudShadow(): string {
  const d = disc(-22, 0, 9) + disc(-6, -3, 11) + disc(12, -1, 10) + oval(0, 3, 34, 6);
  return `<path d="${d}" fill="${INK}" fill-opacity="0.09" stroke="none"/>`;
}

/** A tree to sway, rooted at its origin: a round-crowned tree as the valley's stands draw it. */
function tree(pal: Palette): string {
  return stand(pal, [{ x: 0, y: 0, h: 58, kind: 'round' }], 0).svg();
}

const CLOTH_TONES = (pal: Palette): readonly Tri[] => [pal.indigo, pal.red, pal.cream, pal.saffron];

/** Each creature's drawing, by day or at dusk. */
export const CREATURES: Readonly<Record<CreatureSprite, (pal: Palette) => string>> = {
  fleece,
  goatBody,
  cow,
  cowHead,
  cowTail,
  donkey,
  donkeyHead,
  dogWalk,
  dogHead,
  legDark: () => leg('#4b3a33', '#2c211d', 1.6, 7),
  legLight: (pal) => leg(pal.dusk ? '#d8c3a2' : '#efe0c6', '#3c2a22', 2, 10),
  legGrey: (pal) => leg(pal.dusk ? '#857c78' : '#9c928c', '#3c3533', 2, 11),
  chick,
  catSleep,
  fish,
  shimmer,
  flow: () => flow(),
  foam,
  wheel,
  boat: (pal) => boatMarkup(pal, 0, 4),
  gust,
  cloudShadow: () => cloudShadow(),
  flame: (pal) => flameMarkup(pal, 0, 0),
  clothA: (pal) => clothMarkup(CLOTH_TONES(pal)[0]!, 0, 0, 0),
  clothB: (pal) => clothMarkup(CLOTH_TONES(pal)[1]!, 0, 0, 1),
  clothC: (pal) => clothMarkup(CLOTH_TONES(pal)[2]!, 0, 0, 2),
  clothD: (pal) => clothMarkup(CLOTH_TONES(pal)[3]!, 0, 0, 3),
  tree,
};
