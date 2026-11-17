import { n, prefixFor } from '../art/svg.js';
import { drawHevalo } from './hevalo.js';
import { curve, type Knot } from './pen.js';
import { ACTS, BLINK_STEPS, HABITS, between, eyesMiddle, glanceTarget, pupilShift, sampleHold, sampleKeys, type Act, type Keys } from './life.js';
import type { CharacterPoint, EyeState, MouthShape } from './types.js';

/**
 * Hevalo as a companion beside a form, drawn from the chest up as the mascot is. The form's card is a windowsill: he is
 * outside it leaning in, the rest of him behind the card and his forelegs over the sill, each throwing a soft-edged shadow
 * shape rather than a blur so slow phones draw him easily. He pops up from behind the card with his hooves by his cheeks
 * and then lays them over the sill; kept low (the console's first step) he shows only his head and neck until let out.
 *
 * He turns his head in the round after the caret, leans in and says "oo" at each key, swings a hanging hoof, and grins
 * and nods at an address that looks whole. For a password he covers his eyes, and peeks over a hoof when it is shown.
 * Sending makes him think, a mistake gets a head shake, a stamp and a question (never a sad face), success a hop. Idle he
 * breathes, blinks, glances, twitches an ear, sniffs and paws the sill; on the website, left long enough, he dozes. A tap
 * gets a greeting.
 *
 * Everything here is platform-independent: the drawing (`companionSvg`), his behaviour (`CompanionMotion`, fed what the
 * person does and stepped once per drawn frame) and a frame's transforms (`companionTransforms`). Each app keeps a thin
 * player that reads the pointer and caret, draws, and sleeps while he is still. `playful` (the website) bounces in, waves,
 * shows a heart, says a Kurdish word now and then and dozes; `calm` (the admin console) does the same at a smaller size
 * without words or dozing.
 */

export type CompanionTone = 'playful' | 'calm';

/** What the person is in: nothing, an ordinary text box, a password, or a code of digits. */
export type CompanionField = 'none' | 'text' | 'secret' | 'code';

/** Where the form is: being filled in, being sent, refused, let in, or paused for a while. */
export type CompanionStatus = 'idle' | 'busy' | 'error' | 'success' | 'waiting';

export interface CompanionInput {
  field: CompanionField;
  /** the password is shown as typed */
  shown: boolean;
  status: CompanionStatus;
  /** keeps low behind the card, head and neck over it and forelegs hidden, until let out (the console's first step) */
  low: boolean;
}

/** Something that happened once: a tap, a box filled in rightly, a key. */
export type CompanionEvent = 'greet' | 'approve' | 'keystroke';

/** A small wordless sign over his head: thinking, a question, sparkles, a heart, sleep. */
export type CompanionEmote = 'think' | 'question' | 'spark' | 'heart' | 'sleep';

/** The Kurdish words he says on the website, in Kurmancî, the variety Hevalo teaches first. */
export const COMPANION_WORDS = {
  /** hello */
  hello: 'Silav!',
  /** welcome (to one person) */
  welcome: 'Bi xêr hatî!',
  /** well done */
  bravo: 'Aferîn!',
} as const;

export type CompanionWord = keyof typeof COMPANION_WORDS;

// ─────────────────────────────────────────────────────────────── the drawing

/** Where the card's top edge crosses his chest, in character units, below his shoulders; he goes on behind the card and is never seen cut off. */
export const COMPANION_EDGE = 740;

/** How far below the sill his forelegs may hang over the card's face; the platform keeps that much of the card's top clear. */
export const COMPANION_OVERHANG = 285;

/**
 * The companion's box: him from the chest up with room above the antlers for a sign, and down below the sill as far as
 * his forelegs hang. Everything must be drawn inside it, since some browsers cut an SVG at its box once it moves. The sill
 * is COMPANION_OVERHANG above its bottom.
 */
export const COMPANION_VIEW = { x: -75, y: -78, w: 660, h: COMPANION_EDGE + 78 + COMPANION_OVERHANG } as const;

/** The character he is drawn from, with the rig his moving parts turn on. */
const RIG = drawHevalo('cprig-');

/** How far below the sill he waits before he pops up into view. */
const ENTER_DROP = 860;

/** How far below his place he is, coming up, when his forelegs may first show below the sill; his lifted hooves are well over it by then. */
const KNEES_OVER = 40;

/**
 * The left foreleg's keys (the right mirrors it), from resting over the sill (0) through pawing, the knee lifting and the
 * hoof coming forward and up by the cheek, to under the eye for a peek and over it (1). Columns: the shoulder, inside his
 * chest's round shoulder clear of the cream; the knee; the cannon's direction from the knee in degrees (0 straight down,
 * more turning the hoof out); the cannon's seen length, shorter as it comes towards us; the hoof's tip; the leg's size,
 * larger as it rises; and the hoof's seen length. Every pose stays inside COMPANION_VIEW.
 */
const LEG_KEYS: readonly (readonly [k: number, sx: number, sy: number, kx: number, ky: number, turn: number, cannon: number, tip: number, size: number, hoof: number])[] = [
  [0, 116, 648, 99, 746, 2, 185, 0, 1, 1],
  [0.2, 116, 647, 101, 738, -10, 150, -18, 1.02, 0.85],
  [0.32, 116, 645, 104, 700, -30, 110, -20, 1.04, 0.8],
  [0.44, 117, 643, 118, 640, -110, 45, -10, 1.07, 0.55],
  [0.55, 117, 641, 100, 560, -188, 105, 6, 1.1, 1],
  [0.8, 118, 640, 150, 506, -178, 104, 0, 1.14, 1],
  [1, 118, 639, 160, 480, -174, 130, 0, 1.16, 1],
];

/**
 * A deer's foreleg from in front at its drawn size: the rounds its outline passes down the forearm (shoulder to knee) and
 * the cannon (knee to fetlock), each as its place along the part, half the leg's width there, and its offset out from the
 * face, so the forearm's outer side follows the chest while it slims from the inside. Full where it leaves the shoulder
 * (SHOULDER draws the shoulder itself), slimming to the knee's knob, a little fuller again at the fetlock.
 */
const FOREARM: readonly (readonly [along: number, half: number, out: number])[] = [
  [0, 34, 0],
  [0.3, 33, 3],
  [0.6, 31, 3],
  [0.84, 28.5, 2],
  [1, 30, 0],
];
const CANNON: readonly (readonly [along: number, half: number, out: number])[] = [
  [0.45, 24, 0],
  [1, 26.5, 0],
];

/** How long the forearm and cannon are seen hanging at rest, square on to us. */
const FOREARM_LONG = Math.hypot(LEG_KEYS[0]![3] - LEG_KEYS[0]![1], LEG_KEYS[0]![4] - LEG_KEYS[0]![2]);
const CANNON_LONG = LEG_KEYS[0]![6];

/** Seen shorter than this share of that, coming towards us, a part of a leg starts to lose its shape along it. */
const SEEN_SHORT = 0.85;

/** How large a hoof is drawn on a leg of this size, to the leg's fetlock. */
const HOOF = 1.24;

/** How far a hanging cannon swings out, in degrees, per unit its swing goes past rest. */
const SWING_TURN = 70;

/** The middle of his chest, his shoulders either side; his eyes are a little to the left. */
const BODY_AXIS = 257.5;

/**
 * His shoulders as his chest's outline rounds over them, from the side of the neck down the outside of the hanging foreleg
 * into the chest at the sill. Drawn behind the chest in its fur, it shows only where it rounds out past it, giving round
 * shoulders for the forelegs to grow from. The left as drawn; the right mirrors it except where it leaves the neck, a
 * little wider on that side.
 */
const SHOULDER: readonly Knot[] = [
  [143, 527],
  [113, 561],
  [92, 601],
  [85, 641],
  [76.5, 680],
  [74.5, 710],
  [73, 746, 0],
  [140, 746, 0],
  [170, 470, 0],
];
const SHOULDERS =
  curve([[161.5, 478, 0], [158.5, 494], ...SHOULDER]) +
  curve([[354, 478, 0], [358.2, 494], ...SHOULDER.map(([x, y, r]) => [2 * BODY_AXIS - x, y, r ?? 1] as const)]);

/** Just under his chin however he turns: a leg's shadow falls on his chest from here down, never on his face. */
const CHIN = 505;

/** The middle of the face, where the two eyes' states split, and the upright line his head is drawn about. */
const FACE_AXIS = 253.5;
const HEAD_AXIS = 255;

/** Where the signs stand: over his right shoulder, clear of the antlers. */
const EMOTE_AT = { x: 446, y: -22 } as const;

const C = {
  // A leg's fur is his chest's own (the character's gradients), the hanging part darkening down the cannon.
  edge: '#8f5a2c',
  pastern: '#a86f3c',
  coronet: '#9a6638',
  hoofLight: '#8a6447',
  hoof: '#73503a',
  hoofDeep: '#4e3324',
  shine: '#b89276',
  shade: '#2a1608',
  // A shadow on the card, which may be light or dark: near black with brown in it.
  cardShade: '#120a05',
  ink: '#4a2a24',
  heart: '#ef5b7a',
  spark: '#f5b942',
  sparkEdge: '#d18f1c',
} as const;

const plus = (a: CharacterPoint, b: CharacterPoint, s = 1): CharacterPoint => ({ x: a.x + b.x * s, y: a.y + b.y * s });
const minus = (a: CharacterPoint, b: CharacterPoint): CharacterPoint => ({ x: a.x - b.x, y: a.y - b.y });
const unit = (a: CharacterPoint): CharacterPoint => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};
const xy = (p: CharacterPoint): string => `${n(p.x)},${n(p.y)}`;

/** A round of a leg's outline: its middle and half the leg's width there. */
interface Round {
  c: CharacterPoint;
  r: number;
}

const cross = (a: CharacterPoint, b: CharacterPoint): number => a.x * b.y - a.y * b.x;

/** The normals of the lines touching rounds `a` and `b` on either side, and the direction between them: a tapering limb's two sides. */
function sides(a: Round, b: Round): { way: CharacterPoint; one: CharacterPoint; two: CharacterPoint } {
  const way = unit(minus(b.c, a.c));
  const c = Math.max(-0.95, Math.min(0.95, (a.r - b.r) / Math.max(1e-6, Math.hypot(b.c.x - a.c.x, b.c.y - a.c.y))));
  const s = Math.sqrt(1 - c * c);
  return { way, one: { x: c * way.x + s * way.y, y: c * way.y - s * way.x }, two: { x: c * way.x - s * way.y, y: c * way.y + s * way.x } };
}

