/**
 * The little scenes that lean in from the screen's edge beside the lesson road (path-world.ts `pathScene`), in the
 * painted valley style: Hevalo putting his head in under an apple bough to eat its apple, Hamo leaning in with his tea
 * on a tray and too much sugar, Xezo peeking in with her slate to chalk Kurmanji's own letters, and the pigeon landing
 * on a twig with a letter. Nothing stands on a block: everything comes in from the edge, which crops it. The characters
 * are their own rigs, which the apps draw between these props (`PATH_SCENES` says where); each prop is its own small
 * picture so the apps can move it.
 */
import type { CharacterCrop, CharacterId } from '../characters/index.js';
import { n, n2, prefixFor } from './svg.js';
import { VALLEY, dusk, ellipsePath, fill, stroke } from './valley.js';

/** Who plays the scene, and what it is. */
export const PATH_SCENE_IDS = ['apple', 'tea', 'slate', 'letter'] as const;
export type PathSceneId = (typeof PATH_SCENE_IDS)[number];

/** A box in a scene's points, from its top left. */
export interface SceneBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A scene's box, in points, its left side on the screen's edge for a scene on the road's start side (the apps mirror
 * it on the other). The apps cut it off at that edge, and at its foot unless its layout says the character runs on
 * below (`below`) to leave the screen by the edge.
 */
export const PATH_SCENE_BOX = { w: 150, h: 164 } as const;

/**
 * Where everything in a scene stands. `actor` is the character: its crop drawn `h` high, the middle of its foot at
 * (`ax`, `ay`), leaning in `lean` degrees about that point, so all but what leans in is past the edge; the pigeon is
 * drawn from the letters' art with its feet at that point. `below` is how far past the box's foot the character runs on
 * before it is gone past the edge, so the apps let it show that far. `back` props are behind the actor and `front` ones
 * before it; a prop named in `gives` turns about its root at the edge when tugged or landed on.
 */
export interface SceneLayout {
  who: CharacterId | 'pigeon';
  actor: { crop: CharacterCrop; h: number; ax: number; ay: number; lean: number };
  below: number;
  back: Readonly<Record<string, SceneBox>>;
  front: Readonly<Record<string, SceneBox>>;
  gives: Readonly<Record<string, { x: number; y: number }>>;
}

export const PATH_SCENES: Readonly<Record<PathSceneId, SceneLayout>> = {
  apple: {
    who: 'hevalo',
    actor: { crop: 'half', h: 157, ax: -31, ay: 198, lean: 40 },
    below: 60,
    // The bough is behind his head, its twig running down behind it; only the apple, on its short stalk, is in front.
    back: { bough: { x: 0, y: 10, w: 120, h: 100 } },
    front: {},
    gives: { bough: { x: 0, y: 32 } },
  },
  tea: {
    who: 'hamo',
    actor: { crop: 'half', h: 126, ax: -30, ay: 176, lean: 32 },
    below: 0,
    back: {},
    front: { tray: { x: 0, y: 118, w: 104, h: 46 } },
    gives: {},
  },
  slate: {
    who: 'xezo',
    actor: { crop: 'half', h: 128, ax: -22, ay: 178, lean: 26 },
    below: 0,
    back: {},
    front: { slate: { x: 0, y: 112, w: 96, h: 52 } },
    gives: {},
  },
  letter: {
    who: 'pigeon',
    actor: { crop: 'full', h: 64, ax: 108, ay: 66, lean: 0 },
    below: 0,
    back: {},
    front: { twig: { x: 0, y: 30, w: 136, h: 64 } },
    gives: { twig: { x: 0, y: 66 } },
  },
};

/** Where the apple hangs at his mouth, its bites toward him: the top of its canvas, on the scene; its short stalk starts 11 points lower. */
export const PATH_APPLE_AT = { x: 39, y: 108 } as const;

/** Where the sugar bowl and the glass stand on the tray, on the scene: the cubes hop from one to the other. */
export const PATH_TEA_AT = { bowl: { x: 66, y: 140 }, glass: { x: 40, y: 128 } } as const;

/** The sprites the scenes move: the apple as it is eaten and its crumbs, a sugar cube and its splash, steam, and the slate's letters. */
export const PATH_SCENE_SPRITES = ['apple-0', 'apple-1', 'apple-2', 'apple-3', 'apple-4', 'core', 'crumbs', 'cube', 'splash', 'steam', 'letter-e', 'letter-c', 'letter-s', 'hic'] as const;
export type PathSceneSprite = (typeof PATH_SCENE_SPRITES)[number];

