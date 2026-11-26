/**
 * The props of the little scenes beside the lesson road (path-world.ts `pathScene`), in the painted valley style: Hevalo
 * eating an apple off a branch over the orchard wall, Hamo sugaring his tea far too much, Xezo writing Kurmanji's own
 * letters on her slate, and the pigeon trying to land on a fence post with a letter. The characters are their own rigs,
 * which the apps draw between these props (`PATH_SCENES` says where); each prop is its own small picture so the apps
 * can move it. Also the garland of three stars each scene hangs up for its chapter's rounds.
 */
import type { CharacterCrop, CharacterId } from '../characters/index.js';
import { starPath } from '../lesson-rounds.js';
import { PATH_REST } from './path-land.js';
import { mix, n, n2, prefixFor } from './svg.js';
import { VALLEY, dusk, ellipsePath, fill, stroke, warm } from './valley.js';

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

/** A scene's square, in points, drawn the size it shows beside the road. */
export const PATH_SCENE_BOX = { w: 120, h: 120 } as const;

/**
 * Where everything in a scene stands, for a scene on the road's start side (the road to its right); the apps mirror
 * it on the other side, all but the letters on the slate. `actor` is the character's box (its crop, drawn this high
 * and as wide as the crop needs, its middle at `x`); `back` are props behind the actor and `front` those before it;
 * `garland` is where the chapter's stars hang. The pigeon is drawn from the letters' art at `actor`, feet at its foot.
 */
export interface SceneLayout {
  who: CharacterId | 'pigeon';
  actor: { crop: CharacterCrop; x: number; y: number; h: number };
  back: Readonly<Record<string, SceneBox>>;
  front: Readonly<Record<string, SceneBox>>;
  garland: SceneBox;
}

export const PATH_SCENES: Readonly<Record<PathSceneId, SceneLayout>> = {
  apple: {
    who: 'hevalo',
    actor: { crop: 'half', x: 80, y: 0, h: 104 },
    back: { branch: { x: 0, y: 4, w: 72, h: 32 } },
    front: { apple: { x: 46, y: 26, w: 24, h: 32 }, wall: { x: 0, y: 78, w: 120, h: 30 } },
    garland: { x: 24, y: 90, w: 72, h: 22 },
  },
  tea: {
    who: 'hamo',
    actor: { crop: 'half', x: 64, y: 6, h: 96 },
    back: {},
    front: { table: { x: 4, y: 76, w: 112, h: 40 }, glass: { x: 26, y: 54, w: 28, h: 30 }, bowl: { x: 74, y: 64, w: 32, h: 20 } },
    garland: { x: 24, y: 94, w: 72, h: 22 },
  },
  slate: {
    who: 'xezo',
    actor: { crop: 'half', x: 82, y: 4, h: 98 },
    back: { easel: { x: 0, y: 18, w: 56, h: 90 } },
    front: { desk: { x: 30, y: 82, w: 90, h: 34 } },
    garland: { x: 40, y: 94, w: 72, h: 22 },
  },
  letter: {
    who: 'pigeon',
    actor: { crop: 'full', x: 74, y: 10, h: 54 },
    back: { fence: { x: 0, y: 52, w: 92, h: 60 } },
    front: { grass: { x: 0, y: 96, w: 120, h: 18 } },
    garland: { x: 12, y: 74, w: 72, h: 22 },
  },
};

/** The sprites the scenes move: the apple as it is eaten and its crumbs, a sugar cube and its splash, steam, and the slate's letters. */
export const PATH_SCENE_SPRITES = ['apple-0', 'apple-1', 'apple-2', 'apple-3', 'apple-4', 'core', 'crumbs', 'cube', 'splash', 'steam', 'letter-e', 'letter-c', 'letter-s', 'hic'] as const;
export type PathSceneSprite = (typeof PATH_SCENE_SPRITES)[number];