/** The arc about `c` from `from` to `to`, the way round that passes `via`. */
function arc(from: CharacterPoint, to: CharacterPoint, c: CharacterPoint, r: number, via: CharacterPoint): string {
  const round = 2 * Math.PI;
  const angle = (p: CharacterPoint): number => Math.atan2(p.y - c.y, p.x - c.x);
  const ahead = (x: number): number => ((x % round) + round) % round;
  const span = ahead(angle(to) - angle(from));
  const sweep = ahead(angle(via) - angle(from)) < span;
  return `A${n(r)},${n(r)} 0 ${(sweep ? span : round - span) > Math.PI ? 1 : 0} ${sweep ? 1 : 0} ${xy(to)}`;
}

/** Where the line through `a` and `b` crosses the line through `c` and `d`, if they do. */
function meet(a: CharacterPoint, b: CharacterPoint, c: CharacterPoint, d: CharacterPoint): CharacterPoint | null {
  const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(den) < 1e-6) return null;
  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/**
 * The outline of a forearm or cannon round its rounds, first to last: down one side, round the last, up the other and round
 * the first. Each side runs straight between rounds, touching both; where it turns outward it follows the round, and
 * where it turns in (below the shoulder) the runs are cut back to their crossing and eased through, so there are no
 * corners or notches. No line is drawn along it; it is in his fur like the rest of him.
 */
function legOutline(all: readonly Round[]): string {
  // A round inside its neighbour, as when the cannon comes towards us and is seen short, adds nothing.
  const rounds = all.filter((o, i) => {
    const inside = (p: Round | undefined, strict: boolean): boolean => {
      if (!p) return false;
      const d = Math.hypot(p.c.x - o.c.x, p.c.y - o.c.y) + o.r;
      return strict ? d < p.r : d <= p.r;
    };
    return !inside(all[i - 1], false) && !inside(all[i + 1], true);
  });
  const last = rounds.length - 1;
  if (last < 1) {
    const { c, r } = rounds[0] ?? all[0]!;
    const circle = `M${n(c.x - r)},${n(c.y)}a${n(r)},${n(r)} 0 1 0 ${n(2 * r)},0a${n(r)},${n(r)} 0 1 0 ${n(-2 * r)},0Z`;
    return circle;
  }
  const pairs = rounds.slice(0, last).map((a, i) => ({ ...sides(a, rounds[i + 1]!), a, b: rounds[i + 1]! }));
  // Each side's straight runs in outline order, and the rounds where one meets the next.
  const between = rounds.slice(1, last);
  const runs = (which: 'one' | 'two'): Run[] => pairs.map((p) => ({ from: plus(p.a.c, p[which], p.a.r), to: plus(p.b.c, p[which], p.b.r) }));
  const one = runs('one');
  const two = runs('two')
    .map((r) => ({ from: r.to, to: r.from }))
    .reverse();
  const joins = (side: Run[], at: readonly Round[]): string[] => at.map((o, i) => join(o, side[i]!, side[i + 1]!));
  const oneJoins = joins(one, between);
  const twoJoins = joins(two, [...between].reverse());
  const end = rounds[last]!;
  const tip = arc(one[last - 1]!.to, two[0]!.from, end.c, end.r, plus(end.c, pairs[last - 1]!.way, end.r));
  const top = rounds[0]!;
  const crown = arc(two[last - 1]!.to, one[0]!.from, top.c, top.r, plus(top.c, pairs[0]!.way, -top.r));
  // Down side one, round the last round, up side two and round the first.
  let d = `M${xy(one[0]!.from)}`;
  for (let i = 0; i < last; i += 1) d += `L${xy(one[i]!.to)}${i < last - 1 ? oneJoins[i] : ''}`;
  d += tip;
  for (let j = 0; j < last; j += 1) d += `L${xy(two[j]!.to)}${j < last - 1 ? twoJoins[j] : ''}`;
  return `${d}${crown}Z`;
}

/** A straight run of a leg's side, from one round to the next. */
interface Run {
  from: CharacterPoint;
  to: CharacterPoint;
}

/**
 * Where run `a` meets run `b` about round `o`, as path from the end of `a` to the start of `b`: round the round where the
 * side turns out; where it turns in, both runs are cut back to their crossing (changing them) and a curve eases through.
 */
function join(o: Round, a: Run, b: Run): string {
  const inWay = unit(minus(a.to, a.from));
  const outWay = unit(minus(b.to, b.from));
  if (Math.hypot(b.from.x - a.to.x, b.from.y - a.to.y) < 0.05) return '';
  if (cross(inWay, outWay) > 0) {
    const mid = plus(unit(minus(a.to, o.c)), unit(minus(b.from, o.c)));
    const via = Math.hypot(mid.x, mid.y) > 0.3 ? plus(o.c, unit(mid), o.r) : plus(o.c, inWay, o.r);
    return arc(a.to, b.from, o.c, o.r, via);
  }
  const dot = (p: CharacterPoint, q: CharacterPoint): number => p.x * q.x + p.y * q.y;
  const lengthA = Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y);
  const lengthB = Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y);
  const x = meet(a.from, a.to, b.from, b.to);
  const onA = x ? dot(minus(x, a.from), inWay) : -1;
  const onB = x ? dot(minus(x, b.from), outWay) : -1;
  if (x && onA > 0 && onA <= lengthA && onB >= 0 && onB < lengthB) {
    const ease = Math.min(onA * 0.5, (lengthB - onB) * 0.5, o.r * 0.6);
    a.to = plus(x, inWay, -ease);
    b.from = plus(x, outWay, ease);
    return `Q${xy(x)} ${xy(b.from)}`;
  }
  // The runs do not cross where they should: meet halfway, so the side never doubles back.
  const halfway = { x: (a.to.x + b.from.x) / 2, y: (a.to.y + b.from.y) / 2 };
  a.to = halfway;
  b.from = halfway;
  return '';
}

/** A hoof from the fetlock (0,0) along the leg: the pastern darkening to the coronet, and two pointed toes with a soft shine outside. */
function hoof(id: string): string {
  const toe = 'M-1.6,17C-10,14.5 -22,15 -26,20.5C-29.5,28 -29,42 -24,52.5C-20,60 -13,65.5 -7.5,66C-3.8,66.2 -2,63 -1.8,57Z';
  const mirror = (d: string): string => d.replace(/(-?\d+(?:\.\d+)?),/g, (_, x: string) => `${-Number(x)},`);
  return (
    `<defs>` +
    `<linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.hoofLight}"/><stop offset="0.4" stop-color="${C.hoof}"/><stop offset="1" stop-color="${C.hoofDeep}"/></linearGradient>` +
    `<radialGradient id="${id}g"><stop offset="0" stop-color="${C.shine}" stop-opacity="0.55"/><stop offset="1" stop-color="${C.shine}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.pastern}" stop-opacity="0"/><stop offset="0.6" stop-color="${C.pastern}" stop-opacity="0.5"/><stop offset="1" stop-color="${C.coronet}"/></linearGradient>` +
    `</defs>` +
    `<path d="M-3,19L3,19L2.4,63L-2.4,63Z" fill="${C.hoofDeep}"/>` +
    `<path d="${toe}" fill="url(#${id}h)"/><path d="${mirror(toe)}" fill="url(#${id}h)"/>` +
    `<ellipse cx="-19" cy="34" rx="4.5" ry="11" fill="url(#${id}g)" transform="rotate(14 -19 34)"/>` +
    `<ellipse cx="19" cy="34" rx="4" ry="10" fill="url(#${id}g)" opacity="0.6" transform="rotate(-14 19 34)"/>` +
    `<path d="M-20,-6C-20,6 -23,13 -26,20C-17,16.5 17,16.5 26,20C23,13 20,6 20,-6Z" fill="url(#${id}p)"/>`
  );
}

/**
 * An ear's foot continued under his head in the ear's own light, its inner edge carrying on under the head, so an ear
 * coming round with a turning head, or lowered, shows a little more of itself instead of a cut.
 */
function earRoot(p: string, side: 'left' | 'right'): string {
  const at = (x: number, y: number): string => xy(side === 'left' ? { x, y } : { x: 2 * HEAD_AXIS - x, y });
  return `<path d="M${at(118, 236)}L${at(128, 210)}L${at(138, 185)}L${at(140, 172)}Q${at(147, 181)} ${at(151, 190)}Q${at(154, 200)} ${at(148, 216)}L${at(132, 238)}Z" fill="url(#${p}ear${side === 'left' ? 'L' : 'R'})"/>`;
}

