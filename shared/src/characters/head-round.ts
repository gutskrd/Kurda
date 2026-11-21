import { mapRuns, pathRuns } from '../art/warp.js';
import { headParts, type HeadParts } from './head-turn.js';
import { HEVALO_SILHOUETTE, headHalfWidth, hevaloKnots, hevaloShape } from './hevalo.js';
import { PEEK_TURN } from './peek-lean.js';
import type { CharacterArt, CharacterPoint } from './types.js';

/**
 * Hevalo's head turned aside as a whole, the way a drawn character's head is rigged in the round. The head turns about
 * a point behind his face, at his neck, so the whole of it moves the way it turns. His outline is redrawn from the
 * head's cross-sections, a round skull whose jaw and snout reach forward, so the jaw comes round on the side he turns
 * to. Every shape of his face keeps its own shape and rides on a piece set at a depth on his head (each eye with its lid
 * and socket, each freckle), moving with the point it sits on and seen nearer or further, so the far eye is a little
 * smaller. His muzzle is a block standing out of his face: its front, with the nose and mouth, faces where he looks and
 * swings out furthest, and its side comes into view. His ears and antlers turn on their own as well (head-turn.ts).
 * What lies on his face stays within his outline. In his own units.
 */
export const HEAD_RIG = {
  /** the middle of his skull, where his outline sits */
  centre: { x: 255, y: 300 },
  /** how far behind the middle of his skull the head turns about, at his neck */
  pivot: 80,
  /** how deep his face is for its width: a round a little flatter than a ball, as a drawn face is */
  depth: 0.6,
  /** each eye's middle, how near a shape's middle must be to ride on that eye, and how far the eyes stand proud */
  eyes: { left: { x: 177.5, y: 281 }, right: { x: 329.5, y: 281 }, reach: 50, lift: 6 },
  /**
   * The muzzle: its middle, how far its front stands out, and how far back its sides run into his face; shapes within
   * `across` of its upright line and below `top` ride on its front.
   */
  muzzle: { x: 255, y: 404, depth: 170, back: 90, across: 40, top: 360 },
  /** the colour of the muzzle's side, its edge colour, fading into his fur where it meets his face */
  muzzleSide: '#dca874',
  /** where his jaw starts reaching forward below his eyes, and where it reaches as far as the muzzle */
  jaw: { from: 330, full: 405 },
  /** how far away we see him from, for the far side to be smaller and the near side larger */
  distance: 800,
  /** how much a shape on his face narrows as it faces away, as a share of what a flat card would; the muzzle's front is flat */
  narrow: 0.3,
  narrowMuzzle: 1,
  /** how far his ears and antlers face out to their sides, so how much each turns with him (head-turn.ts) */
  earOut: 38,
  antlerOut: 32,
} as const;

/** What a layer of his head is drawn on: his outline, what lies on his face (and his muzzle, nose and mouth), or his eyes. */
export type RoundLayer = 'outline' | 'fur' | 'eyes';

/** A piece of his head: the point it sits on, how far in front of his skull's middle, how much it narrows, and whether his outline keeps it in. */
export interface HeadPiece {
  x: number;
  y: number;
  depth: number;
  narrow: number;
  within: boolean;
}

const R = HEAD_RIG;

/** How far in front of his skull's middle his face is at `dx` across, height `y`. */
function faceDepth(dx: number, y: number): number {
  const half = Math.max(1, headHalfWidth(y, dx < 0 ? 'left' : 'right'));
  return Math.sqrt(Math.max(0, half * half - dx * dx)) * R.depth;
}

/** The skull: his outline, turning about the neck behind it. */
export const SKULL: HeadPiece = { x: R.centre.x, y: R.centre.y, depth: 0, narrow: 0, within: false };