/** Each sprite's own canvas, in points; the apps lay it at the size it is drawn. The apple's canvas starts a little above its short stalk. */
export const PATH_SCENE_SPRITE_BOX: Readonly<Record<PathSceneSprite, { w: number; h: number }>> = {
  'apple-0': { w: 30, h: 40 },
  'apple-1': { w: 30, h: 40 },
  'apple-2': { w: 30, h: 40 },
  'apple-3': { w: 30, h: 40 },
  'apple-4': { w: 30, h: 40 },
  core: { w: 30, h: 40 },
  crumbs: { w: 12, h: 10 },
  cube: { w: 8, h: 8 },
  splash: { w: 16, h: 8 },
  steam: { w: 14, h: 24 },
  'letter-e': { w: 12, h: 20 },
  'letter-c': { w: 12, h: 20 },
  'letter-s': { w: 12, h: 20 },
  hic: { w: 14, h: 12 },
};

/** Where the slate's three letters are chalked, on the scene (for the start side). */
export const PATH_SLATE_LETTERS: readonly { sprite: PathSceneSprite; x: number; y: number }[] = [
  { sprite: 'letter-e', x: 26, y: 128 },
  { sprite: 'letter-c', x: 42, y: 127 },
  { sprite: 'letter-s', x: 58, y: 126 },
];

export interface PathScenePropOptions {
  scene: PathSceneId;
  /** A prop of the scene's layout (`back` or `front`), by name. */
  prop: string;
  dark?: boolean;
  /** Display width in points; the height follows the prop's box. */
  width?: number;
  idPrefix?: string;
}

const WOOD = { face: '#b8773e', light: '#d39457', shade: '#8a5428', dark: '#5e3518' } as const;

/** A scene's prop, decorative. */
export function pathScenePropSvg(opts: PathScenePropOptions): string {
  const { scene, prop, dark = false } = opts;
  const layout = PATH_SCENES[scene];
  if (!layout) throw new RangeError(`art: no scene ${String(scene)}`);
  const box = layout.back[prop] ?? layout.front[prop];
  const draw = PROPS[`${scene}:${prop}`];
  if (!box || !draw) throw new RangeError(`art: no prop ${String(prop)} in the ${scene} scene`);
  const c = (hex: string, amount = 0.14): string => dusk(hex, dark, amount);
  const prefix = prefixFor(opts.idPrefix, 'scene', scene, prop, dark);
  return wrap(prefix, opts.width ?? box.w, box, draw(c, dark, prefix));
}

export interface PathSceneSpriteOptions {
  sprite: PathSceneSprite;
  dark?: boolean;
  /** Display width in points; the height follows the sprite's canvas. */
  width?: number;
  idPrefix?: string;
}

/** A moving piece of a scene on its own canvas, decorative. */
export function pathSceneSpriteSvg(opts: PathSceneSpriteOptions): string {
  const { sprite, dark = false } = opts;
  const view = PATH_SCENE_SPRITE_BOX[sprite];
  if (!view) throw new RangeError(`art: no scene sprite ${String(sprite)}`);
  const c = (hex: string, amount = 0.14): string => dusk(hex, dark, amount);
  const prefix = prefixFor(opts.idPrefix, 'scene-sprite', sprite, dark);
  return wrap(prefix, opts.width ?? view.w, { x: 0, y: 0, ...view }, SPRITES[sprite](c, dark, prefix));
}