/** The signs over his head, each hidden until shown (the platform's stylesheet brings it in). */
function emotes(id: string): string {
  const { x, y } = EMOTE_AT;
  const outlined = `fill="#ffffff" stroke="${C.ink}" stroke-width="6" paint-order="stroke" stroke-linejoin="round"`;
  const star = (cx: number, cy: number, r: number, cls: string): string =>
    `<path class="${cls}" d="M${n(cx)},${n(cy - r)}C${n(cx + r * 0.16)},${n(cy - r * 0.16)} ${n(cx + r * 0.16)},${n(cy - r * 0.16)} ${n(cx + r)},${n(cy)}` +
    `C${n(cx + r * 0.16)},${n(cy + r * 0.16)} ${n(cx + r * 0.16)},${n(cy + r * 0.16)} ${n(cx)},${n(cy + r)}` +
    `C${n(cx - r * 0.16)},${n(cy + r * 0.16)} ${n(cx - r * 0.16)},${n(cy + r * 0.16)} ${n(cx - r)},${n(cy)}` +
    `C${n(cx - r * 0.16)},${n(cy - r * 0.16)} ${n(cx - r * 0.16)},${n(cy - r * 0.16)} ${n(cx)},${n(cy - r)}Z" fill="url(#${id}spark)" stroke="${C.sparkEdge}" stroke-width="3"/>`;
  return (
    `<defs><linearGradient id="${id}spark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="${C.spark}"/></linearGradient></defs>` +
    // Thinking: a little cloud trailing from his head, three dots in it.
    `<g data-emote="think" visibility="hidden">` +
    `<circle cx="${x - 70}" cy="${y + 66}" r="9" fill="#ffffff" stroke="${C.ink}" stroke-opacity="0.25" stroke-width="3"/>` +
    `<circle cx="${x - 48}" cy="${y + 40}" r="14" fill="#ffffff" stroke="${C.ink}" stroke-opacity="0.25" stroke-width="3"/>` +
    `<ellipse cx="${x}" cy="${y - 4}" rx="62" ry="42" fill="#ffffff" stroke="${C.ink}" stroke-opacity="0.25" stroke-width="3"/>` +
    [-24, 0, 24].map((dx, i) => `<circle class="cp-dot cp-dot-${i}" cx="${x + dx}" cy="${y - 4}" r="8" fill="${C.ink}"/>`).join('') +
    `</g>` +
    // A question, curious rather than sorry.
    `<g data-emote="question" visibility="hidden"><text x="${x - 6}" y="${y + 24}" font-size="92" font-weight="800" font-family="system-ui, sans-serif" text-anchor="middle" ${outlined}>?</text></g>` +
    // Let in: sparkles.
    `<g data-emote="spark" visibility="hidden">${star(x - 20, y - 6, 30, 'cp-spark cp-spark-0')}${star(x + 34, y + 44, 20, 'cp-spark cp-spark-1')}${star(x + 30, y - 52, 15, 'cp-spark cp-spark-2')}</g>` +
    // A greeting: a heart.
    `<g data-emote="heart" visibility="hidden"><path d="M${x},${y + 30}C${x - 70},${y - 12} ${x - 40},${y - 62} ${x},${y - 28}C${x + 40},${y - 62} ${x + 70},${y - 12} ${x},${y + 30}Z" fill="${C.heart}" stroke="#ffffff" stroke-width="6"/></g>` +
    // Asleep: three z's drifting up.
    `<g data-emote="sleep" visibility="hidden">` +
    [0, 1, 2]
      .map((i) => `<text class="cp-z cp-z-${i}" x="${x - 40 + i * 30}" y="${y + 40 - i * 34}" font-size="${44 + i * 10}" font-weight="800" font-family="system-ui, sans-serif" ${outlined}>z</text>`)
      .join('') +
    `</g>`
  );
}

/**
 * The whole companion as one SVG: each moving part a group (`data-cp`), every eye state for each eye with all but the shown
 * one hidden (`data-lid`), every mouth likewise (`data-mouth`), and the signs. Ids start with `prefix`, so two can share a
 * page. Decorative: the form beside him says everything in words.
 */
export function companionSvg({ prefix }: { prefix: string }): string {
  const p = `${prefixFor(prefix)}-`;
  const art = drawHevalo(p);
  const rig = art.rig;
  const layers = rig?.faceLayers;
  const antlers = rig?.antlers;
  if (!rig || !layers || !antlers) throw new Error('companion: Hevalo is drawn without his rig');
  const id = (name: string): string => `${p}${name}`;
  const v = COMPANION_VIEW;
  // The shade down each side of his neck, as his chest has it.
  const neckShade = ((art.chest ?? art.body).match(/<ellipse [^>]*neckside[^>]*\/>/g) ?? []).join('');
  const half = (side: 'left' | 'right'): string =>
    side === 'left' ? `<rect x="${v.x}" y="${v.y}" width="${n(FACE_AXIS - v.x)}" height="${v.h}"/>` : `<rect x="${FACE_AXIS}" y="${v.y}" width="${n(v.x + v.w - FACE_AXIS)}" height="${v.h}"/>`;
  // Each eye shows its half of a drawing of both; the right's comes from its own drawing so no id is used twice.
  const other = drawHevalo(`${p}r-`);
  const lids = (side: 'left' | 'right'): string => {
    const from = side === 'left' ? art : other;
    return (
      `<g data-eye="${side}" clip-path="url(#${id(`half-${side}`)})">` +
      `<g data-lid="half" visibility="hidden">${from.rig?.look.half ?? from.eyes.closed}</g>` +
      `<g data-lid="closed" visibility="hidden">${from.eyes.closed}</g>` +
      `<g data-lid="happy" visibility="hidden">${from.eyes.happy}</g>` +
      `</g>`
    );
  };
  // The side of his face turning away, in shade, waiting just outside its outline until he turns.
  const cheek = (side: 'left' | 'right'): string => {
    const x = side === 'left' ? 2 * HEAD_AXIS - CHEEK.x : CHEEK.x;
    return `<ellipse data-cp="cheek-${side}" cx="${x}" cy="${CHEEK.y}" rx="${CHEEK.rx}" ry="${CHEEK.ry}" fill="url(#${id('cheek')})" transform="${cheekAt(side, 0)}"/>`;
  };
  const mouths = (Object.keys(art.mouths) as MouthShape[]).map((m) => `<g data-mouth="${m}"${m === 'rest' ? '' : ' visibility="hidden"'}>${art.mouths[m]}</g>`).join('');
  // Drawn as before he comes up, below the sill out of sight, until a frame moves him.
  const first = companionTransforms(BELOW);
  const of = (side: 'left' | 'right', part: 'leg' | 'cannon' | 'cast' | 'hoof' | 'hoofShadow' | 'contact'): string => first[`${part}${side === 'left' ? 'Left' : 'Right'}`];
  const shapes = (side: 'left' | 'right'): string =>
    `<path id="${id(`leg-${side}`)}" data-cp="leg-${side}" d="${of(side, 'leg')}"/>` +
    `<path id="${id(`cannon-${side}`)}" data-cp="cannon-${side}" d="${of(side, 'cannon')}"/>` +
    `<path id="${id(`cast-${side}`)}" data-cp="cast-${side}" d="${of(side, 'cast')}"/>`;
  // A little down and to the right of what throws it, the light being up and to the left.
  const cast = (side: 'left' | 'right', dx = 5, dy = 7): string => `<use href="#${id(`cast-${side}`)}" transform="translate(${dx} ${dy})"/>`;
  // A leg in his chest's fur and shading with no outline, so it grows out of his shoulder seamlessly, darker below the
  // sill: the forearm, then the cannon over it, the hoof on its end.
  const leg = (side: 'left' | 'right'): string => {
    const piece = (shape: string): string =>
      `<use href="#${shape}" fill="url(#${p}fur)"/><use href="#${shape}" fill="url(#${p}side)"/><use href="#${shape}" fill="url(#${id('shins')})"/>`;
    return (
      piece(id(`leg-${side}`)) +
      piece(id(`cannon-${side}`)) +
      `<g data-cp="hoof-${side}" transform="${of(side, 'hoof')}">${hoof(id(`hoof-${side}-`))}</g>`
    );
  };
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" width="100%" height="100%" preserveAspectRatio="xMidYMax meet" overflow="visible" aria-hidden="true" focusable="false">` +
    `<defs>` +
    // He is behind the sill: cut there only, so an ear or a sign may reach past the sides and top.
    `<clipPath id="${id('edge')}"><rect x="${v.x - v.w}" y="${v.y - v.h}" width="${3 * v.w}" height="${COMPANION_EDGE - (v.y - v.h)}"/></clipPath>` +
    // His forelegs come over the sill and may hang down the card's face.
    `<clipPath id="${id('legs')}"><rect x="${v.x - v.w}" y="${v.y - v.h}" width="${3 * v.w}" height="${COMPANION_EDGE + COMPANION_OVERHANG - (v.y - v.h)}"/></clipPath>` +
    `<clipPath id="${id('shoulders')}"><path d="${SHOULDERS}"/></clipPath>` +
    // What is on his face stays inside its outline as it turns.
    `<clipPath id="${id('face')}"><path d="${layers.shape}"/></clipPath>` +
    `<clipPath id="${id('half-left')}">${half('left')}</clipPath><clipPath id="${id('half-right')}">${half('right')}</clipPath>` +
    // The sill's shadow on his neck, darkest just where he goes on behind it.
    `<linearGradient id="${id('sill')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1608" stop-opacity="0"/><stop offset="0.54" stop-color="#2a1608" stop-opacity="0.42"/><stop offset="1" stop-color="#2a1608" stop-opacity="0.42"/></linearGradient>` +
    // Each foreleg's outlines and its shadow, which a frame redraws.
    shapes('left') +
    shapes('right') +
    // Where the legs' shadows fall: his chest under the chin and above the sill, and the card below it.
    `<clipPath id="${id('chest')}"><rect x="${v.x - v.w}" y="${CHIN}" width="${3 * v.w}" height="${COMPANION_EDGE - CHIN}"/></clipPath>` +
    `<clipPath id="${id('card')}"><rect x="${v.x - v.w}" y="${COMPANION_EDGE}" width="${3 * v.w}" height="${COMPANION_OVERHANG}"/></clipPath>` +
    `<radialGradient id="${id('contact')}"><stop offset="0" stop-color="${C.cardShade}" stop-opacity="0.6"/><stop offset="1" stop-color="${C.cardShade}" stop-opacity="0"/></radialGradient>` +
    // His own soft shadow on the card under his chest.
    `<radialGradient id="${id('ambient')}"><stop offset="0" stop-color="${C.cardShade}" stop-opacity="0.36"/><stop offset="0.55" stop-color="${C.cardShade}" stop-opacity="0.16"/><stop offset="1" stop-color="${C.cardShade}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${id('cheek')}"><stop offset="0" stop-color="${C.shade}" stop-opacity="0.34"/><stop offset="0.5" stop-color="${C.shade}" stop-opacity="0.2"/><stop offset="1" stop-color="${C.shade}" stop-opacity="0"/></radialGradient>` +
    // Below the sill, out of the light, the hanging legs darken down to the hoof.
    `<linearGradient id="${id('shins')}" gradientUnits="userSpaceOnUse" x1="0" y1="${COMPANION_EDGE}" x2="0" y2="${COMPANION_EDGE + 150}"><stop offset="0" stop-color="${C.edge}" stop-opacity="0"/><stop offset="1" stop-color="${C.edge}" stop-opacity="0.4"/></linearGradient>` +
    `</defs>` +
    `<g clip-path="url(#${id('edge')})"><g data-cp="body" transform="${first.body}">` +
    // His shoulders, behind his chest in its fur, with his neck's side shade.
    `<path d="${SHOULDERS}" fill="url(#${p}fur)"/><path d="${SHOULDERS}" fill="url(#${p}side)"/>` +
    `<g clip-path="url(#${id('shoulders')})">${neckShade}</g>` +
    (art.chest ?? art.body) +
    // Kept at the sill as he comes up, goes down or hops.
    `<g clip-path="url(#${p}figure)"><rect data-cp="sill" x="${v.x}" y="${COMPANION_EDGE - 70}" width="${v.w}" height="130" fill="url(#${id('sill')})" transform="${first.sill}"/></g>` +
    // The head in the round: each antler and ear on its own behind the outline where it grows, then the face's features.
    `<g data-cp="head">` +
    `<g data-cp="antler-left">${antlers.left.art}</g><g data-cp="antler-right">${antlers.right.art}</g>` +
    `<g data-cp="ear-left">${earRoot(p, 'left')}${rig.ears.left.art}</g>` +
    `<g data-cp="ear-right">${earRoot(p, 'right')}${rig.ears.right.art}</g>` +
    `<g data-cp="face">` +
    layers.outline +
    `<g clip-path="url(#${id('face')})"><g data-cp="features">${layers.features}</g>${cheek('left')}${cheek('right')}</g>` +
    `<g data-cp="gaze">` +
    rig.look.whites +
    `<g data-cp="pupil-left">${rig.look.left.art}</g><g data-cp="pupil-right">${rig.look.right.art}</g>` +
    lids('left') +
    lids('right') +
    mouths +
    `<g data-cp="nose">${art.overlay}</g>` +
    `</g>` +
    `</g>` +
    `</g>` +
    `</g></g>` +
    // His shadow on the card where he leans, which stays on the card as he hops.
    `<g clip-path="url(#${id('card')})"><ellipse data-cp="shade" rx="250" ry="62" fill="url(#${id('ambient')})" transform="${first.shade}"/></g>` +
    // The forelegs over the sill and down the card, in front of his chest, face and the card. Until his hooves are over the
    // sill they show only above it: the gate swaps which clip applies, since a browser may not redraw a moving clip.
    `<g data-cp="leg-gate" clip-path="${companionGate(prefix, first.legGate)}"><g data-cp="legs" transform="${first.legs}">` +
    // Their shadows on his chest below the chin and on the card, a near one and a fainter far one instead of a blur, plus
    // the knee's on the sill and the hoof's.
    `<g clip-path="url(#${id('chest')})"><g clip-path="url(#${p}figure)" fill="${C.shade}" fill-opacity="0.2">${cast('left')}${cast('right')}</g></g>` +
    `<g clip-path="url(#${id('card')})" fill="${C.cardShade}">` +
    `<g fill-opacity="0.22">${cast('left', 4, 6)}${cast('right', 4, 6)}</g>` +
    `<g fill-opacity="0.13">${cast('left', 10, 15)}${cast('right', 10, 15)}</g>` +
    `<ellipse data-cp="hoof-shadow-left" cy="40" rx="25" ry="25" fill-opacity="0.26" transform="${of('left', 'hoofShadow')}"/>` +
    `<ellipse data-cp="hoof-shadow-right" cy="40" rx="25" ry="25" fill-opacity="0.26" transform="${of('right', 'hoofShadow')}"/>` +
    `<ellipse data-cp="contact-left" rx="46" ry="14" fill="url(#${id('contact')})" transform="${of('left', 'contact')}"/>` +
    `<ellipse data-cp="contact-right" rx="46" ry="14" fill="url(#${id('contact')})" transform="${of('right', 'contact')}"/>` +
    `</g>` +
    leg('left') +
    leg('right') +
    `</g></g>` +
    `<g data-cp="emotes">${emotes(id('emote'))}</g>` +
    `</svg>`
  );
}