/** The piece a shape whose middle is `at` rides on, on `layer`. */
export function headPiece(at: CharacterPoint, layer: RoundLayer): HeadPiece {
  if (layer === 'outline') return SKULL;
  const m = R.muzzle;
  if (Math.abs(at.x - m.x) < m.across && at.y > m.top) return { x: m.x, y: m.y, depth: m.depth, narrow: R.narrowMuzzle, within: false };
  for (const e of [R.eyes.left, R.eyes.right]) {
    if (Math.hypot(at.x - e.x, at.y - e.y) < R.eyes.reach) {
      return { x: e.x, y: e.y, depth: faceDepth(e.x - R.centre.x, e.y) + (layer === 'eyes' ? R.eyes.lift : 0), narrow: R.narrow, within: true };
    }
  }
  return { x: at.x, y: at.y, depth: faceDepth(at.x - R.centre.x, at.y), narrow: R.narrow, within: true };
}

/** A piece seen with his head turned: how it is scaled across and up, about where it sits, and where that point goes. */
export interface PiecePlace {
  wide: number;
  tall: number;
  x: number;
  y: number;
}

/** Where a piece is seen and how big, with his head turned `yaw` radians aside (above 0 to our right); facing us, exactly as drawn. */
export function placePiece(piece: HeadPiece, yaw: number): PiecePlace {
  const across = piece.x - R.centre.x;
  const deep = piece.depth + R.pivot;
  const turnedAcross = across * Math.cos(yaw) + deep * Math.sin(yaw);
  const turnedDeep = deep * Math.cos(yaw) - across * Math.sin(yaw);
  // Nearer than it was looks bigger, further smaller, as seen from `distance` away.
  const near = (R.distance - deep) / (R.distance - turnedDeep);
  const facing = Math.atan2(across, Math.max(1, piece.depth));
  const narrow = 1 + piece.narrow * (Math.cos(facing + yaw) / Math.cos(facing) - 1);
  return {
    wide: near * Math.max(0.5, narrow),
    tall: near,
    x: R.centre.x + turnedAcross * near,
    y: R.centre.y + (piece.y - R.centre.y) * near,
  };
}

const f3 = (v: number): string => String(Math.round(v * 1000) / 1000);

/** A piece's place as an SVG transform of what is drawn on it. */
export function pieceTransform(piece: HeadPiece, yaw: number): string {
  const p = placePiece(piece, yaw);
  return `matrix(${f3(p.wide)} 0 0 ${f3(p.tall)} ${f3(p.x - p.wide * piece.x)} ${f3(p.y - p.tall * piece.y)})`;
}

/** A point `depth` in front of his skull's middle seen with his head turned `yaw` radians aside: turned about his neck, nearer looking bigger. */
export function projectPoint(x: number, y: number, depth: number, yaw: number): CharacterPoint {
  const across = x - R.centre.x;
  const deep = depth + R.pivot;
  const turnedAcross = across * Math.cos(yaw) + deep * Math.sin(yaw);
  const turnedDeep = deep * Math.cos(yaw) - across * Math.sin(yaw);
  const near = (R.distance - deep) / (R.distance - turnedDeep);
  return { x: R.centre.x + turnedAcross * near, y: R.centre.y + (y - R.centre.y) * near };
}

const smoothstep = (from: number, to: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/**
 * His head's cross-section at height `y`, about his skull's middle: its half-width, and how far forward its middle and
 * half its depth reach. Round through his skull; lower down his jaw reaches forward toward the front of his muzzle.
 */
function section(y: number): { half: number; middle: number; deep: number } {
  const half = (headHalfWidth(y, 'left') + headHalfWidth(y, 'right')) / 2;
  const reach = smoothstep(R.jaw.from, R.jaw.full, y) * Math.min(1, half / 40 + 0.4);
  const front = half + (R.muzzle.depth - half) * reach;
  return { half, middle: (front - half) / 2, deep: (front + half) / 2 };
}

const heads = new Map<number, string>();

/**
 * His outline with his head turned `yaw` radians aside, about his skull's middle (his skull's piece then carries it
 * round his neck): at each height the turned cross-section's sides, drawn through the outline's own knots. Facing us,
 * exactly as drawn.
 */
export function turnedHead(yaw: number): string {
  if (yaw === 0) return HEVALO_SILHOUETTE.head;
  const key = Math.round(yaw * 1e5);
  let d = heads.get(key);
  if (d === undefined) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    d = hevaloShape('head', (x, y) => {
      const { half, middle, deep } = section(y);
      const ratio = deep / Math.max(1, half);
      return [R.centre.x + middle * sin + (x - R.centre.x) * Math.sqrt(cos * cos + ratio * ratio * sin * sin), y];
    });
    heads.set(key, d);
    if (heads.size > 300) heads.delete(heads.keys().next().value!);
  }
  return d;
}