function wrap(prefix: string, width: number, box: SceneBox, body: string): string {
  if (!(width > 0) || !Number.isFinite(width)) throw new RangeError(`art: width must be a positive number, got ${String(width)}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(width)}" height="${n2((width * box.h) / box.w)}" viewBox="${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}" aria-hidden="true" focusable="false" id="${prefix}">${body}</svg>`;
}

type Paint = (c: (hex: string, amount?: number) => string, dark: boolean, prefix: string) => string;

/**
 * A leaf from its base along `angle` degrees, `len` long: a lit face and its shaded half beyond the midrib, the way a
 * leaf folds a little along its vein.
 */
function leaf(x: number, y: number, len: number, angle: number, face: string, shade: string): string {
  const a = (angle * Math.PI) / 180;
  const [ux, uy] = [Math.cos(a), Math.sin(a)];
  const [vx, vy] = [-uy, ux];
  const p = (u: number, v: number): string => `${n(x + ux * u * len + vx * v * len)} ${n(y + uy * u * len + vy * v * len)}`;
  return fill(`M${p(0, 0)}C${p(0.3, 0.4)} ${p(0.75, 0.32)} ${p(1, 0)}C${p(0.75, -0.3)} ${p(0.3, -0.36)} ${p(0, 0)}Z`, face) + fill(`M${p(0.04, 0)}L${p(1, 0)}C${p(0.75, -0.3)} ${p(0.3, -0.36)} ${p(0.04, 0)}Z`, shade);
}

const PROPS: Readonly<Record<string, Paint>> = {
  // An apple bough reaching in from the edge over Hevalo's antlers, a twig dropping from it behind his head to where the
  // apple hangs at his mouth, its leaves in two layers: the far ones darker, the near ones lit.
  'apple:bough': (c) => {
    const far = { face: c(VALLEY.leafShade), shade: c('#3e6c33') };
    const near = { face: c(VALLEY.leafLight), shade: c(VALLEY.leaf) };
    let out = leaf(18, 18, 20, -150, far.face, far.shade) + leaf(52, 14, 22, -62, far.face, far.shade) + leaf(84, 26, 19, -20, far.face, far.shade);
    out += fill('M-4 18C20 13 46 13 70 20C84 24 96 30 106 40C96 33 84 29 70 27C48 21 22 21 -4 26Z', c(VALLEY.trunk));
    out += fill('M-4 18C20 13 46 13 70 20C84 24 96 30 106 40C92 30 78 25 66 23C44 18 20 18 -4 21Z', c('#a3714a'));
    // The twig the apple hangs from.
    out += stroke('M34 21C39 36 41 58 40 76', c(VALLEY.trunk), 2.2) + stroke('M40 76L39 98', c(VALLEY.trunk), 1.5);
    out += leaf(30, 18, 21, 150, near.face, near.shade) + leaf(64, 22, 23, 32, near.face, near.shade) + leaf(96, 34, 18, 70, near.face, near.shade);
    out += leaf(39, 40, 17, -20, near.face, near.shade) + leaf(40, 56, 14, 200, far.face, far.shade);
    // Drawn from the bough's own top, lowered to where it reaches in over his head.
    return `<g transform="translate(0 10)">${out}</g>`;
  },
  // Hamo's small copper tray, held out from the edge and tipped toward us a little, lit along its near rim; on it the
  // blue sugar bowl heaped with cubes and his glass of tea on its saucer.
  'tea:tray': (c) =>
    // Held low enough that its rim meets the scene's foot, so nothing shows between the two.
    `<g transform="translate(0 6)"><g transform="rotate(-6 0 150)">` +
    fill(ellipsePath(34, 152, 56, 9.5), c('#9c5528')) +
    fill(ellipsePath(34, 149.6, 56, 9.5), c('#cf7f45')) +
    fill(ellipsePath(34, 148.8, 49, 7), c('#e09a5e')) +
    '</g>' +
    fill('M56 128H78Q76 140 67 141Q58 140 56 128Z', c('#2f6fa8')) +
    fill('M72 128H78Q76 140 67 141Q73 136 72 128Z', c('#22527e')) +
    fill(ellipsePath(67, 128, 11, 2.4), c('#e8eef3')) +
    fill('M60 122h5.6v5.6h-5.6ZM65.6 120.4h5.6v5.6h-5.6ZM70 123.4h5v4.6h-5Z', c('#ffffff')) +
    fill(ellipsePath(40, 144, 12, 3), c('#ffffff')) +
    stroke('M30 144.6Q40 148 50 144.6', c(VALLEY.red), 1.3) +
    fill('M32.6 118H47.4Q44 126 46.4 136Q47.8 142 40 142Q32.2 142 33.6 136Q36 126 32.6 118Z', c('#fff7ea')) +
    fill('M34.4 122H45.6Q42.8 128 44.8 136Q45.8 140.4 40 140.4Q34.2 140.4 35.2 136Q37.2 128 34.4 122Z', c('#b4421c')) +
    stroke('M36.6 124Q38 130 36.8 136', c('#ffffff'), 1.3) +
    '</g>',
  // Xezo's own slate, held in from the edge and tipped a little: a wooden frame round the board, chalk dust in its corner.
  'slate:slate': (c) =>
    `<g transform="rotate(-5 40 140)">` +
    fill('M-12 116H86Q90 116 90 120V158Q90 162 86 162H-12Z', c(WOOD.face)) +
    fill('M86 116Q90 116 90 120V158Q90 162 86 162H84V118Z', c(WOOD.shade)) +
    fill('M-12 121H82V157H-12Z', c('#2e4a3d')) +
    fill('M-12 121H82V124H-12Z', c('#3a5a4b')) +
    fill(ellipsePath(73, 151, 5, 2), c('#5a7a6a')) +
    '</g>',
  // A twig with a few leaves and an apple blossom, reaching in from the edge: the pigeon's landing place.
  'letter:twig': (c) => {
    const near = { face: c(VALLEY.leafLight), shade: c(VALLEY.leaf) };
    let out = fill('M-4 64C30 60 64 60 92 62C104 63 116 64 124 66C114 66 102 66 92 66C64 66 30 66 -4 70Z', c(VALLEY.trunk));
    out += fill('M-4 64C30 60 64 60 92 62C104 63 116 64 124 66C112 64 100 63.6 90 63.6C62 62.6 30 62.6 -4 66Z', c('#a3714a'));
    out += stroke('M60 63C64 54 70 48 78 44', c(VALLEY.trunk), 1.6);
    out += leaf(30, 62, 18, -140, c(VALLEY.leafShade), c('#3e6c33')) + leaf(78, 44, 16, -40, near.face, near.shade) + leaf(52, 64, 17, 60, near.face, near.shade) + leaf(96, 64, 14, 30, near.face, near.shade);
    for (const [x, y] of [[70, 50], [24, 58]] as const) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        out += fill(ellipsePath(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2.2, 2.2), c(VALLEY.blossomWhite));
      }
      out += fill(ellipsePath(x, y, 1.3, 1.3), c('#f2b632'));
    }
    return out;
  },
};