/** Each sprite's own canvas, in points; the apps lay it at the size it is drawn. The apple's canvas hangs from its stalk's top. */
export const PATH_SCENE_SPRITE_BOX: Readonly<Record<PathSceneSprite, { w: number; h: number }>> = {
  'apple-0': { w: 24, h: 32 },
  'apple-1': { w: 24, h: 32 },
  'apple-2': { w: 24, h: 32 },
  'apple-3': { w: 24, h: 32 },
  'apple-4': { w: 24, h: 32 },
  core: { w: 24, h: 32 },
  crumbs: { w: 12, h: 10 },
  cube: { w: 8, h: 8 },
  splash: { w: 16, h: 8 },
  steam: { w: 14, h: 24 },
  'letter-e': { w: 12, h: 20 },
  'letter-c': { w: 12, h: 20 },
  'letter-s': { w: 12, h: 20 },
  hic: { w: 14, h: 12 },
};

/** Where the slate's three letters are written, on the scene's square (for the start side). */
export const PATH_SLATE_LETTERS: readonly { sprite: PathSceneSprite; x: number; y: number }[] = [
  { sprite: 'letter-e', x: 9, y: 30 },
  { sprite: 'letter-c', x: 22, y: 30 },
  { sprite: 'letter-s', x: 35, y: 30 },
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

export interface PathGarlandOptions {
  /** Stars lit gold: the chapter's rounds, 0 to 3. */
  lit: number;
  dark?: boolean;
  width?: number;
  idPrefix?: string;
}

/**
 * The chapter's rounds as three stars strung on a red wool thread, the way dried apples and peppers are hung up to dry:
 * gold for each round every topic of the chapter has played, the rest slate.
 */
export function pathGarlandSvg(opts: PathGarlandOptions): string {
  const { dark = false } = opts;
  const lit = Math.max(0, Math.min(3, Math.floor(opts.lit)));
  const rest = PATH_REST[dark ? 'dark' : 'light'];
  const wool = dusk(VALLEY.red, dark, 0.12);
  let body = stroke('M3 4Q36 13 69 4', wool, 1.4) + fill(ellipsePath(3, 4, 2.2, 2.2) + ellipsePath(69, 4, 2.2, 2.2), mix(wool, '#000000', 0.2));
  [18, 36, 54].forEach((x, i) => {
    const top = i === 1 ? 8.4 : 7.2;
    body += stroke(`M${x} ${n(top)}V${n(top + 3)}`, wool, 1);
    const star = starPath(x, top + 8.6, 6.2);
    body += i < lit ? `<path d="${star}" fill="${warm('#f2b632', dark)}" stroke="${warm('#a8691a', dark)}" stroke-width="1.3" stroke-linejoin="round"/>` : `<path d="${star}" fill="${rest.fill}" stroke="${rest.lip}" stroke-width="1.3" stroke-linejoin="round"/>`;
  });
  return wrap(prefixFor(opts.idPrefix, 'garland', lit, dark), opts.width ?? 72, { x: 0, y: 0, w: 72, h: 22 }, body);
}

function wrap(prefix: string, width: number, box: SceneBox, body: string): string {
  if (!(width > 0) || !Number.isFinite(width)) throw new RangeError(`art: width must be a positive number, got ${String(width)}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(width)}" height="${n2((width * box.h) / box.w)}" viewBox="${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}" aria-hidden="true" focusable="false" id="${prefix}">${body}</svg>`;
}

type Paint = (c: (hex: string, amount?: number) => string, dark: boolean, prefix: string) => string;

/** A leaf on a twig, from its base along `angle` degrees. */
function leafAt(x: number, y: number, len: number, angle: number, face: string, vein: string): string {
  const a = (angle * Math.PI) / 180;
  const [ux, uy] = [Math.cos(a), Math.sin(a)];
  const [vx, vy] = [-uy, ux];
  const p = (u: number, v: number): string => `${n(x + ux * u * len + vx * v * len)} ${n(y + uy * u * len + vy * v * len)}`;
  return fill(`M${p(0, 0)}Q${p(0.4, 0.34)} ${p(1, 0)}Q${p(0.4, -0.34)} ${p(0, 0)}Z`, face) + stroke(`M${p(0.08, 0)}L${p(0.8, 0)}`, vein, 0.8);
}

const PROPS: Readonly<Record<string, Paint>> = {
  // An apple bough reaching over the orchard wall, its leaves lit from above.
  'apple:branch': (c) =>
    stroke('M-2 10Q24 6 46 16Q58 22 60 30', c(VALLEY.trunk), 3.2) +
    stroke('M22 9Q28 2 36 0', c(VALLEY.trunk), 1.8) +
    leafAt(10, 9, 13, 150, c(VALLEY.leafShade), c(VALLEY.leaf)) +
    leafAt(30, 8, 14, -40, c(VALLEY.leaf), c(VALLEY.leafShade)) +
    leafAt(44, 15, 13, 60, c(VALLEY.leafLight), c(VALLEY.leaf)) +
    leafAt(52, 21, 12, -20, c(VALLEY.leaf), c(VALLEY.leafShade)) +
    leafAt(36, 0, 11, -10, c(VALLEY.leafLight), c(VALLEY.leaf)),
  // The orchard's mud wall, its coping lit, a course of bricks showing.
  'apple:wall': (c) => {
    let out = fill('M0 84Q0 80 4 80H116Q120 80 120 84V108H0Z', c(VALLEY.wall));
    out += fill('M0 84Q0 80 4 80H116Q120 80 120 84V87H0Z', c(VALLEY.roof)) + fill('M0 87H120V89H0Z', c(VALLEY.parapet));
    out += stroke('M10 96H30M44 100H64M76 95H96M100 102H114M4 103H18', c(VALLEY.wallSide), 1.2);
    return out;
  },
  // Hamo's low round table, the tray on it lit along its near edge.
  'tea:table': (c) =>
    stroke('M22 90L18 116M98 90L102 116M60 92V116', c(WOOD.shade), 3) +
    fill('M4 86Q4 80 60 80Q116 80 116 86V92Q116 98 60 98Q4 98 4 92Z', c(WOOD.shade)) +
    fill(ellipsePath(60, 86, 56, 7), c(WOOD.face)) +
    fill(ellipsePath(60, 86, 50, 5), c('#cf8a4f')),
  // His tea: a tulip glass on its saucer, the tea dark and red as he likes it.
  'tea:glass': (c) =>
    fill(ellipsePath(40, 81, 13, 3.4), c('#ffffff')) +
    stroke('M29.4 81.6Q40 85.4 50.6 81.6', c(VALLEY.red), 1.4) +
    fill('M32.6 56H47.4Q44 64 46.4 74Q47.8 80 40 80Q32.2 80 33.6 74Q36 64 32.6 56Z', c('#fff7ea')) +
    fill('M34.4 60H45.6Q42.8 66 44.8 74Q45.8 78.4 40 78.4Q34.2 78.4 35.2 74Q37.2 66 34.4 60Z', c('#b4421c')) +
    stroke('M36.6 62Q38 68 36.8 74', c('#ffffff'), 1.4),
  // The sugar bowl, blue glaze, heaped with cubes.
  'tea:bowl': (c) =>
    fill('M78 70H102Q100 82 90 83Q80 82 78 70Z', c('#2f6fa8')) +
    fill('M94 70H102Q100 82 90 83Q96 78 94 70Z', c('#22527e')) +
    fill(ellipsePath(90, 70, 12, 2.6), c('#e8eef3')) +
    fill('M82 64h6v6h-6ZM88 62h6v6h-6ZM93.6 65h6v5h-6Z', c('#ffffff')) +
    fill('M82 69h6v1h-6ZM88 67h6v1h-6Z', c('#d9e1e8')),
  // Xezo's slate on its easel, the chalk tray along its foot.
  'slate:easel': (c) =>
    stroke('M14 30L4 108M42 30L52 108M28 26V104', c(WOOD.shade), 2.6) +
    fill('M2 22H54V66H2Z', c(WOOD.face)) +
    fill('M5 25H51V63H5Z', c('#2e4a3d')) +
    fill('M5 25H51V28H5Z', c('#3a5a4b')) +
    fill('M0 66H56V70H0Z', c(WOOD.light)) +
    fill('M42 64.4h7v1.6h-7Z', c('#f2f0e6')),
  // The school desk before her, its lid lit.
  'slate:desk': (c) =>
    fill('M34 88H118V112H34Z', c(WOOD.face)) +
    fill('M30 84H120V90H30Z', c(WOOD.light)) +
    fill('M34 104H118V112H34Z', c(WOOD.shade)) +
    fill('M48 80L70 78L72 84H50Z', c('#c8483a')) +
    fill('M50 79.4L69 77.8L69.4 79L50.6 80.6Z', c('#fffaf0')),
  // A fence of two posts and a rail; the near post's top is where the pigeon wants to land.
  'letter:fence': (c) =>
    fill('M8 58L14 56V110H8Z', c(WOOD.face)) +
    fill('M4 72H78V77H4Z', c(WOOD.face)) +
    fill('M4 77H78V79H4Z', c(WOOD.shade)) +
    fill('M70 66L80 63V112H70Z', c(WOOD.face)) +
    fill('M76 64.2L80 63V112H76Z', c(WOOD.shade)) +
    stroke('M73 80V88M74 96V104', c(WOOD.dark), 1),
  // Grass at the fence's foot.
  'letter:grass': (c) => {
    let out = '';
    for (const x of [6, 22, 60, 84, 104]) out += fill(`M${x - 6} 112q3 -10 6 -12q1 8 1 12ZM${x + 6} 112q-3 -8 -5 -10q0 6 0 10Z`, c(VALLEY.leaf));
    return out;
  },
};

/** The apple's outline after `bites` bites taken from its right side, sampled round and pushed in where a bite took it. */
function bittenApple(bites: number): { outline: string; marks: string } {
  const cx = 12;
  const cy = 20;
  const r = 9;
  const holes = [
    { x: 21.4, y: 17, r: 4.6 },
    { x: 20.6, y: 25, r: 4.8 },
    { x: 15.6, y: 12, r: 4.4 },
    { x: 14.4, y: 29.6, r: 4.4 },
  ].slice(0, bites);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2 - Math.PI / 2;
    // An apple's shoulders: wider at the top, a dip at the stalk.
    const k = 1 + 0.06 * Math.sin(a) - 0.08 * Math.max(0, -Math.sin(a)) ** 6;
    let x = cx + Math.cos(a) * r * k * 1.04;
    let y = cy + Math.sin(a) * r * k;
    for (const h of holes) {
      const dx = x - h.x;
      const dy = y - h.y;
      const d = Math.hypot(dx, dy);
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
  const marks = holes.map((h) => ellipsePath(h.x - 1.6, h.y, h.r * 0.72, h.r * 0.82)).join('');
  return { outline, marks };
}

/** The core left once the apple is eaten: its waist bitten to the pips. */
function appleCore(c: (hex: string, amount?: number) => string): string {
  return (
    stroke('M12 0V10', c(WOOD.dark), 1.4) +
    fill('M5 12Q12 9 19 12Q20 15 16 17Q13 20 13 23Q13 27 17 29Q19 31 12 32Q5 31 7 29Q11 27 11 23Q11 20 8 17Q4 15 5 12Z', c('#fbf0d6')) +
    fill('M5 12Q12 9 19 12Q18 14 12 14Q6 14 5 12ZM7 29Q12 30 17 29Q19 31 12 32Q5 31 7 29Z', c(VALLEY.apple)) +
    fill(ellipsePath(11.2, 21, 0.9, 1.4) + ellipsePath(12.8, 23.6, 0.9, 1.4), c('#4a2a1a'))
  );
}

const SPRITES: Readonly<Record<PathSceneSprite, Paint>> = {
  'apple-0': (c, _dark, prefix) => apple(0, c, prefix),
  'apple-1': (c, _dark, prefix) => apple(1, c, prefix),
  'apple-2': (c, _dark, prefix) => apple(2, c, prefix),
  'apple-3': (c, _dark, prefix) => apple(3, c, prefix),
  'apple-4': (c, _dark, prefix) => apple(4, c, prefix),
  core: (c) => appleCore(c),
  crumbs: (c) => fill(ellipsePath(3, 3, 1.4, 1.2) + ellipsePath(8, 5, 1.2, 1) + ellipsePath(5, 8.4, 1, 0.9), c('#fbf0d6')) + fill(ellipsePath(9.6, 1.6, 1, 0.8), c(VALLEY.apple)),
  cube: (c) => fill('M1 2.6h5v5h-5Z', c('#ffffff')) + fill('M1 2.6l1.6 -1.6h5l-1.6 1.6Z', c('#eef2f5')) + fill('M6 2.6l1.6 -1.6v5l-1.6 1.6Z', c('#d0d9e0')),
  splash: (c) => stroke('M2 6Q4 2 6 5M10 5Q12 2 14 6', c('#d9773f'), 1.2) + fill(ellipsePath(8, 3, 1, 1), c('#d9773f')),
  steam: (_c, dark) => `<path d="${ellipsePath(7, 20, 3.2, 2.8)}${ellipsePath(5.4, 13, 4, 3.4)}${ellipsePath(8, 5.6, 3.4, 3)}" fill="${dark ? '#c9cfdc' : '#ffffff'}" fill-opacity="0.85"/>`,
  'letter-e': () => stroke('M2.4 11H9.8Q9.8 6.6 6.2 6.6Q2.4 6.6 2.4 11.4Q2.4 16.4 6.6 16.4Q8.6 16.4 9.8 15M3.6 4L6.1 1.6L8.6 4', '#f2f0e6', 1.7),
  'letter-c': () => stroke('M9.8 8.2Q8.8 6.6 6.4 6.6Q2.4 6.6 2.4 11.4Q2.4 16.4 6.4 16.4Q8.8 16.4 9.8 14.8M6.2 16.6L5.8 18.2Q8.4 18.6 7.6 19.8Q6.6 20.4 5 19.8', '#f2f0e6', 1.7),
  'letter-s': () => stroke('M9.4 7.8Q8.4 6.6 6.2 6.6Q2.8 6.6 2.8 9Q2.8 11 6.2 11.4Q9.8 11.8 9.8 14Q9.8 16.4 6.2 16.4Q3.8 16.4 2.4 15M6 16.6L5.6 18.2Q8.2 18.6 7.4 19.8Q6.4 20.4 4.8 19.8', '#f2f0e6', 1.7),
  hic: (c, dark) =>
    `<path d="${ellipsePath(5, 7, 4, 4)}" fill="${dark ? '#c9cfdc' : '#ffffff'}" fill-opacity="0.92"/>` +
    `<path d="${ellipsePath(11, 3, 2.4, 2.4)}" fill="${dark ? '#c9cfdc' : '#ffffff'}" fill-opacity="0.8"/>` +
    stroke(ellipsePath(5, 7, 4, 4), c('#9fb4c2'), 0.8),
};

/** The apple on its stalk with `bites` bites out of it, its canvas hanging from the stalk's top. */
function apple(bites: number, c: (hex: string, amount?: number) => string, prefix: string): string {
  const { outline, marks } = bittenApple(bites);
  let out = stroke('M12 0Q12.6 6 12 12', c(WOOD.dark), 1.4) + fill('M12.6 4Q18 0 22 3Q17 7 12.6 4Z', c(VALLEY.leaf));
  out += fill(outline, c(VALLEY.apple));
  if (bites === 0) out += fill('M19.6 15Q22.4 21 18 27Q14 30 12 29.4Q19 26 19.6 15Z', c('#a8322a'));
  else out += `<defs><clipPath id="${prefix}a"><path d="${outline}"/></clipPath></defs><g clip-path="url(#${prefix}a)">${fill(marks, c('#fbf0d6'))}</g>`;
  return out + fill(ellipsePath(7.6, 16.4, 2, 1.4), c('#f48a76'));
}