/** The knots of his muzzle's outline, as drawn. */
const MUZZLE_KNOTS = hevaloKnots('muzzle');

/**
 * The side of his muzzle with his head turned `yaw` radians aside: the outline round its front (as the muzzle's piece
 * draws it) and where it runs into his face, and where across its colour fades from its front edge (`to`) into his fur
 * (`from`). None facing us.
 */
export function muzzleSide(yaw: number): { d: string; from: number; to: number } | null {
  if (yaw === 0) return null;
  const front = placePiece(headPiece(R.muzzle, 'fur'), yaw);
  const m = R.muzzle;
  const fronts = MUZZLE_KNOTS.map((k) => ({ x: front.x + (k.x - m.x) * front.wide, y: front.y + (k.y - m.y) * front.tall }));
  const backs = MUZZLE_KNOTS.map((k) => projectPoint(m.x + (k.x - m.x) * 1.04, k.y, m.back, yaw));
  const outline = hull([...fronts, ...backs]);
  const edge = (pts: CharacterPoint[]): number => (yaw > 0 ? Math.min(...pts.map((p) => p.x)) : Math.max(...pts.map((p) => p.x)));
  return { d: `M${outline.map((p) => `${f3(p.x)},${f3(p.y)}`).join('L')}z`, from: edge(backs), to: edge(fronts) };
}

/** The convex hull of some points, round in order. */
function hull(points: CharacterPoint[]): CharacterPoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: CharacterPoint, a: CharacterPoint, b: CharacterPoint): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (pts: CharacterPoint[]): CharacterPoint[] => {
    const out: CharacterPoint[] = [];
    for (const p of pts) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** The muzzle's side as markup, under the gradient `id`, for a layer drawn turned; `null` facing us. */
function sideMarkup(yaw: number, id: string): string {
  const side = muzzleSide(yaw);
  if (!side) return '';
  return (
    `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f3(side.from)}" y1="0" x2="${f3(side.to)}" y2="0">` +
    `<stop offset="0" stop-color="${R.muzzleSide}" stop-opacity="0"/><stop offset="0.55" stop-color="${R.muzzleSide}" stop-opacity="0.6"/>` +
    `<stop offset="1" stop-color="${R.muzzleSide}"/></linearGradient></defs><path d="${side.d}" fill="url(#${id})"/>`
  );
}

/** His antlers and ears turned with his head, `share` of a full turn aside, riding round his neck (head-turn.ts). */
export function peekParts(art: CharacterArt, share: number): HeadParts {
  return headParts(art, share, PEEK_TURN.yawDeg, { behind: R.pivot, earOut: R.earOut, antlerOut: R.antlerOut });
}

/** The turn, in radians, that a step stands for: one of `PEEK_TURN.steps` either way to a full turn of `PEEK_TURN.yawDeg`. */
export const stepYaw = (step: number): number => (step / PEEK_TURN.steps) * PEEK_TURN.yawDeg * (Math.PI / 180);

/** The turn, in radians, a share of a full turn either way stands for (above 0 to our right). */
export const shareYaw = (share: number): number => Math.max(-1, Math.min(1, share)) * PEEK_TURN.yawDeg * (Math.PI / 180);

/**
 * A turn as a player draws it: one of `PEEK_TURN.steps` steps either way to a full turn of `PEEK_TURN.yawDeg`, so each
 * drawing of a step is made once and kept.
 */
export function turnStep(share: number): number {
  const s = PEEK_TURN.steps;
  return Math.max(-s, Math.min(s, Math.round(share * s)));
}

/** Where a point of a layer is seen with his head turned `step` steps aside. */
export function roundPoint(p: CharacterPoint, step: number, layer: RoundLayer): CharacterPoint {
  const piece = headPiece(p, layer);
  const at = placePiece(piece, stepYaw(step));
  return { x: at.x + (p.x - piece.x) * at.wide, y: at.y + (p.y - piece.y) * at.tall };
}

// ─────────────────────────────────────────────────────────────── a drawing in its pieces

/** The top-level elements of some markup, each whole. */
function elements(markup: string): string[] {
  const out: string[] = [];
  const tag = /<\/?[a-zA-Z][^>]*?\/?>/g;
  let depth = 0;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(markup))) {
    const closing = m[0].startsWith('</');
    if (depth === 0 && !closing) start = m.index;
    if (closing) depth--;
    else if (!m[0].endsWith('/>')) depth++;
    if (depth === 0) out.push(markup.slice(start, tag.lastIndex));
  }
  return out;
}