/** The clip a frame's `legGate` names for the drawing made with `prefix`: forelegs seen down the card's face, or only over the sill. */
export function companionGate(prefix: string, gate: CompanionGate): string {
  return `url(#${prefixFor(prefix)}-${gate === 'open' ? 'legs' : 'edge'})`;
}

/** The middle of his eyes in the companion's box, for a player to measure positions from. */
export const COMPANION_EYES: CharacterPoint = eyesMiddle(RIG);

// ─────────────────────────────────────────────────────────────── what he does

/** How long a mistake's question and a success's sparkles stay over his head (ms). */
const SIGN_MS = { question: 1900, spark: 1700, heart: 1300 } as const;

/** How long a word stays in its bubble, and how long after arriving he says hello (ms). */
const WORD_MS = 2300;
const HELLO_AFTER_MS = 700;

/** Left alone this long on the website, with nothing typed or being sent, he dozes (ms). */
export const COMPANION_DOZE_MS = 40_000;

/** How much of each reaction a tone keeps: the console's are the website's, smaller. */
const AMPLITUDE: Record<CompanionTone, number> = { playful: 1, calm: 0.55 };

/** One of the companion's acts: any of the character's, plus how far his head turns aside while it plays (-1 to 1, as a look). */
type CompanionAct = Act & { turn?: Keys };

/** An approving nod for a rightly filled box: a grin, a dip of the head, ears up, a sniff. */
const APPROVE: CompanionAct = {
  ms: 900,
  mouth: [[0.04, 0.82, 'i']],
  tilt: [
    [0, 0],
    [0.3, -4],
    [0.6, 2],
    [1, 0],
  ],
  earLeft: [
    [0, 0],
    [0.35, 10],
    [1, 0],
  ],
  earRight: [
    [0, 0],
    [0.35, 10],
    [1, 0],
  ],
  sniff: [
    [0, 1],
    [0.45, 1.07],
    [0.7, 1],
    [1, 1],
  ],
};

/** A hoof lifted a little from the sill and put down again, twice: pawing while waiting. */
const TAP = {
  ms: 700,
  keys: [
    [0, 0],
    [0.22, 0.2],
    [0.45, 0],
    [0.68, 0.14],
    [1, 0],
  ] as Keys,
};

/** A deer's stamp at something odd: knee up and hoof brought down hard, once. */
const STAMP = {
  ms: 560,
  keys: [
    [0, 0],
    [0.28, 0.42],
    [0.48, 0],
    [1, 0],
  ] as Keys,
};

/** How hard a key sets a hanging hoof swinging, the two in turn. */
const SWING_KICK = 1.1;

/**
 * He comes up with his hooves by his cheeks and lays them over the sill only when all the way up and at least this long
 * after starting; coming up with them down, his knees would seem to come out from under the card.
 */
const ARRIVING_MS = 800;
const CLIMB = 0.55;

/** How far below his place he keeps when low, as a share of the way out of sight: head and neck over the sill, shoulders behind. */
const LOW = 0.2;

/** A frame of him before he comes up, out of sight below the sill with hooves raised for the climb; the drawing starts so. */
const BELOW: CompanionFrame = {
  hoofLeft: CLIMB,
  hoofRight: CLIMB,
  swingLeft: CLIMB,
  swingRight: CLIMB,
  earLeft: 0,
  earRight: 0,
  tilt: 0,
  rise: 0,
  stretch: 1,
  sniff: 1,
  enter: 1,
  lean: 0,
  turn: 0,
  sway: 0,
  look: { x: 0, y: 0 },
  focus: 0,
  eyes: ['open', 'open'],
  mouth: 'rest',
  emote: null,
  say: null,
  asleep: false,
  moving: false,
  wakeAt: null,
};

/** A small ear flick as a key goes in: he is listening. */
const KEY_FLICK: Act = {
  ms: 260,
  earLeft: [
    [0, 0],
    [0.4, 5],
    [1, 0],
  ],
};

/** A mistake: a quick head shake, then the character's curious tilt and question. */
const SHAKE: CompanionAct = {
  ...ACTS.hmm,
  turn: [
    [0, 0],
    [0.06, -0.9],
    [0.13, 0.9],
    [0.2, -0.6],
    [0.27, 0.3],
    [0.34, 0],
    [1, 0],
  ],
};

/** How hard each key nudges him to lean in towards the box, and how long after a key his mouth stays round (ms). */
const LEAN_KICK = 7;
const OO_MS = 650;

/**
 * His head in the round, for turning it: each part moves as a point on a turned head would, so features in front go the
 * way he turns, parts behind go the other way and side parts come in as their side turns away. The ears and antlers stay
 * where they grow, one swinging behind and the other towards us, each seen narrower or wider as a flat thing is.
 */
const ROUND = {
  /** the middle of his head, which it turns about */
  centre: { x: HEAD_AXIS, y: 300 },
  /** how far it turns, in degrees, looking all the way to a side, up or down */
  yaw: 17,
  pitch: 6,
  /** how far each part stands in front of the middle (behind it below 0): the face's features, his jaw at the chin, the ears and antlers */
  features: 62,
  jaw: 30,
  ear: -10,
  antler: -24,
  /** how far each ear and antler faces out to its side, and how far each leans back, in degrees */
  earOut: 26,
  earBack: 14,
  /** how far in from where an ear turns its foot ends, under the head */
  earRoot: 20,
  antlerOut: 18,
  antlerBack: 24,
  /** how high on the head the outline starts coming round with the jaw */
  brow: 175,
  /** the bottom of his head's outline, under his chin */
  chin: 461,
} as const;

/** The shade on the right of his face as it turns away (the left mirrors it): just outside his outline, and how far in it comes at a full turn. */
const CHEEK = { x: 490, y: 318, rx: 84, ry: 200, reach: 80 } as const;

/** Where one side's face shade is with his head turned `share` of a full turn towards that side. */
function cheekAt(side: 'left' | 'right', share: number): string {
  const inward = CHEEK.reach * clamp(share, 0, 1.3) * (side === 'left' ? 1 : -1);
  return `translate(${n(inward)} 0)`;
}

/** How far his head is turned, from where he looks plus any extra turn (a shake): -1.3 to 1.3. */
const headTurn = (lookX: number, turn: number): number => clamp(lookX + turn, -1.3, 1.3);

/** Springs: how fast each part moves to its target and how much it overshoots (ζ under 1). */
interface Spring {
  k: number;
  zeta: number;
}