/** The apple's outline after `bites` bites taken from its side toward Hevalo, sampled round and pushed in where a bite took it. */
function bittenApple(bites: number): { outline: string; marks: string } {
  const cx = 15;
  const cy = 26;
  const r = 11.5;
  const holes = [
    { x: 3.8, y: 22, r: 5.6 },
    { x: 4.6, y: 31.5, r: 5.8 },
    { x: 10, y: 16, r: 5.2 },
    { x: 11, y: 37, r: 5.2 },
  ].slice(0, bites);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 56; i++) {
    const a = (i / 56) * Math.PI * 2 - Math.PI / 2;
    // An apple's shoulders: wider at the top, a dip at the stalk.
    const k = 1 + 0.06 * Math.sin(a) - 0.1 * Math.max(0, -Math.sin(a)) ** 6;
    let x = cx + Math.cos(a) * r * k * 1.04;
    let y = cy + Math.sin(a) * r * k;
    for (const h of holes) {
      const d = Math.hypot(x - h.x, y - h.y);
      if (d < h.r) {
        // Pushed to the bite's edge, toward the apple's middle.
        const t = (h.r - d) / h.r;
        x -= (x - cx) * t * 0.9;
        y -= (y - cy) * t * 0.9;
      }
    }
    pts.push([x, y]);
  }
  const outline = `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;
  // The white flesh showing where each bite went in.
  const marks = holes.map((h) => ellipsePath(h.x + 2, h.y, h.r * 0.74, h.r * 0.84)).join('');
  return { outline, marks };
}

/** The apple on its short stalk with `bites` bites out of it, lit from the upper left, one highlight and its shaded side. */
function apple(bites: number, c: (hex: string, amount?: number) => string, prefix: string): string {
  const { outline, marks } = bittenApple(bites);
  const clip = `${prefix}a`;
  let out = stroke('M15 11Q15.3 13 15 15', c(WOOD.dark), 1.6);
  out += `<defs><clipPath id="${clip}"><path d="${outline}"/></clipPath></defs>`;
  out += fill(outline, c('#c43a2e'));
  out += `<g clip-path="url(#${clip})">`;
  // Its shaded side, cut by the apple's own outline so bites cut it too.
  out += fill('M27 22C28 32 22 40 14 39C20 36 25 30 27 22Z', c('#9c2a22'));
  if (bites > 0) out += fill(marks, c('#fbf0d6'));
  out += '</g>';
  // One highlight where the light falls.
  out += fill(ellipsePath(10.4, 19, 2.4, 1.6), c('#ffd9cc'));
  return out;
}

/** The core left once the apple is eaten: its waist bitten to the pips, the stalk still on it. */
function appleCore(c: (hex: string, amount?: number) => string): string {
  return (
    stroke('M15 11V14', c(WOOD.dark), 1.6) +
    fill('M7 15Q15 11 23 15Q24 19 19 22Q16 25 16 29Q16 33 20 36Q22 39 15 40Q8 39 10 36Q14 33 14 29Q14 25 11 22Q6 19 7 15Z', c('#fbf0d6')) +
    fill('M7 15Q15 11 23 15Q22 17.4 15 17.4Q8 17.4 7 15ZM10 36Q15 37.4 20 36Q22 39 15 40Q8 39 10 36Z', c('#c43a2e')) +
    fill(ellipsePath(14.2, 27, 1, 1.6) + ellipsePath(15.8, 30, 1, 1.6), c('#4a2a1a'))
  );
}

const SPRITES: Readonly<Record<PathSceneSprite, Paint>> = {
  'apple-0': (c, _dark, prefix) => apple(0, c, prefix),
  'apple-1': (c, _dark, prefix) => apple(1, c, prefix),
  'apple-2': (c, _dark, prefix) => apple(2, c, prefix),
  'apple-3': (c, _dark, prefix) => apple(3, c, prefix),
  'apple-4': (c, _dark, prefix) => apple(4, c, prefix),
  core: (c) => appleCore(c),
  crumbs: (c) => fill(ellipsePath(3, 3, 1.4, 1.2) + ellipsePath(8, 5, 1.2, 1) + ellipsePath(5, 8.4, 1, 0.9), c('#fbf0d6')) + fill(ellipsePath(9.6, 1.6, 1, 0.8), c('#c43a2e')),
  cube: (c) => fill('M1 2.6h5v5h-5Z', c('#ffffff')) + fill('M1 2.6l1.6 -1.6h5l-1.6 1.6Z', c('#eef2f5')) + fill('M6 2.6l1.6 -1.6v5l-1.6 1.6Z', c('#d0d9e0')),
  splash: (c) => stroke('M2 6Q4 2 6 5M10 5Q12 2 14 6', c('#d9773f'), 1.2) + fill(ellipsePath(8, 3, 1, 1), c('#d9773f')),
  // Two wisps curling up off the glass, the nearer one a little brighter.
  steam: (_c, dark) =>
    `<path d="M5.6 23.6C2.6 19.4 8.6 16 6.4 11.6C4.8 8.6 6.8 5 8.6 1.6C8.8 4.8 7.4 8 8.8 11.2C10.8 16 5 19 7.2 23.6Z" fill="${dark ? '#c9cfdc' : '#a9b6be'}" fill-opacity="0.7"/>` +
    `<path d="M9.4 22.4C8 19.6 11.6 17.4 10.4 14.4C9.8 12.8 10.6 10.8 11.8 9.2C11.8 11.2 11.2 12.8 11.8 14.6C12.8 17.6 10 19.6 10.6 22.4Z" fill="${dark ? '#c9cfdc' : '#a9b6be'}" fill-opacity="0.45"/>`,
  'letter-e': () => stroke('M2.4 11H9.8Q9.8 6.6 6.2 6.6Q2.4 6.6 2.4 11.4Q2.4 16.4 6.6 16.4Q8.6 16.4 9.8 15M3.6 4L6.1 1.6L8.6 4', '#f2f0e6', 1.7),
  'letter-c': () => stroke('M9.8 8.2Q8.8 6.6 6.4 6.6Q2.4 6.6 2.4 11.4Q2.4 16.4 6.4 16.4Q8.8 16.4 9.8 14.8M6.2 16.6L5.8 18.2Q8.4 18.6 7.6 19.8Q6.6 20.4 5 19.8', '#f2f0e6', 1.7),
  'letter-s': () => stroke('M9.4 7.8Q8.4 6.6 6.2 6.6Q2.8 6.6 2.8 9Q2.8 11 6.2 11.4Q9.8 11.8 9.8 14Q9.8 16.4 6.2 16.4Q3.8 16.4 2.4 15M6 16.6L5.6 18.2Q8.2 18.6 7.4 19.8Q6.4 20.4 4.8 19.8', '#f2f0e6', 1.7),
  hic: (c, dark) =>
    `<path d="${ellipsePath(5, 7, 4, 4)}" fill="${dark ? '#c9cfdc' : '#ffffff'}" fill-opacity="0.92"/>` +
    `<path d="${ellipsePath(11, 3, 2.4, 2.4)}" fill="${dark ? '#c9cfdc' : '#ffffff'}" fill-opacity="0.8"/>` +
    stroke(ellipsePath(5, 7, 4, 4), c('#9fb4c2'), 0.8),
};