const attr = (tag: string, name: string): number => Number(tag.match(new RegExp(`\\s${name}="([^"]+)"`))?.[1] ?? 0);

/** The middle of what an element draws, from its shapes' extents. */
function middle(el: string): CharacterPoint {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [shape] of el.matchAll(/<(?:ellipse|circle)\b[^>]*>/g)) {
    const rx = attr(shape, 'rx') || attr(shape, 'r');
    const ry = attr(shape, 'ry') || attr(shape, 'r');
    xs.push(attr(shape, 'cx') - rx, attr(shape, 'cx') + rx);
    ys.push(attr(shape, 'cy') - ry, attr(shape, 'cy') + ry);
  }
  for (const [, d] of el.matchAll(/\sd="([^"]*)"/g)) {
    for (const run of pathRuns(d!)) {
      for (const p of [run.start, ...run.curves.flat()]) {
        xs.push(p[0]);
        ys.push(p[1]);
      }
    }
  }
  if (xs.length === 0) return R.centre;
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** A group that only names or hides what is in it, drawing nothing differently: its insides are pieces of their own. */
const WRAPPER = /^<g(?![^>]*\s(?:transform|clip-path|mask|filter|opacity)=)[^>]*>/;

const samePiece = (a: HeadPiece, b: HeadPiece): boolean => a.x === b.x && a.y === b.y && a.depth === b.depth;
const asIs = (x: number, y: number): readonly [number, number] => [x, y];

/**
 * Some markup with each of its shapes on its piece: `wrap` is given each shape with the piece it rides on, a path that
 * draws on two pieces at once (both lids' edges) split into one path for each. Definitions, and groups that only name
 * or hide, stay as drawn.
 */