type Part = 'hoof' | 'swing' | 'ear' | 'sway' | 'tilt' | 'look' | 'focus' | 'enter' | 'lean';

const SPRINGS: Record<CompanionTone, Record<Part, Spring>> = {
  // A little overshoot on the hooves and ears and a pop as he comes up; what hangs from a knee follows it more slowly and
  // swings past, as his ears do after his head.
  playful: {
    hoof: { k: 150, zeta: 0.72 },
    swing: { k: 60, zeta: 0.5 },
    ear: { k: 220, zeta: 0.55 },
    sway: { k: 110, zeta: 0.4 },
    tilt: { k: 110, zeta: 0.8 },
    look: { k: 420, zeta: 1 },
    focus: { k: 160, zeta: 1 },
    enter: { k: 75, zeta: 0.62 },
    lean: { k: 260, zeta: 0.42 },
  },
  // Quick and settled in the console, but for a little bounce as he pops up and leans in.
  calm: {
    hoof: { k: 170, zeta: 1 },
    swing: { k: 90, zeta: 0.7 },
    ear: { k: 200, zeta: 0.9 },
    sway: { k: 160, zeta: 0.7 },
    tilt: { k: 110, zeta: 1 },
    look: { k: 420, zeta: 1 },
    focus: { k: 160, zeta: 1 },
    enter: { k: 95, zeta: 0.78 },
    lean: { k: 240, zeta: 0.55 },
  },
};

type Channel = 'hoofLeft' | 'hoofRight' | 'swingLeft' | 'swingRight' | 'earLeft' | 'earRight' | 'sway' | 'tilt' | 'lookX' | 'lookY' | 'focus' | 'enter' | 'lean';
const CHANNELS: readonly Channel[] = ['hoofLeft', 'hoofRight', 'swingLeft', 'swingRight', 'earLeft', 'earRight', 'sway', 'tilt', 'lookX', 'lookY', 'focus', 'enter', 'lean'];
const SPRING_OF: Record<Channel, Part> = {
  hoofLeft: 'hoof',
  hoofRight: 'hoof',
  swingLeft: 'swing',
  swingRight: 'swing',
  earLeft: 'ear',
  earRight: 'ear',
  sway: 'sway',
  tilt: 'tilt',
  lookX: 'look',
  lookY: 'look',
  focus: 'focus',
  enter: 'enter',
  lean: 'lean',
};

/** Where his look comes from: the pointer (or a glance), the caret, up in thought, or straight ahead. */
type LookAt = 'pointer' | 'field' | 'up' | 'ahead';

interface Pose {
  hooves: readonly [number, number];
  ears: readonly [number, number];
  tilt: number;
  eyes: readonly [EyeState, EyeState];
  look: LookAt;
  /** 0: pupils as drawn, turned in; 1: centred in each eye, looking */
  focus: number;
  mouth: MouthShape;
}

/** One frame of him, for `companionTransforms` and the eyes, mouth and signs. */
export interface CompanionFrame {
  /** each foreleg from 0, over the sill, to 1, its hoof over its eye */
  hoofLeft: number;
  hoofRight: number;
  /** each foreleg's cannon and hoof on the same measure, following the knee a moment later and swinging past rest and back */
  swingLeft: number;
  swingRight: number;
  /** each ear's lift in degrees, up positive */
  earLeft: number;
  earRight: number;
  /** the head's tilt in degrees */
  tilt: number;
  /** how far he is off the edge, as a share of his height, and his height about it, 1 as drawn */
  rise: number;
  stretch: number;
  /** the nose's size, 1 as drawn */
  sniff: number;
  /** how far below the sill he still is as he comes up, from 1 (out of sight) to 0 */
  enter: number;
  /** how far he leans in towards us, 0 as he sits */
  lean: number;
  /** how far his head is turned aside beyond where he looks (a shake), -1 to 1 */
  turn: number;
  /** how far his ears are turned on the same measure, after the head and swinging past it */
  sway: number;
  /** where the pupils look, each way from -1 to 1, and how far from as drawn (0) to looking (1) */
  look: CharacterPoint;
  focus: number;
  eyes: readonly [EyeState, EyeState];
  mouth: MouthShape;
  emote: CompanionEmote | null;
  /** a Kurdish word in a bubble (the website's), or none */
  say: CompanionWord | null;
  asleep: boolean;
  /** something is still moving, so the player draws another frame */
  moving: boolean;
  /** when still, when to draw the next frame (a blink, a glance, a sign ending), or null for never unless something happens */
  wakeAt: number | null;
}

/** Where the person's eyes draw his: the pointer and the caret as looks from his eyes (-1 to 1 each way), or null. */
export interface CompanionLooks {
  pointer: CharacterPoint | null;
  caret: CharacterPoint | null;
}

const NOWHERE: CompanionLooks = { pointer: null, caret: null };

/**
 * What Hevalo does frame by frame: fed what the person is doing (`set`) and one-off events (`react`), and asked for a frame
 * (`step`) whenever the platform draws. Springs smooth it, habits keep him alive and acts express; it knows when he is
 * still and says when to look again.
 */
export class CompanionMotion {
  private input: CompanionInput = { field: 'none', shown: false, status: 'idle', low: false };
  private readonly amp: number;
  private readonly springs: Record<Part, Spring>;
  private readonly x: Record<Channel, number> = { hoofLeft: 0, hoofRight: 0, swingLeft: 0, swingRight: 0, earLeft: 0, earRight: 0, sway: 0, tilt: 0, lookX: 0, lookY: 0, focus: 0, enter: 0, lean: 0 };
  private readonly v: Record<Channel, number> = { hoofLeft: 0, hoofRight: 0, swingLeft: 0, swingRight: 0, earLeft: 0, earRight: 0, sway: 0, tilt: 0, lookX: 0, lookY: 0, focus: 0, enter: 0, lean: 0 };
  private act: { act: CompanionAct; at: number } | null = null;
  private sign: { emote: CompanionEmote; until: number } | null = null;
  private word: { word: CompanionWord; at: number; until: number } | null = null;
  private blink: { at: number } | null = null;
  private glance: { look: CharacterPoint; until: number } | null = null;
  private eyesShown: readonly [EyeState, EyeState] = ['open', 'open'];
  private eyesVia: { until: number; to: readonly [EyeState, EyeState] } | null = null;
  private next = { blink: 0, glance: 0, twitch: 0, sniff: 0, tap: 0, swing: 0 };
  private tap: { side: 0 | 1; at: number; paw: { ms: number; keys: Keys }; size: number } | null = null;
  private arrived: number | null = null;
  /** going down to keep low: hooves lifted off the sill first, then down behind it with him */
  private sinking = false;
  private lastInput = 0;
  private last: number | null = null;
  private keys = 0;
  private ooUntil = 0;

  constructor(
    readonly tone: CompanionTone,
    private readonly random: () => number = Math.random,
  ) {
    this.amp = AMPLITUDE[tone];
    this.springs = SPRINGS[tone];
  }

  /** He comes on screen: climbs up from behind the sill with hooves by his cheeks, ears springing up and a blink, then lays his forelegs over the sill. */
  arrive(now: number): void {
    this.lastInput = now;
    this.arrived = now;
    this.sinking = false;
    this.x.enter = 1;
    this.v.enter = 0;
    // Out of sight below the sill his hooves are already up; kept low, they stay down behind the card.
    this.x.hoofLeft = this.x.hoofRight = this.x.swingLeft = this.x.swingRight = this.input.low ? 0 : CLIMB;
    this.v.hoofLeft = this.v.hoofRight = this.v.swingLeft = this.v.swingRight = 0;
    this.play(ACTS.arrive, now);
    if (this.tone === 'playful') this.word = { word: 'hello', at: now + HELLO_AFTER_MS, until: now + HELLO_AFTER_MS + WORD_MS };
    this.plan(now);
  }

  /** What the person is doing now. A status change gets a reaction: a question for a mistake, a hop for getting in. */
  set(next: Partial<CompanionInput>, now: number, word?: CompanionWord): void {
    const was = this.input;
    this.input = { ...was, ...next };
    this.lastInput = now;
    if (this.input.status !== was.status) {
      if (this.input.status === 'error') {
        this.play(SHAKE, now);
        this.tap = { side: this.random() < 0.5 ? 0 : 1, at: now, paw: STAMP, size: this.amp };
        this.sign = { emote: 'question', until: now + SIGN_MS.question };
      } else if (this.input.status === 'success') {
        this.play(ACTS.cheer, now);
        this.sign = { emote: 'spark', until: now + SIGN_MS.spark };
        if (this.tone === 'playful' && word) this.word = { word, at: now, until: now + WORD_MS };
      } else if (this.sign && this.sign.emote !== 'heart') {
        this.sign = null;
      }
    }
    if (this.input.field !== was.field) this.keys = 0;
    if (this.input.low !== was.low) {
      // Let out, he climbs out as he came up and lays his hooves over the sill once up; kept low again, he lifts them off
      // the sill first and goes down with them.
      if (!this.input.low) this.arrived = now;
      else this.sinking = this.x.enter < LOW - 0.03;
    }
  }

  /** A one-off event. */
  react(event: CompanionEvent, now: number): void {
    this.lastInput = now;
    if (event === 'greet') {
      this.play(ACTS.greet, now);
      if (this.tone === 'playful') {
        this.sign = { emote: 'heart', until: now + SIGN_MS.heart };
        if (!this.word || this.word.until < now) this.word = { word: 'hello', at: now, until: now + WORD_MS };
      }
    } else if (event === 'approve') {
      if (!this.act || this.act.act !== APPROVE) this.play(APPROVE, now);
    } else if (event === 'keystroke') {
      // An ear flick every few keys, never in the middle of something bigger.
      this.keys += 1;
      if (this.keys % 4 === 0 && !this.act && this.input.field !== 'secret') this.play(KEY_FLICK, now);
      // He leans in to each key with his mouth round and a hoof swinging, except while his eyes are covered.
      if (this.input.field !== 'secret') {
        this.v.lean += LEAN_KICK * this.amp;
        if (!this.input.low) this.v[this.keys % 2 ? 'swingLeft' : 'swingRight'] += SWING_KICK * this.amp;
        this.ooUntil = now + OO_MS;
      }
    }
  }

  /** Whether he is still coming up from behind the sill, or only just came up. */
  private climbing(now: number): boolean {
    return this.arrived !== null && (now - this.arrived < ARRIVING_MS || this.x.enter > 0.02);
  }

  /** Dozing: left alone long enough on the website with nothing in hand. */
  private asleep(now: number): boolean {
    const { field, status } = this.input;
    return this.tone === 'playful' && field === 'none' && status === 'idle' && now - this.lastInput >= COMPANION_DOZE_MS;
  }

  /** Where he is heading, from what the person is doing. */
  private pose(now: number): Pose {
    const { field, shown, status } = this.input;
    const a = this.amp;
    if (status === 'waiting' || this.asleep(now)) {
      return { hooves: [0, 0], ears: [-16 * a, -16 * a], tilt: 4 * a, eyes: ['closed', 'closed'], look: 'ahead', focus: 0, mouth: 'rest' };
    }
    if (status === 'busy') {
      return { hooves: [0, 0], ears: [6 * a, -4 * a], tilt: -3 * a, eyes: ['open', 'open'], look: 'up', focus: 1, mouth: 'rest' };
    }
    if (status === 'success') {
      // Let in: hooves up by his cheeks.
      return { hooves: [0.55, 0.55], ears: [12 * a, 12 * a], tilt: 0, eyes: ['happy', 'happy'], look: 'ahead', focus: 0, mouth: 'a' };
    }
    if (field === 'secret') {
      // Hooves over his eyes; when shown, the right comes down and that eye peeks over it.
      return shown
        ? { hooves: [1, 0.8], ears: [-6 * a, 6 * a], tilt: 0, eyes: ['closed', 'half'], look: 'field', focus: 1, mouth: 'rest' }
        : { hooves: [1, 1], ears: [-10 * a, -10 * a], tilt: 0, eyes: ['closed', 'closed'], look: 'ahead', focus: 0, mouth: 'mbp' };
    }
    if (field === 'text' || field === 'code') {
      // Watching the keys go in, his mouth round.
      const mouth: MouthShape = now < this.ooUntil ? 'o' : 'rest';
      return { hooves: [0, 0], ears: [6 * a, 6 * a], tilt: 0, eyes: ['open', 'open'], look: 'field', focus: 1, mouth };
    }
    return { hooves: [0, 0], ears: [0, 0], tilt: 0, eyes: ['open', 'open'], look: 'pointer', focus: 0, mouth: 'rest' };
  }

  private play(act: CompanionAct, now: number): void {
    this.act = { act, at: now };
  }

  /** When each habit next comes round, from now. */
  private plan(now: number): void {
    const calm = this.tone === 'calm' ? 1.6 : 1;
    this.next = {
      blink: now + between(HABITS.blink, this.random),
      glance: now + between(HABITS.glance, this.random) * calm,
      twitch: now + between(HABITS.twitch, this.random) * calm,
      sniff: now + between(HABITS.sniff, this.random) * calm,
      tap: now + between(HABITS.twitch, this.random) * 1.3,
      swing: now + between(HABITS.twitch, this.random) * 1.1 * calm,
    };
  }

  /** The habits due by now while he has nothing else to do: a blink, a glance, an ear twitch, a sniff, a hoof pawing or swinging. */
  private habits(now: number, pose: Pose): void {
    if (!this.next.blink) this.plan(now);
    const openEyes = pose.eyes[0] === 'open' && pose.eyes[1] === 'open';
    if (now >= this.next.blink) {
      if (openEyes && !this.blink) this.blink = { at: now };
      const twice = this.random() < HABITS.doubleBlink;
      this.next.blink = now + (twice ? 320 : between(HABITS.blink, this.random));
    }
    const free = this.input.field === 'none' && this.input.status === 'idle' && !this.act;
    if (now >= this.next.glance) {
      if (free) this.glance = { look: glanceTarget(this.random), until: now + between(HABITS.glanceHold, this.random) };
      this.next.glance = now + between(HABITS.glance, this.random) * (this.tone === 'calm' ? 1.6 : 1);
    }
    if (now >= this.next.twitch) {
      if (free) this.play(this.random() < 0.5 ? ACTS.twitchLeft : ACTS.twitchRight, now);
      this.next.twitch = now + between(HABITS.twitch, this.random) * (this.tone === 'calm' ? 1.6 : 1);
    }
    if (now >= this.next.sniff) {
      if (free && !this.act) this.play(ACTS.sniff, now);
      this.next.sniff = now + between(HABITS.sniff, this.random) * (this.tone === 'calm' ? 1.6 : 1);
    }
    // On the website a hoof paws the sill now and then.
    if (now >= this.next.tap) {
      if (free && !this.input.low && this.tone === 'playful' && !this.tap) this.tap = { side: this.random() < 0.5 ? 0 : 1, at: now, paw: TAP, size: 1 };
      this.next.tap = now + between(HABITS.twitch, this.random) * 1.3;
    }
    // Now and then a hanging hoof swings idly, in the console too.
    if (now >= this.next.swing) {
      if (free && !this.input.low && !this.tap && pose.hooves[0] === 0 && pose.hooves[1] === 0) this.v[this.random() < 0.5 ? 'swingLeft' : 'swingRight'] -= SWING_KICK * 1.6 * this.amp;
      this.next.swing = now + between(HABITS.twitch, this.random) * 1.1 * (this.tone === 'calm' ? 1.6 : 1);
    }
  }

  /** The eyes a blink is at, or null between blinks: half shut, shut, half shut. */
  private blinkEyes(now: number): EyeState | null {
    if (!this.blink) return null;
    const t = now - this.blink.at;
    if (t < BLINK_STEPS.half) return 'half';
    if (t < BLINK_STEPS.half + BLINK_STEPS.shut) return 'closed';
    if (t < 2 * BLINK_STEPS.half + BLINK_STEPS.shut) return 'half';
    this.blink = null;
    return null;
  }

  /** The eyes on the way to `to`, half shut for a moment between open and shut or pleased. */
  private eyesToward(to: readonly [EyeState, EyeState], now: number, instant: boolean): readonly [EyeState, EyeState] {
    if (this.eyesVia && now < this.eyesVia.until && this.eyesVia.to[0] === to[0] && this.eyesVia.to[1] === to[1]) return this.eyesShown;
    if (this.eyesVia && now >= this.eyesVia.until) {
      this.eyesShown = this.eyesVia.to;
      this.eyesVia = null;
    }
    if (this.eyesShown[0] === to[0] && this.eyesShown[1] === to[1]) return this.eyesShown;
    const via = (from: EyeState, goal: EyeState): EyeState => (from !== goal && from !== 'half' && goal !== 'half' ? 'half' : goal);
    const step: [EyeState, EyeState] = [via(this.eyesShown[0], to[0]), via(this.eyesShown[1], to[1])];
    if (instant || (step[0] === to[0] && step[1] === to[1])) {
      this.eyesShown = to;
      this.eyesVia = null;
    } else {
      this.eyesShown = step;
      this.eyesVia = { until: now + BLINK_STEPS.half, to };
    }
    return this.eyesShown;
  }