function onPieces(markup: string, layer: RoundLayer, wrap: (el: string, piece: HeadPiece) => string): string {
  return elements(markup)
    .map((el) => {
      if (el.startsWith('<defs')) return el;
      const open = el.match(WRAPPER)?.[0];
      if (open && !open.endsWith('/>')) return open + onPieces(el.slice(open.length, el.length - '</g>'.length), layer, wrap) + '</g>';
      const d = el.startsWith('<path') ? el.match(/\sd="([^"]*)"/)?.[1] : undefined;
      if (d !== undefined) {
        const groups: { piece: HeadPiece; runs: ReturnType<typeof pathRuns> }[] = [];
        for (const run of pathRuns(d)) {
          const piece = headPiece(middle(`<path d="${mapRuns([run], asIs)}"/>`), layer);
          const group = groups.find((g) => samePiece(g.piece, piece));
          if (group) group.runs.push(run);
          else groups.push({ piece, runs: [run] });
        }
        if (groups.length > 1) return groups.map((g) => wrap(el.replace(/\sd="[^"]*"/, ` d="${mapRuns(g.runs, asIs)}"`), g.piece)).join('');
      }
      return wrap(el, headPiece(middle(el), layer));
    })
    .join('');
}

/** A drawing's root kept, its insides given to `inner`. */
function insideRoot(markup: string, inner: (body: string) => string): string {
  const open = markup.startsWith('<svg') ? markup.indexOf('>') + 1 : 0;
  const close = markup.endsWith('</svg>') ? markup.length - '</svg>'.length : markup.length;
  return markup.slice(0, open) + inner(markup.slice(open, close)) + markup.slice(close);
}

/**
 * The clip that keeps his face within his outline: the outline turned `yaw` radians aside and placed round his neck,
 * or, without a turn, marked (`data-piece="skull"`, `data-shape="head"`) for a player to turn and place.
 */
export function skullClip(clipId: string, yaw?: number): string {
  const path =
    yaw === undefined
      ? `<path data-piece="skull" data-shape="head" d="${HEVALO_SILHOUETTE.head}"/>`
      : `<path transform="${pieceTransform(SKULL, yaw)}" d="${turnedHead(yaw)}"/>`;
  return `<defs><clipPath id="${clipId}">${path}</clipPath></defs>`;
}

/** Whether an element is his muzzle's front, which its side is drawn under. */
const isMuzzle = (el: string): boolean => /fill="url\(#[^)]*muzzle\)"/.test(el);

/** How many drawings of turned layers are kept: every layer a player shows, at every step it has passed lately. */
const KEPT = 400;
const drawn = new Map<string, string>();

/**
 * A layer's markup drawn with his head turned `step` steps aside, each shape on its piece; with `clipId`, what lies on
 * his face is kept within his turned outline under that clip. Made once and kept for the steps used lately.
 */
export function roundLayer(markup: string, step: number, layer: RoundLayer, clipId?: string): string {
  if (step === 0 || !markup) return markup;
  const key = `${layer}${step}|${clipId ?? ''}|${markup}`;
  const kept = drawn.get(key);
  if (kept !== undefined) {
    drawn.delete(key);
    drawn.set(key, kept);
    return kept;
  }
  const yaw = stepYaw(step);
  const made = insideRoot(markup, (body) => {
    let clipped = false;
    const within = (g: string): string => {
      if (!clipId) return g;
      clipped = true;
      return `<g clip-path="url(#${clipId})">${g}</g>`;
    };
    const pieces = onPieces(body, layer, (el, piece) => {
      // His outline is redrawn for the turn before it is carried round his neck.
      const shape = piece === SKULL ? el.replace(/\sd="[^"]*"/, ` d="${turnedHead(yaw)}"`) : el;
      const g = `<g transform="${pieceTransform(piece, yaw)}">${shape}</g>`;
      // The muzzle's side comes into view under its front.
      const side = isMuzzle(el) ? within(sideMarkup(yaw, `${clipId ?? 'turn'}-side`)) : '';
      return side + (piece.within ? within(g) : g);
    });
    return (clipped ? skullClip(clipId!, yaw) : '') + pieces;
  });
  drawn.set(key, made);
  if (drawn.size > KEPT) drawn.delete(drawn.keys().next().value!);
  return made;
}

/**
 * A layer drawn facing us for a player that places its pieces as he turns: each shape in a group marked with its piece
 * (`data-piece`, read back with `readPiece`), those on his face within the clip `clipId` (`skullClip`); his outline
 * and his muzzle's side marked (`data-shape`) for the player to redraw (`turnedHead`, `muzzleSide`).
 */
export function rigLayer(markup: string, layer: RoundLayer, clipId: string): string {
  return onPieces(markup, layer, (el, piece) => {
    const shape = piece === SKULL ? el.replace(/<path\b/, '<path data-shape="head"') : el;
    const g = `<g data-piece="${piece.x} ${piece.y} ${piece.depth} ${piece.narrow}">${shape}</g>`;
    // The muzzle's side, empty facing us, for the player to draw as he turns (`muzzleSide`).
    const side = isMuzzle(el)
      ? `<defs><linearGradient id="${clipId}-side" data-shape="side-fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0" stop-color="${R.muzzleSide}" stop-opacity="0"/><stop offset="0.55" stop-color="${R.muzzleSide}" stop-opacity="0.6"/>` +
        `<stop offset="1" stop-color="${R.muzzleSide}"/></linearGradient></defs>` +
        `<g clip-path="url(#${clipId})"><path data-shape="muzzle-side" d="" fill="url(#${clipId}-side)"/></g>`
      : '';
    return side + (piece.within ? `<g clip-path="url(#${clipId})">${g}</g>` : g);
  });
}

/** A piece as a player reads it back from `data-piece`. */
export function readPiece(value: string): HeadPiece {
  if (value === 'skull') return SKULL;
  const [x, y, depth, narrow] = value.split(' ').map(Number);
  return { x: x!, y: y!, depth: depth!, narrow: narrow!, within: false };
}