  /**
   * One frame at `now` (ms, the clock of `set` and `react`), given where the pointer and caret are as looks from his eyes.
   * `still` is for reduced motion: every part goes straight to its target, with no habits, acts, bounce or dozing; signs
   * and words, which do not move, stay.
   */
  step(now: number, looks: CompanionLooks = NOWHERE, still = false): CompanionFrame {
    // Time since the last frame, capped at a second, by which a movement has all but settled.
    const elapsed = this.last === null ? 0 : Math.min(1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (still) {
      this.act = null;
      this.blink = null;
      this.glance = null;
      this.tap = null;
      this.lastInput = now;
    }
    const pose = this.pose(now);
    if (!still) this.habits(now, pose);

    // What an act adds while it plays.
    let act: CompanionAct | null = null;
    let t = 0;
    if (this.act) {
      t = (now - this.act.at) / this.act.act.ms;
      if (t >= 1) this.act = null;
      else act = this.act.act;
    }
    const a = this.amp;
    const add = (keys: Act['earLeft']): number => (keys ? sampleKeys(keys, t) * a : 0);

    // Where he looks.
    if (this.glance && now >= this.glance.until) this.glance = null;
    let look: CharacterPoint = { x: 0, y: 0 };
    if (act?.look) look = act.look;
    else if (pose.look === 'field') look = looks.caret ?? looks.pointer ?? { x: 0, y: 0.4 };
    else if (pose.look === 'up') look = { x: 0.55, y: -0.8 };
    else if (pose.look === 'pointer') look = this.glance?.look ?? looks.pointer ?? { x: 0, y: 0 };
    const focus = act?.look || pose.look !== 'pointer' || this.glance || looks.pointer ? 1 : pose.focus;

    // The head leans a little after the caret, as a reader's does.
    const lean = pose.look === 'field' ? Math.max(-1, Math.min(1, look.x)) * 4 * a : 0;
    // A hoof pawing at the sill, or stamped on it.
    let drum = 0;
    if (this.tap) {
      const u = (now - this.tap.at) / this.tap.paw.ms;
      if (u >= 1) this.tap = null;
      else drum = sampleKeys(this.tap.paw.keys, u) * this.tap.size;
    }
    // Coming up or just up, the forelegs stay lifted from the climb; kept low they are down behind the card, except for a
    // moment while going down, lifted off the sill first.
    const low = this.input.low;
    if (this.sinking && (still || this.x.enter >= LOW - 0.03)) this.sinking = false;
    const climbing = !still && !low && this.climbing(now);
    const climb = climbing || this.sinking ? CLIMB : 0;
    const hoof = (side: 0 | 1): number => (low ? climb : Math.max(climb, pose.hooves[side] + (this.tap?.side === side ? drum : 0)));
    // Going down only once the hooves are off the sill.
    const lifted = Math.min(this.x.hoofLeft, this.x.hoofRight) > CLIMB * 0.7;
    const turn = act?.turn ? sampleKeys(act.turn, t) : 0;
    const target: Record<Channel, number> = {
      hoofLeft: hoof(0),
      hoofRight: hoof(1),
      swingLeft: hoof(0),
      swingRight: hoof(1),
      earLeft: pose.ears[0] + add(act?.earLeft),
      earRight: pose.ears[1] + add(act?.earRight),
      // The ears follow his head where it is, not where it is going (or, when still, go straight there with it).
      sway: headTurn(still ? look.x : this.x.lookX, turn),
      tilt: pose.tilt + lean + add(act?.tilt),
      lookX: look.x,
      lookY: look.y,
      focus,
      enter: low && (!this.sinking || lifted) ? LOW : 0,
      lean: 0,
    };

    let moving = false;
    for (const c of CHANNELS) {
      if (still) {
        this.x[c] = target[c];
        this.v[c] = 0;
        continue;
      }
      const { k, zeta } = this.springs[SPRING_OF[c]];
      const damping = 2 * zeta * Math.sqrt(k);
      // Steps of at most a sixtieth of a second, so a page drawing few frames moves him as far and as surely as one drawing many.
      const steps = Math.ceil(elapsed * 60);
      const dt = steps ? elapsed / steps : 0;
      for (let i = 0; i < steps; i += 1) {
        this.v[c] += (k * (target[c] - this.x[c]) - damping * this.v[c]) * dt;
        this.x[c] += this.v[c] * dt;
      }
      if (Math.abs(target[c] - this.x[c]) < 0.002 && Math.abs(this.v[c]) < 0.01) {
        this.x[c] = target[c];
        this.v[c] = 0;
      } else moving = true;
    }

    // The eyes: an act's, a blink's or the pose's, never straight from open to shut.
    const held = act ? sampleHold(act.eyes, t) : null;
    const blinking = held ? null : this.blinkEyes(now);
    const goal: readonly [EyeState, EyeState] = held ? [held, held] : blinking && pose.eyes[0] === 'open' && pose.eyes[1] === 'open' ? [blinking, blinking] : pose.eyes;
    const eyes = this.eyesToward(goal, now, still);
    const mouth = (act ? sampleHold(act.mouth, t) : null) ?? pose.mouth;

    // The sign over his head.
    if (this.sign && now >= this.sign.until) this.sign = null;
    const status = this.input.status;
    const emote: CompanionEmote | null =
      status === 'busy' ? 'think' : status === 'waiting' || (this.asleep(now) && !still) ? 'sleep' : (this.sign?.emote ?? null);
    if (this.word && now >= this.word.until) this.word = null;
    const say = this.word && now >= this.word.at ? this.word.word : null;

    const rise = act?.rise ? sampleKeys(act.rise, t) * a : 0;
    const stretch = act?.stretch ? 1 + (sampleKeys(act.stretch, t) - 1) * a : 1;
    const sniff = act?.sniff ? 1 + (sampleKeys(act.sniff, t) - 1) * a : 1;

    // All the way up with this frame: the next lays his forelegs over the sill.
    moving = moving || (climbing && !this.climbing(now)) || act !== null || this.blink !== null || this.eyesVia !== null || this.tap !== null;
    const climbEnds = this.arrived !== null ? this.arrived + ARRIVING_MS : undefined;
    const waits = [this.sign?.until, this.word ? (now < this.word.at ? this.word.at : this.word.until) : undefined, this.glance?.until, climbEnds, this.ooUntil];
    if (!still) {
      waits.push(this.next.blink, this.next.glance, this.next.twitch, this.next.sniff, this.next.tap, this.next.swing);
      if (this.tone === 'playful' && !this.asleep(now)) waits.push(this.lastInput + COMPANION_DOZE_MS);
    }
    const due = waits.filter((w): w is number => typeof w === 'number' && w > now);
    return {
      hoofLeft: this.x.hoofLeft,
      hoofRight: this.x.hoofRight,
      swingLeft: this.x.swingLeft,
      swingRight: this.x.swingRight,
      earLeft: this.x.earLeft,
      earRight: this.x.earRight,
      tilt: this.x.tilt,
      rise,
      stretch,
      sniff,
      enter: this.x.enter,
      lean: this.x.lean,
      turn,
      sway: this.x.sway,
      look: { x: this.x.lookX, y: this.x.lookY },
      focus: this.x.focus,
      eyes,
      mouth,
      emote,
      say,
      asleep: this.asleep(now) && !still,
      moving,
      wakeAt: due.length ? Math.min(...due) : null,
    };
  }
}

// ─────────────────────────────────────────────────────────────── from a frame to the drawing

/** The transform of each moving group for a frame, as SVG transform attributes in drawing units, plus the forelegs' outlines. */
export interface CompanionTransforms {
  body: string;
  head: string;
  /**
   * The head's parts turning in the round: each antler and ear where it grows, the face outline coming round with the jaw,
   * and the features (with the eyes, mouth and nose in `gaze`) furthest.
   */
  antlerLeft: string;
  antlerRight: string;
  earLeft: string;
  earRight: string;
  /** the shade on each side of his face, coming in as that side turns away */
  cheekLeft: string;
  cheekRight: string;
  face: string;
  features: string;
  gaze: string;
  pupilLeft: string;
  pupilRight: string;
  nose: string;
  /** the forelegs together, up with him as he hops or comes up */
  legs: string;
  /** whether the forelegs show down the card's face ('open', once he is up) or only over the sill ('shut'); `companionGate` names its clip */
  legGate: CompanionGate;
  /** the sill's shadow on him, kept at the sill as he comes up, goes down or hops */
  sill: string;
  /** each foreleg's forearm from the shoulder round the knee, as path data */
  legLeft: string;
  legRight: string;
  /** each cannon, from the knee to the fetlock, drawn over the forearm */
  cannonLeft: string;
  cannonRight: string;
  /** the shadow each foreleg throws */
  castLeft: string;
  castRight: string;
  /** each hoof on the end of its leg, and its shadow on the card */
  hoofLeft: string;
  hoofRight: string;
  hoofShadowLeft: string;
  hoofShadowRight: string;
  /** his shadow on the card where he leans on it */
  shade: string;
  /** each knee's shadow on the sill, gone as it lifts */
  contactLeft: string;
  contactRight: string;
}

/** Which clip the forelegs have: open over the card's face, or shut at the sill. */
export type CompanionGate = 'open' | 'shut';

/** The parts of `CompanionTransforms` that are path data drawn anew rather than transforms. */
export const COMPANION_OUTLINES = [
  'legLeft',
  'legRight',
  'cannonLeft',
  'cannonRight',
  'castLeft',
  'castRight',
] as const satisfies readonly (keyof CompanionTransforms)[];


const ease = (t: number): number => t * t * (3 - 2 * t);
const clamp = (t: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, t));

/** A scale to a thousandth; a tenth is too coarse for a lean or a sniff. */
const f3 = (v: number): string => String(Math.round(v * 1000) / 1000);

/** One foreleg measure (`LEG_KEYS` column `i`) at `k`, on a smooth curve through the keys and straight on past the last. */
function legKey(k: number, i: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): number {
  const keys = LEG_KEYS;
  const at = (j: number): number => keys[j]![i];
  const kk = (j: number): number => keys[j]![0];
  const last = keys.length - 1;
  const slope = (j: number): number => (at(j + 1) - at(j)) / (kk(j + 1) - kk(j));
  // Each key's tangent: the mean of the slopes either side, or the one slope at an end.
  const tangent = (j: number): number => (j === 0 ? slope(0) : j === last ? slope(last - 1) : (slope(j - 1) + slope(j)) / 2);
  if (k <= kk(0)) return at(0);
  if (k >= kk(last)) return at(last) + tangent(last) * (k - kk(last));
  let j = 0;
  while (k > kk(j + 1)) j += 1;
  const h = kk(j + 1) - kk(j);
  const t = (k - kk(j)) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * at(j) + (t3 - 2 * t2 + t) * h * tangent(j) + (-2 * t3 + 3 * t2) * at(j + 1) + (t3 - t2) * h * tangent(j + 1);
}

/**
 * A foreleg `v` of the way from over the sill (0) to its hoof over its eye (1), with what hangs from the knee at `swing`,
 * which lags `v` and may swing past rest (below 0) out from the face. Two outlines: the forearm from the shoulder, staying in
 * his chest's brown side wherever the leg goes, round the knee; and the cannon over it to the fetlock, with the hoof on its
 * end. Raised, the leg is a little larger, being nearer.
 */
function foreleg(
  side: 'left' | 'right',
  v: number,
  swing: number,
): { outline: string; cannon: string; cast: string; hoof: string; hoofShadow: string; contact: string } {
  const k = clamp(v, 0, 1.06);
  const w = clamp(swing, 0, 1.06);
  const flip = side === 'left' ? 1 : -1;
  // The shoulders are either side of his chest; the hooves go to his eyes, a little to one side of it.
  const face = BODY_AXIS + (FACE_AXIS - BODY_AXIS) * clamp(k * 1.4, 0, 1);
  const across = (x: number, axis: number): number => (side === 'left' ? x : 2 * axis - x);
  const shoulder = { x: across(legKey(k, 1), BODY_AXIS), y: legKey(k, 2) };
  const knee = { x: across(legKey(k, 3), face), y: legKey(k, 4) };
  const size = legKey(k, 8);
  const turn = flip * (legKey(w, 5) + Math.max(0, -swing) * SWING_TURN);
  const cannon = legKey(w, 6) * size;
  const a = (turn * Math.PI) / 180;
  const fetlock = { x: knee.x - Math.sin(a) * cannon, y: knee.y + Math.cos(a) * cannon };
  // Out from the face across a part of the leg: whichever way across is away from the middle.
  const outFrom = (a: CharacterPoint, b: CharacterPoint): CharacterPoint => {
    const way = unit(minus(b, a));
    return way.y * flip > 0 ? { x: -way.y, y: way.x } : { x: way.y, y: -way.x };
  };
  // A part coming towards us and seen short shows less of its shape: its rounds become a plain taper from first to last, and
  // once those two overlap it is only the two.
  const part = (a: CharacterPoint, b: CharacterPoint, rows: typeof FOREARM, rest: number, first: boolean): Round[] => {
    const [t0, h0] = rows[0]!;
    const [, h1] = rows[rows.length - 1]!;
    const ends = (h0 + h1) * size;
    const full = clamp((Math.hypot(b.x - a.x, b.y - a.y) - ends) / (rest * SEEN_SHORT - ends), 0, 1);
    const rounds = rows.map(([t, half, out], i) => {
      const plain = h0 + ((h1 - h0) * (t - t0)) / (1 - t0);
      return {
        c: plus(plus(a, minus(b, a), t), outFrom(a, b), out * size * full),
        // Nearer to us as it rises, all but the shoulder, which stays in his side.
        r: (plain + (half - plain) * full) * (first && i === 0 ? Math.sqrt(size) : size),
      };
    });
    return full > 0 ? rounds : [rounds[0]!, rounds[rounds.length - 1]!];
  };
  // Two pieces, the forearm round the knee and the cannon over it, so neither outline crosses itself however far the knee
  // bends.
  const forearm = part(shoulder, knee, FOREARM, FOREARM_LONG, true);
  const upper = legOutline(forearm);
  const below = legOutline([forearm[forearm.length - 1]!, ...part(knee, fetlock, CANNON, CANNON_LONG, false)]);
  // The shadow starts halfway down the forearm, narrower than the leg, so none shows where it leaves the shoulder.
  const from = Math.min(2, forearm.length - 1);
  const cast = legOutline([{ ...forearm[from]!, r: forearm[from]!.r * 0.7 }, ...forearm.slice(from + 1)]) + below;
  const lifted = clamp((COMPANION_EDGE - 6 - knee.y) / 40, 0, 1);
  const hoof = `translate(${n(fetlock.x)} ${n(fetlock.y)}) rotate(${n(turn + flip * legKey(w, 7))}) scale(${f3(size * HOOF)} ${f3(size * HOOF * legKey(w, 9))})`;
  return {
    outline: upper,
    cannon: below,
    cast,
    hoof,
    // The hoof's shadow, on the card only, down and to the right like the leg's.
    hoofShadow: `translate(6 10) ${hoof}`,
    contact: `translate(${n(knee.x + 5)} ${COMPANION_EDGE + 4}) scale(${f3(1 - ease(lifted))})`,
  };
}

const DEG = Math.PI / 180;

/** Where each ear is held to the head: the inner end of its foot, level with where it turns to twitch. */
const earRootAt = (side: 'left' | 'right'): CharacterPoint => {
  const pivot = RIG.rig!.ears[side].pivot;
  return { x: pivot.x + (side === 'left' ? ROUND.earRoot : -ROUND.earRoot), y: pivot.y };
};

/** How a point `depth` in front of the head's middle moves as the head turns `yaw` across (his left, our right, above 0) and `pitch` down, in radians. */
function inTheRound(p: CharacterPoint, depth: number, yaw: number, pitch: number): CharacterPoint {
  const x = p.x - ROUND.centre.x;
  const y = p.y - ROUND.centre.y;
  const across = x * Math.cos(yaw) + depth * Math.sin(yaw);
  const nearer = depth * Math.cos(yaw) - x * Math.sin(yaw);
  return { x: across - x, y: y * Math.cos(pitch) + nearer * Math.sin(pitch) - y };
}

/**
 * An ear or antler on the turned head. It moves with the point it grows from (`pivot`, `depth` in front of the head's
 * middle); it leans back `back` degrees, so its tip swings opposite its foot and it shortens as the head tips back; and it
 * narrows as its side turns away and widens coming round (facing `out` degrees to its side), as far as it has turned
 * itself (`own`; an ear lags the head). All about `root`, where it is held to the head; `lift` first turns it about
 * `pivot` (an ear's twitch).
 */
function onTheHead(side: 'left' | 'right', pivot: CharacterPoint, depth: number, yaw: number, pitch: number, out: number, back: number, own = yaw, lift = 0, root = pivot): string {
  const move = inTheRound(root, depth, yaw, pitch);
  const o = out * DEG;
  const b = back * DEG;
  const wide = Math.cos(o + (side === 'left' ? -own : own)) / Math.cos(o);
  const tall = Math.cos(b - pitch) / Math.cos(b);
  const lean = Math.atan(Math.tan(b) * Math.sin(yaw)) / DEG;
  return (
    `translate(${n(move.x + root.x)} ${n(move.y + root.y)}) skewX(${n(lean)}) scale(${f3(wide)} ${f3(tall)}) translate(${n(-root.x)} ${n(-root.y)})` +
    (lift ? ` rotate(${n(lift)} ${n(pivot.x)} ${n(pivot.y)})` : '')
  );
}

/** His shadow on the card under his chest: none while below the sill, smaller and fainter as he hops off it. */
function shadeAt(enter: number, rise: number): string {
  const there = 1 - clamp(enter * 3, 0, 1);
  const lift = clamp(rise * 5, 0, 0.6);
  return `translate(${BODY_AXIS} ${COMPANION_EDGE}) scale(${f3(there * (1 - lift * 0.3))} ${f3(there * (1 - lift))})`;
}

export function companionTransforms(frame: CompanionFrame): CompanionTransforms {
  const rig = RIG.rig!;
  const pivot = RIG.headPivot;
  const shift = pupilShift(RIG, frame.look, frame.focus);
  // Up for a hop, down behind the sill before he has come up.
  const up = frame.rise * RIG.bust.h - frame.enter * ENTER_DROP;
  // The head turns in the round towards where he looks, further for a shake, and nearer as he leans in.
  const yaw = headTurn(frame.look.x, frame.turn) * ROUND.yaw * DEG;
  const pitch = clamp(frame.look.y, -1, 1) * ROUND.pitch * DEG;
  // The ears turn with his head a moment later and swing past it.
  const sway = clamp(frame.sway, -1.6, 1.6) * ROUND.yaw * DEG;
  const near = 1 + clamp(frame.lean, -0.4, 1.4) * 0.07;
  // The outline comes round with his jaw and not at all at the brow; the face's features, in front, move furthest.
  const jaw = (Math.sin(yaw) * ROUND.jaw) / (ROUND.chin - ROUND.brow);
  const drop = Math.sin(pitch) * ROUND.jaw * 0.5;
  const front = inTheRound({ x: ROUND.centre.x, y: COMPANION_EYES.y }, ROUND.features, yaw, pitch);
  const inner = `translate(${n(front.x - (COMPANION_EYES.y - ROUND.brow) * jaw)} ${n(front.y - drop)})`;
  const ears = rig.ears;
  const antlers = rig.antlers!;
  const tall = frame.stretch;
  // A crouch spreads a little and a stretch narrows, as something soft does.
  const wide = 1 + (1 - tall) * 0.6;
  const edge = COMPANION_EDGE;
  const left = foreleg('left', frame.hoofLeft, frame.swingLeft);
  const right = foreleg('right', frame.hoofRight, frame.swingRight);
  return {
    body: `translate(0 ${n(-up)}) translate(${n(pivot.x)} ${edge}) scale(${f3(wide)} ${f3(tall)}) translate(${n(-pivot.x)} ${-edge})`,
    head: `rotate(${n(frame.tilt)} ${n(pivot.x)} ${n(pivot.y)}) translate(${n(pivot.x)} ${n(pivot.y)}) scale(${f3(near)}) translate(${n(-pivot.x)} ${n(-pivot.y)})`,
    antlerLeft: onTheHead('left', antlers.left.pivot, ROUND.antler, yaw, pitch, ROUND.antlerOut, ROUND.antlerBack),
    antlerRight: onTheHead('right', antlers.right.pivot, ROUND.antler, yaw, pitch, ROUND.antlerOut, ROUND.antlerBack),
    earLeft: onTheHead('left', ears.left.pivot, ROUND.ear, yaw, pitch, ROUND.earOut, ROUND.earBack, sway, frame.earLeft, earRootAt('left')),
    earRight: onTheHead('right', ears.right.pivot, ROUND.ear, yaw, pitch, ROUND.earOut, ROUND.earBack, sway, -frame.earRight, earRootAt('right')),
    cheekLeft: cheekAt('left', -Math.sin(yaw) / Math.sin(ROUND.yaw * DEG)),
    cheekRight: cheekAt('right', Math.sin(yaw) / Math.sin(ROUND.yaw * DEG)),
    face: `translate(0 ${n(drop)}) translate(0 ${ROUND.brow}) skewX(${n(Math.atan(jaw) / DEG)}) translate(0 ${-ROUND.brow})`,
    features: inner,
    gaze: inner,
    pupilLeft: `translate(${n(shift.left.x)} ${n(shift.left.y)})`,
    pupilRight: `translate(${n(shift.right.x)} ${n(shift.right.y)})`,
    nose: `translate(${n(rig.sniff.x)} ${n(rig.sniff.y)}) scale(${f3(frame.sniff)}) translate(${n(-rig.sniff.x)} ${n(-rig.sniff.y)})`,
    legs: `translate(0 ${n(-up)})`,
    legGate: frame.enter * ENTER_DROP > KNEES_OVER ? 'shut' : 'open',
    sill: `translate(0 ${n(up)})`,
    legLeft: left.outline,
    legRight: right.outline,
    cannonLeft: left.cannon,
    cannonRight: right.cannon,
    castLeft: left.cast,
    castRight: right.cast,
    hoofLeft: left.hoof,
    hoofRight: right.hoof,
    hoofShadowLeft: left.hoofShadow,
    hoofShadowRight: right.hoofShadow,
    shade: shadeAt(frame.enter, frame.rise),
    contactLeft: left.contact,
    contactRight: right.contact,
  };
}

/** Where something on screen is, as a look from his eyes: `box` is where the SVG is drawn, `x`, `y` the point; far is two of his widths. */
export function companionLook(box: { left: number; top: number; width: number; height: number }, x: number, y: number): CharacterPoint {
  const v = COMPANION_VIEW;
  // Drawn standing on the bottom of its box, as wide as the box allows (xMidYMax meet).
  const scale = Math.min(box.width / v.w, box.height / v.h);
  const ex = box.left + box.width / 2 + (COMPANION_EYES.x - (v.x + v.w / 2)) * scale;
  const ey = box.top + box.height - (v.y + v.h - COMPANION_EYES.y) * scale;
  const dx = x - ex;
  const dy = y - ey;
  const far = v.w * scale * 2;
  const d = Math.hypot(dx, dy);
  if (!(d > 0) || !(far > 0)) return { x: 0, y: 0 };
  const s = Math.min(1, d / far);
  return { x: (dx / d) * s, y: (dy / d) * s };
}
