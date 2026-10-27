import type { Viseme } from '../lipsync/visemes.js';
import { n, prefixFor } from '../art/svg.js';
import { drawHevalo } from './hevalo.js';
import { ACTS, BLINK_STEPS, HABITS, between, eyesMiddle, glanceTarget, pupilShift, sampleHold, sampleKeys, type Act, type Keys } from './life.js';
import type { CharacterPoint, EyeState } from './types.js';

/**
 * Hevalo as a companion beside a form, drawn as the mascot is from the chest
 * up: his head, his slim neck, and his chest with the cream of it. The
 * form's card is a windowsill and he is outside it, leaning in: the rest of
 * him goes on down behind the card, and his forelegs come over the sill. As
 * in the mascot, a foreleg seen from in front is the brown side of his
 * chest going on down: its shoulder is his chest's own fur, so it has no
 * edge there; it slims above the knee, and below the knee, on the sill, it
 * is a deer's long slim cannon and cloven hoof, hanging down the card's face.
 * He throws his shadow on the card where he leans on it, and each leg and
 * hoof throws its own, all soft-edged shapes rather than blurs, so a slow
 * phone draws him as easily as a fast one. Nothing of him ever
 * comes out from behind the card but the whole of him: he pops up from
 * behind it as the page opens, his hooves up by his cheeks, and then lays
 * them over the sill.
 *
 * He turns his head after the caret along a box being typed in, as a head
 * in the round turns: what is on his face comes round furthest, the side
 * turning away falls into shade, and his ears and antlers stay on his head
 * where they grow from it, the one on the side he turns to going round
 * behind and the other coming round towards us, his ears swinging on a
 * moment after. He leans in a little with each key, his mouth round in an
 * "oo", a hanging hoof swinging, and an address that looks whole gets a
 * grin and a nod. His legs move as legs do: the knee leads and what hangs
 * from it follows a moment later and swings on. For a password he lifts his
 * hooves over his eyes, and when the password is shown he lowers one and
 * peeks over it.
 * While a form is being sent he looks up and thinks; a mistake gets a shake
 * of the head, a stamp of a hoof as a deer gives at something odd, and a
 * question, never a sad face; getting in gets a hop, his hooves up. Left
 * alone he breathes, blinks, glances about, twitches an ear, sniffs, lets a
 * hanging hoof swing and paws at the sill; on the website, left long enough,
 * he dozes. A tap gets a greeting.
 *
 * Everything here is the same for every platform and touches no page: the
 * drawing as markup (`companionSvg`), what he does (`CompanionMotion`, fed
 * with what the person is doing and asked for a frame whenever the platform
 * draws), and how a frame turns into the drawing's transforms
 * (`companionTransforms`). Each app keeps only a thin player that reads the
 * pointer and the caret, draws, and sleeps when he is still.
 *
 * Two tones for two audiences: `playful` on the website, for learners of
 * every age, with a bouncy entrance, a hello with his hooves, a heart, a
 * Kurdish word now and then and a doze; `calm` in the admin console, for
 * staff at work, with the same reactions at a smaller size, no words and no
 * doze.
 */

export type CompanionTone = 'playful' | 'calm';

/** What the person is in: nothing, a box of ordinary text, a password, or a code of digits. */
export type CompanionField = 'none' | 'text' | 'secret' | 'code';

/** Where the form is: being filled in, being sent, refused, let in, or paused for a while. */
export type CompanionStatus = 'idle' | 'busy' | 'error' | 'success' | 'waiting';

export interface CompanionInput {
  field: CompanionField;
  /** the password is shown as typed */
  shown: boolean;
  status: CompanionStatus;
}

/** Something that happened once: a tap, a box filled in rightly, a key. */
export type CompanionEvent = 'greet' | 'approve' | 'keystroke';

/** A small sign over his head, in no language: thinking, a question, sparkles, a heart, sleep. */
export type CompanionEmote = 'think' | 'question' | 'spark' | 'heart' | 'sleep';

/** The Kurdish words he says on the website, Kurmancî, the language Hevalo teaches first. */
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

/**
 * Where the card's top edge crosses his chest, in the character's units,
 * below his shoulders and the top of the cream of his chest. The card is a
 * windowsill: he is outside, behind it, leaning in over it, so the rest of
 * him goes on down behind the card and is never seen cut off.
 */
export const COMPANION_EDGE = 740;

/** The companion's box: him from the chest up, with room above the antlers for a sign. Its bottom is the sill. */
export const COMPANION_VIEW = { x: -15, y: -78, w: 540, h: COMPANION_EDGE + 78 } as const;

/** The character he is drawn from, with the rig his moving parts turn on. */
const RIG = drawHevalo('cprig-');

/** How far below the sill his forelegs may hang, over the card's face: the platform keeps that much of the card's top clear. */
export const COMPANION_OVERHANG = 285;

/** How far below the sill he waits before he pops up into view. */
const ENTER_DROP = 860;

/** How far below his place he is, coming up, when his forelegs may first show below the sill: his hooves, lifted, are well over it by then. */
const KNEES_OVER = 40;

/**
 * Each foreleg, the left (the right is its mirror), from resting over the
 * sill (0) through pawing at it and the knee lifting, the hoof tucked under
 * it, then sweeping up in front of his chest to his cheek, and on to just
 * under the eye, for a peek, and over it (1). For each: where the shoulder
 * is, on the brown side of his chest; where the knee is; which way the
 * cannon goes from the knee (degrees: 0 straight down, more turning the hoof
 * out from the face, less in across it and on round and up); how long the
 * cannon is seen, shorter as it comes towards us; how far the hoof tips on
 * from it; how large the leg is, nearer to us as it rises; and how long the
 * hoof is seen. At rest the leg runs on down his side to the knee on the
 * sill, and the cannon hangs from it down the card's face; raised, the
 * shoulder lifts a little, as in a shrug.
 */
const LEG_KEYS: readonly (readonly [k: number, sx: number, sy: number, kx: number, ky: number, turn: number, cannon: number, tip: number, size: number, hoof: number])[] = [
  [0, 138, 612, 96, 746, 2, 185, 0, 1, 1],
  [0.2, 138, 610, 98, 738, -10, 150, -18, 1.02, 0.85],
  [0.32, 138, 606, 96, 686, -26, 84, -26, 1.04, 0.75],
  [0.44, 138, 603, 82, 616, -96, 40, -10, 1.07, 0.6],
  [0.55, 139, 600, 112, 540, -210, 110, 6, 1.1, 1],
  [0.8, 140, 598, 150, 506, -178, 104, 0, 1.14, 1],
  [1, 141, 596, 160, 480, -174, 130, 0, 1.16, 1],
];

/**
 * A deer's foreleg from in front, at its size as drawn: the rounds its
 * outline passes round, down the forearm (from the shoulder to the knee) and
 * down the cannon (from the knee to the fetlock), each as how far along its
 * part, half the leg's width there, and how far out from the face it sits,
 * so the forearm's outer side keeps to his chest's while it slims from the
 * inside. The forearm full at the shoulder and in its muscle below, slimming
 * above the knee; the knee's knob; the slim cannon, a little fuller again at
 * the fetlock.
 */
const FOREARM: readonly (readonly [along: number, half: number, out: number])[] = [
  [0, 34, 0],
  [0.45, 35, 10],
  [0.84, 27, 8],
  [1, 31, 0],
];
const CANNON: readonly (readonly [along: number, half: number, out: number])[] = [
  [0.2, 23, 0],
  [0.6, 20.5, 0],
  [1, 24, 0],
];

/** How large a hoof is drawn on a leg of this size, to the leg's fetlock. */
const HOOF = 1.24;

/** How far a hanging cannon swings out, in degrees, for each unit its swing goes on past rest. */
const SWING_TURN = 70;

/** The middle of his chest, his shoulders either side of it; his eyes are a little to the left. */
const BODY_AXIS = 257.5;

/** Just under his chin, however he turns his head: a leg's shadow falls on his chest from here down, never on his face. */
const CHIN = 505;

/** The middle of the face, where each eye's state is split from the other's, and the upright line his head is drawn about. */
const FACE_AXIS = 253.5;
const HEAD_AXIS = 255;

/** Where the signs stand: over his right shoulder, clear of the antlers. */
const EMOTE_AT = { x: 446, y: -22 } as const;

const C = {
  // a leg's fur is his chest's own (the character's gradients), the hanging part darkening down the cannon
  edge: '#8f5a2c',
  pastern: '#a86f3c',
  coronet: '#9a6638',
  hoofLight: '#8a6447',
  hoof: '#73503a',
  hoofDeep: '#4e3324',
  shine: '#b89276',
  shade: '#2a1608',
  // a shadow on the card, which may be light or dark: near black, brown in it
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

/** The normals of the lines touching rounds `a` and `b` on either side, and the way from one to the other: the two sides of a limb tapering between them. */
function sides(a: Round, b: Round): { way: CharacterPoint; one: CharacterPoint; two: CharacterPoint } {
  const way = unit(minus(b.c, a.c));
  const c = Math.max(-0.95, Math.min(0.95, (a.r - b.r) / Math.max(1e-6, Math.hypot(b.c.x - a.c.x, b.c.y - a.c.y))));
  const s = Math.sqrt(1 - c * c);
  return { way, one: { x: c * way.x + s * way.y, y: c * way.y - s * way.x }, two: { x: c * way.x - s * way.y, y: c * way.y + s * way.x } };
}

/** The arc of the circle about `c` from `from` to `to`, the way round that passes `via`. */
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
 * A foreleg's outline, all of a piece, round the rounds from the shoulder
 * (the first, which is inside his chest) to the fetlock (the last): down one
 * side, round the fetlock, up the other and round the shoulder. From one
 * round to the next each side runs straight, touching both; where a side
 * turns outward, as round the knee, it runs round the round, and where it
 * turns in, as above the knee, the two runs are cut back to where they cross
 * and it eases through the turn, so the leg has no corners and no notches.
 * And its rim, the line along it that is shaded, from below the shoulder
 * round to the same place on the other side: none at the shoulder, which is
 * his chest's own fur.
 */
function legOutline(all: readonly Round[]): { outline: string; rim: string } {
  // a round inside the one before or after it, as when the cannon comes towards us and is seen short, adds nothing
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
    return { outline: circle, rim: '' };
  }
  const pairs = rounds.slice(0, last).map((a, i) => ({ ...sides(a, rounds[i + 1]!), a, b: rounds[i + 1]! }));
  // each side's straight runs in the order the outline goes along them, and the rounds where one meets the next
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
  // down side one from run `start`, round the fetlock, and up side two as far
  const along = (start: number): string => {
    let d = '';
    for (let i = start; i < last; i += 1) d += `L${xy(one[i]!.to)}${i < last - 1 ? oneJoins[i] : ''}`;
    d += tip;
    for (let j = 0; j < last - start; j += 1) d += `L${xy(two[j]!.to)}${j < last - start - 1 ? twoJoins[j] : ''}`;
    return d;
  };
  // the rim starts a round down the leg, where there is one to start from
  const from = last > 1 ? 1 : 0;
  return {
    outline: `M${xy(one[0]!.from)}${along(0)}${crown}Z`,
    rim: `M${xy(one[from]!.from)}${along(from)}`,
  };
}

/** A straight run of a leg's side, from one round to the next. */
interface Run {
  from: CharacterPoint;
  to: CharacterPoint;
}

/**
 * Where run `a` meets run `b` about round `o`, as path from the end of `a`
 * to the start of `b`: round the round where the side turns out; where it
 * turns in, both runs cut back to where they cross (they are changed here)
 * and a curve eases from one to the other through the crossing.
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
  // the runs do not cross where they should: meet halfway, so the side never doubles back
  const halfway = { x: (a.to.x + b.from.x) / 2, y: (a.to.y + b.from.y) / 2 };
  a.to = halfway;
  b.from = halfway;
  return '';
}

/**
 * A hoof, from the fetlock (0,0) on along the leg: the pastern, darkening to
 * the coronet, and a deer's cloven hoof, two toes full at the top and
 * pointed at the tip, the split between them, each with the soft shine of
 * horn on its outer side.
 */
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
 * The foot of an ear run on in under his head, in the ear's own light (the
 * character's gradient): its inner edge carries on the way it was going, in
 * under the head. So an ear coming round with a turning head, or lowered,
 * shows a little more of itself there, never where it was cut off.
 */
function earRoot(p: string, side: 'left' | 'right'): string {
  const at = (x: number, y: number): string => xy(side === 'left' ? { x, y } : { x: 2 * HEAD_AXIS - x, y });
  return `<path d="M${at(118, 236)}L${at(128, 210)}L${at(138, 185)}L${at(140, 172)}Q${at(147, 181)} ${at(151, 190)}Q${at(154, 200)} ${at(148, 216)}L${at(132, 238)}Z" fill="url(#${p}ear${side === 'left' ? 'L' : 'R'})"/>`;
}

/** The signs over his head, each hidden until it is the one shown (the platform's stylesheet brings it in). */
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
    // thinking: a little cloud, its trail coming from his head, three dots in it
    `<g data-emote="think" visibility="hidden">` +
    `<circle cx="${x - 70}" cy="${y + 66}" r="9" fill="#ffffff" stroke="${C.ink}" stroke-opacity="0.25" stroke-width="3"/>` +
    `<circle cx="${x - 48}" cy="${y + 40}" r="14" fill="#ffffff" stroke="${C.ink}" stroke-opacity="0.25" stroke-width="3"/>` +
    `<ellipse cx="${x}" cy="${y - 4}" rx="62" ry="42" fill="#ffffff" stroke="${C.ink}" stroke-opacity="0.25" stroke-width="3"/>` +
    [-24, 0, 24].map((dx, i) => `<circle class="cp-dot cp-dot-${i}" cx="${x + dx}" cy="${y - 4}" r="8" fill="${C.ink}"/>`).join('') +
    `</g>` +
    // a question, curious rather than sorry
    `<g data-emote="question" visibility="hidden"><text x="${x - 6}" y="${y + 24}" font-size="92" font-weight="800" font-family="system-ui, sans-serif" text-anchor="middle" ${outlined}>?</text></g>` +
    // let in: sparkles
    `<g data-emote="spark" visibility="hidden">${star(x - 20, y - 6, 30, 'cp-spark cp-spark-0')}${star(x + 34, y + 44, 20, 'cp-spark cp-spark-1')}${star(x + 30, y - 52, 15, 'cp-spark cp-spark-2')}</g>` +
    // a greeting: a heart
    `<g data-emote="heart" visibility="hidden"><path d="M${x},${y + 30}C${x - 70},${y - 12} ${x - 40},${y - 62} ${x},${y - 28}C${x + 40},${y - 62} ${x + 70},${y - 12} ${x},${y + 30}Z" fill="${C.heart}" stroke="#ffffff" stroke-width="6"/></g>` +
    // asleep: three z's drifting up
    `<g data-emote="sleep" visibility="hidden">` +
    [0, 1, 2]
      .map((i) => `<text class="cp-z cp-z-${i}" x="${x - 40 + i * 30}" y="${y + 40 - i * 34}" font-size="${44 + i * 10}" font-weight="800" font-family="system-ui, sans-serif" ${outlined}>z</text>`)
      .join('') +
    `</g>`
  );
}

/**
 * The whole companion as one SVG, each moving part a group of its own
 * (`data-cp`), every eye state there for each eye and hidden but the one
 * shown (`data-lid`), every mouth there and hidden but one (`data-mouth`),
 * and the signs. Every id starts with `prefix`, so two can share a page.
 * Decorative: whatever he does, the form beside him says in words.
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
  const half = (side: 'left' | 'right'): string =>
    side === 'left' ? `<rect x="${v.x}" y="${v.y}" width="${n(FACE_AXIS - v.x)}" height="${v.h}"/>` : `<rect x="${FACE_AXIS}" y="${v.y}" width="${n(v.x + v.w - FACE_AXIS)}" height="${v.h}"/>`;
  // each eye shows its half of a drawing of both, the right's from a drawing of its own so no id is used twice
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
  // the side of his face turning away from us, in shade: waiting just outside its outline until he turns
  const cheek = (side: 'left' | 'right'): string => {
    const x = side === 'left' ? 2 * HEAD_AXIS - CHEEK.x : CHEEK.x;
    return `<ellipse data-cp="cheek-${side}" cx="${x}" cy="${CHEEK.y}" rx="${CHEEK.rx}" ry="${CHEEK.ry}" fill="url(#${id('cheek')})" transform="${cheekAt(side, 0)}"/>`;
  };
  const mouths = (Object.keys(art.mouths) as Viseme[]).map((m) => `<g data-mouth="${m}"${m === 'rest' ? '' : ' visibility="hidden"'}>${art.mouths[m]}</g>`).join('');
  // the forelegs and his shadow drawn as they rest, until a frame moves them
  const rest = { left: foreleg('left', 0, 0), right: foreleg('right', 0, 0), shade: shadeAt(0, 0) };
  const shapes = (side: 'left' | 'right'): string =>
    `<path id="${id(`leg-${side}`)}" data-cp="leg-${side}" d="${rest[side].outline}"/>` +
    `<path id="${id(`rim-${side}`)}" data-cp="rim-${side}" d="${rest[side].rim}"/>` +
    `<path id="${id(`cast-${side}`)}" data-cp="cast-${side}" d="${rest[side].cast}"/>` +
    `<clipPath id="${id(`in-${side}`)}"><use href="#${id(`leg-${side}`)}"/></clipPath>`;
  // a little down and to the right of what throws it, the light being up and to the left
  const cast = (side: 'left' | 'right', dx = 5, dy = 7): string => `<use href="#${id(`cast-${side}`)}" transform="translate(${dx} ${dy})"/>`;
  // a leg in his chest's own fur, so its shoulder has no edge on his side, darker below the sill; its rim shaded inside it; the hoof on its end
  const leg = (side: 'left' | 'right'): string => {
    const shape = `#${id(`leg-${side}`)}`;
    return (
      `<use href="${shape}" fill="url(#${p}fur)"/><use href="${shape}" fill="url(#${p}side)"/><use href="${shape}" fill="url(#${id('shins')})"/>` +
      `<g clip-path="url(#${id(`in-${side}`)})"><use href="#${id(`rim-${side}`)}" fill="none" stroke="${C.edge}" stroke-opacity="0.3" stroke-width="7" stroke-linecap="round"/></g>` +
      `<g data-cp="hoof-${side}" transform="${rest[side].hoof}">${hoof(id(`hoof-${side}-`))}</g>`
    );
  };
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" width="100%" height="100%" preserveAspectRatio="xMidYMax meet" overflow="visible" aria-hidden="true" focusable="false">` +
    `<defs>` +
    // he is behind the sill: cut there and nowhere else, so an ear or a sign may reach past the sides and the top
    `<clipPath id="${id('edge')}"><rect x="${v.x - v.w}" y="${v.y - v.h}" width="${3 * v.w}" height="${COMPANION_EDGE - (v.y - v.h)}"/></clipPath>` +
    // his forelegs come over the sill, and may hang down the card's face; the gate is shut at the sill until, coming up, his hooves are over it
    `<clipPath id="${id('legs')}"><rect data-cp="leg-gate" x="${v.x - v.w}" y="${v.y - v.h}" width="${3 * v.w}" height="${COMPANION_EDGE + COMPANION_OVERHANG - (v.y - v.h)}"/></clipPath>` +
    // what is on his face stays inside its outline as it turns
    `<clipPath id="${id('face')}"><path d="${layers.shape}"/></clipPath>` +
    `<clipPath id="${id('half-left')}">${half('left')}</clipPath><clipPath id="${id('half-right')}">${half('right')}</clipPath>` +
    // the sill's shadow on his neck: darker just where he goes on behind it
    `<linearGradient id="${id('sill')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1608" stop-opacity="0"/><stop offset="0.54" stop-color="#2a1608" stop-opacity="0.42"/><stop offset="1" stop-color="#2a1608" stop-opacity="0.42"/></linearGradient>` +
    // each foreleg's outline, its shaded rim and its shadow, which a frame redraws
    shapes('left') +
    shapes('right') +
    // where the legs' shadows fall: his chest under his chin and above the sill, and the card below it
    `<clipPath id="${id('chest')}"><rect x="${v.x - v.w}" y="${CHIN}" width="${3 * v.w}" height="${COMPANION_EDGE - CHIN}"/></clipPath>` +
    `<clipPath id="${id('card')}"><rect x="${v.x - v.w}" y="${COMPANION_EDGE}" width="${3 * v.w}" height="${COMPANION_OVERHANG}"/></clipPath>` +
    `<radialGradient id="${id('contact')}"><stop offset="0" stop-color="${C.cardShade}" stop-opacity="0.6"/><stop offset="1" stop-color="${C.cardShade}" stop-opacity="0"/></radialGradient>` +
    // his own shadow on the card under his chest, soft all round
    `<radialGradient id="${id('ambient')}"><stop offset="0" stop-color="${C.cardShade}" stop-opacity="0.36"/><stop offset="0.55" stop-color="${C.cardShade}" stop-opacity="0.16"/><stop offset="1" stop-color="${C.cardShade}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${id('cheek')}"><stop offset="0" stop-color="${C.shade}" stop-opacity="0.34"/><stop offset="0.5" stop-color="${C.shade}" stop-opacity="0.2"/><stop offset="1" stop-color="${C.shade}" stop-opacity="0"/></radialGradient>` +
    // below the sill, out of the light, the hanging legs darken down to the hoof
    `<linearGradient id="${id('shins')}" gradientUnits="userSpaceOnUse" x1="0" y1="${COMPANION_EDGE}" x2="0" y2="${COMPANION_EDGE + 150}"><stop offset="0" stop-color="${C.edge}" stop-opacity="0"/><stop offset="1" stop-color="${C.edge}" stop-opacity="0.4"/></linearGradient>` +
    `</defs>` +
    `<g clip-path="url(#${id('edge')})"><g data-cp="body">` +
    (art.chest ?? art.body) +
    // (on down below the sill, so a hop does not lift it off the sill)
    `<rect x="${v.x}" y="${COMPANION_EDGE - 70}" width="${v.w}" height="130" fill="url(#${id('sill')})" clip-path="url(#${p}figure)"/>` +
    // the head, in the round: each antler and each ear on its own where it grows from the head, behind its outline, then what is on his face
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
    // his shadow on the card where he leans on it, which stays on the card as he hops
    `<g clip-path="url(#${id('card')})"><ellipse data-cp="shade" rx="250" ry="62" fill="url(#${id('ambient')})" transform="${rest.shade}"/></g>` +
    // the forelegs over the sill and down the card's face, in front of his chest, his face and the card
    `<g clip-path="url(#${id('legs')})"><g data-cp="legs">` +
    // the shadows they throw: on his chest below his chin, and on the card, soft at the edges (a near shadow and a farther, fainter one, rather than a blur), with the knee's on the sill and the hoof's
    `<g clip-path="url(#${id('chest')})"><g clip-path="url(#${p}figure)" fill="${C.shade}" fill-opacity="0.2">${cast('left')}${cast('right')}</g></g>` +
    `<g clip-path="url(#${id('card')})" fill="${C.cardShade}">` +
    `<g fill-opacity="0.22">${cast('left', 4, 6)}${cast('right', 4, 6)}</g>` +
    `<g fill-opacity="0.13">${cast('left', 10, 15)}${cast('right', 10, 15)}</g>` +
    `<ellipse data-cp="hoof-shadow-left" cy="40" rx="25" ry="25" fill-opacity="0.26" transform="${rest.left.hoofShadow}"/>` +
    `<ellipse data-cp="hoof-shadow-right" cy="40" rx="25" ry="25" fill-opacity="0.26" transform="${rest.right.hoofShadow}"/>` +
    `<ellipse data-cp="contact-left" rx="46" ry="14" fill="url(#${id('contact')})" transform="${rest.left.contact}"/>` +
    `<ellipse data-cp="contact-right" rx="46" ry="14" fill="url(#${id('contact')})" transform="${rest.right.contact}"/>` +
    `</g>` +
    leg('left') +
    leg('right') +
    `</g></g>` +
    `<g data-cp="emotes">${emotes(id('emote'))}</g>` +
    `</svg>`
  );
}

/** The middle of his eyes in the companion's box, for a player to measure where something is from. */
export const COMPANION_EYES: CharacterPoint = eyesMiddle(RIG);

// ─────────────────────────────────────────────────────────────── what he does

/** How long a mistake's question and a success's sparkles stay over his head (ms). */
const SIGN_MS = { question: 1900, spark: 1700, heart: 1300 } as const;

/** How long a word stays in its bubble, and how long after he arrives he says hello (ms). */
const WORD_MS = 2300;
const HELLO_AFTER_MS = 700;

/** Left alone this long on the website, with nothing in a box and nothing being sent, he dozes (ms). */
export const COMPANION_DOZE_MS = 40_000;

/** How much of each reaction a tone keeps: the console's are the website's, smaller. */
const AMPLITUDE: Record<CompanionTone, number> = { playful: 1, calm: 0.55 };

/** An act of the companion's: any of the character's, and how far his head turns aside while it plays (-1 to 1, as a look does). */
type CompanionAct = Act & { turn?: Keys };

/** An approving nod, for a box filled in rightly: a grin, a dip of the head, the ears up, a sniff. */
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

/** A hoof lifted a little from the sill and put down again, twice, pawing at it: he is waiting, and alive. */
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

/** A deer's stamp: the knee up and the hoof brought down hard, once, at something odd. */
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
 * He comes up with his forelegs lifted, his hooves out by his cheeks, and
 * lays them over the sill only once he is all the way up, and not before
 * this long after he started: coming up with them down, his knees would rise
 * from behind the card, the legs seeming to come out from under it.
 */
const ARRIVING_MS = 800;
const CLIMB = 0.55;

/** A small flick of one ear as a key goes in: he is listening. */
const KEY_FLICK: Act = {
  ms: 260,
  earLeft: [
    [0, 0],
    [0.4, 5],
    [1, 0],
  ],
};

/** A mistake: a quick shake of the head, then the curious tilt and the question of the character's own. */
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

/** How hard each key nudges him to lean in towards the box, and how long after a key he still looks on with his mouth round (ms). */
const LEAN_KICK = 7;
const OO_MS = 650;

/**
 * His head in the round, for turning it. Each part of it is moved as a point
 * on a head turned that far would be: what stands in front of the middle of
 * his head goes the way he turns, what is behind it the other way, and what
 * is out at a side comes in as that side turns away. So the ears and the
 * antlers stay on his head, each where it grows from it, while the one on
 * the side he turns to goes round behind and the other comes round towards
 * us; and each, turning, is seen narrower or wider, as a flat thing is.
 */
const ROUND = {
  /** the middle of his head, which it turns about */
  centre: { x: HEAD_AXIS, y: 300 },
  /** how far it turns, in degrees, as he looks all the way to one side, and all the way up or down */
  yaw: 17,
  pitch: 6,
  /** how far each part stands in front of the middle (behind it, less than 0): what is on his face, his jaw at his chin, the ears and the antlers */
  features: 62,
  jaw: 30,
  ear: -10,
  antler: -24,
  /** how far each ear and each antler faces out to its own side, and how far each leans back, in degrees */
  earOut: 26,
  earBack: 14,
  /** how far in from where an ear turns its foot ends, under the head */
  earRoot: 20,
  antlerOut: 18,
  antlerBack: 24,
  /** how high on his head the outline begins to come round with his jaw */
  brow: 175,
  /** the bottom of his head's outline, under his chin */
  chin: 461,
} as const;

/** The shade on the right side of his face as it turns away (the left's is its mirror): just outside his outline, and how far in it comes at a full turn. */
const CHEEK = { x: 490, y: 318, rx: 84, ry: 200, reach: 80 } as const;

/** Where the shade on one side of his face is with his head turned `share` of a full turn towards that side. */
function cheekAt(side: 'left' | 'right', share: number): string {
  const inward = CHEEK.reach * clamp(share, 0, 1.3) * (side === 'left' ? 1 : -1);
  return `translate(${n(inward)} 0)`;
}

/** How far his head is turned, from where he looks across and how far beyond it he turns (a shake): -1.3 to 1.3. */
const headTurn = (lookX: number, turn: number): number => clamp(lookX + turn, -1.3, 1.3);

/** Springs: how quickly each part goes where it is going, and how much it overshoots on the way (ζ under 1). */
interface Spring {
  k: number;
  zeta: number;
}

type Part = 'hoof' | 'swing' | 'ear' | 'sway' | 'tilt' | 'look' | 'focus' | 'enter' | 'lean';

const SPRINGS: Record<CompanionTone, Record<Part, Spring>> = {
  // a little overshoot on the hooves and ears, the bounce of something alive, and a pop as he comes up;
  // what hangs from a knee follows it more slowly and swings on past, and so do his ears as he turns his head
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
  // quick and settled in the console, but for a little bounce as he pops up and leans in
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

/** Where his look comes from: the pointer (or a glance), the caret, up in thought, down, or straight ahead. */
type LookAt = 'pointer' | 'field' | 'up' | 'ahead';

interface Pose {
  hooves: readonly [number, number];
  ears: readonly [number, number];
  tilt: number;
  eyes: readonly [EyeState, EyeState];
  look: LookAt;
  /** 0: pupils as drawn, turned in; 1: in the middle of each eye, looking */
  focus: number;
  mouth: Viseme;
}

/** One frame of him, for `companionTransforms` and the eyes, mouth and signs. */
export interface CompanionFrame {
  /** each foreleg from 0, hanging over the sill, to 1, its hoof over its eye */
  hoofLeft: number;
  hoofRight: number;
  /** each foreleg's cannon and hoof, on the same measure: following the knee a moment later, swinging on past rest and back */
  swingLeft: number;
  swingRight: number;
  /** each ear's lift in degrees, up positive */
  earLeft: number;
  earRight: number;
  /** the head's tilt in degrees */
  tilt: number;
  /** how far he is off the edge, a share of his height, and his height about it, 1 as drawn */
  rise: number;
  stretch: number;
  /** the nose's size, 1 as drawn */
  sniff: number;
  /** how far he still is below the sill as he comes up, from 1 (out of sight) to 0 */
  enter: number;
  /** how far he leans in towards us, his head nearer, 0 as he sits */
  lean: number;
  /** how far his head is turned aside beyond where he looks (a shake), -1 to 1 */
  turn: number;
  /** how far his ears are turned, on the same measure as his head: after it, a moment later, and swinging on past it */
  sway: number;
  /** where the pupils look, each way from -1 to 1, and how far from as drawn (0) to looking (1) */
  look: CharacterPoint;
  focus: number;
  eyes: readonly [EyeState, EyeState];
  mouth: Viseme;
  emote: CompanionEmote | null;
  /** a Kurdish word in a bubble (the website's), or none */
  say: CompanionWord | null;
  asleep: boolean;
  /** anything still moving: the player draws another frame */
  moving: boolean;
  /** still, when to draw the next one (a blink, a glance, the end of a sign), or null for never unless something happens */
  wakeAt: number | null;
}

/** Where the person's eyes are drawing his: the pointer and the caret, as looks from his eyes (-1 to 1 each way), or null for none. */
export interface CompanionLooks {
  pointer: CharacterPoint | null;
  caret: CharacterPoint | null;
}

const NOWHERE: CompanionLooks = { pointer: null, caret: null };

/**
 * What Hevalo does, frame by frame: fed what the person is doing (`set`) and
 * what happens once (`react`), and asked for a frame (`step`) whenever the
 * platform draws. Smooth by springs, alive by habits, expressive by acts; it
 * knows when he is still, and says when to look again.
 */
export class CompanionMotion {
  private input: CompanionInput = { field: 'none', shown: false, status: 'idle' };
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

  /**
   * He comes on screen: he climbs up from behind the sill, his hooves up by
   * his cheeks, his ears spring up and he blinks as if he had just seen you;
   * then, all the way up, he lays his forelegs over the sill.
   */
  arrive(now: number): void {
    this.lastInput = now;
    this.arrived = now;
    this.x.enter = 1;
    this.v.enter = 0;
    // out of sight below the sill, his hooves are up already
    this.x.hoofLeft = this.x.hoofRight = this.x.swingLeft = this.x.swingRight = CLIMB;
    this.v.hoofLeft = this.v.hoofRight = this.v.swingLeft = this.v.swingRight = 0;
    this.play(ACTS.arrive, now);
    if (this.tone === 'playful') this.word = { word: 'hello', at: now + HELLO_AFTER_MS, until: now + HELLO_AFTER_MS + WORD_MS };
    this.plan(now);
  }

  /** What the person is doing now. A change of status is reacted to: a question for a mistake, a hop for getting in. */
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
  }

  /** Something that happened once. */
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
      // an ear flick every few keys, never in the middle of something bigger
      this.keys += 1;
      if (this.keys % 4 === 0 && !this.act && this.input.field !== 'secret') this.play(KEY_FLICK, now);
      // he leans in to each key, watching with his mouth round, a hanging hoof swinging, but not with his eyes covered
      if (this.input.field !== 'secret') {
        this.v.lean += LEAN_KICK * this.amp;
        this.v[this.keys % 2 ? 'swingLeft' : 'swingRight'] += SWING_KICK * this.amp;
        this.ooUntil = now + OO_MS;
      }
    }
  }

  /** Whether he is still coming up, or has only just come up, from behind the sill. */
  private climbing(now: number): boolean {
    return this.arrived !== null && (now - this.arrived < ARRIVING_MS || this.x.enter > 0.02);
  }

  /** Dozing: left alone long enough on the website, with nothing in hand. */
  private asleep(now: number): boolean {
    const { field, status } = this.input;
    return this.tone === 'playful' && field === 'none' && status === 'idle' && now - this.lastInput >= COMPANION_DOZE_MS;
  }

  /** Where he is going, from what the person is doing. */
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
      // let in: his hooves up by his cheeks
      return { hooves: [0.55, 0.55], ears: [12 * a, 12 * a], tilt: 0, eyes: ['happy', 'happy'], look: 'ahead', focus: 0, mouth: 'a' };
    }
    if (field === 'secret') {
      // hooves over his eyes; shown, the right comes down and that eye peeks over it
      return shown
        ? { hooves: [1, 0.8], ears: [-6 * a, 6 * a], tilt: 0, eyes: ['closed', 'half'], look: 'field', focus: 1, mouth: 'rest' }
        : { hooves: [1, 1], ears: [-10 * a, -10 * a], tilt: 0, eyes: ['closed', 'closed'], look: 'ahead', focus: 0, mouth: 'mbp' };
    }
    if (field === 'text' || field === 'code') {
      // watching the keys go in, his mouth round
      const mouth: Viseme = now < this.ooUntil ? 'o' : 'rest';
      return { hooves: [0, 0], ears: [6 * a, 6 * a], tilt: 0, eyes: ['open', 'open'], look: 'field', focus: 1, mouth };
    }
    return { hooves: [0, 0], ears: [0, 0], tilt: 0, eyes: ['open', 'open'], look: 'pointer', focus: 0, mouth: 'rest' };
  }

  private play(act: CompanionAct, now: number): void {
    this.act = { act, at: now };
  }

  /** When each habit comes round next, from now. */
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

  /** The habits due by now, while he has nothing else to do: a blink, a glance, an ear's twitch, a sniff, a hoof pawing or swinging. */
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
    // on the website, now and then a hoof paws at the sill
    if (now >= this.next.tap) {
      if (free && this.tone === 'playful' && !this.tap) this.tap = { side: this.random() < 0.5 ? 0 : 1, at: now, paw: TAP, size: 1 };
      this.next.tap = now + between(HABITS.twitch, this.random) * 1.3;
    }
    // and now and then, idly, a hanging hoof swings, in the console too
    if (now >= this.next.swing) {
      if (free && !this.tap && pose.hooves[0] === 0 && pose.hooves[1] === 0) this.v[this.random() < 0.5 ? 'swingLeft' : 'swingRight'] -= SWING_KICK * 1.6 * this.amp;
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

  /** The eyes as shown on the way to `to`: from open to shut or pleased, or back, half shut for a moment first. */
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
   * One frame at `now` (ms, the same clock as `set` and `react`), with where
   * the pointer and the caret are as looks from his eyes. `still` is for
   * whoever asks for less motion: every part goes straight to where it is
   * going, with no habits, acts or bounce, and he never dozes; his signs
   * and words, which do not move, stay.
   */
  step(now: number, looks: CompanionLooks = NOWHERE, still = false): CompanionFrame {
    // the time since the last frame, however long a busy page took to draw it (after a second, a movement has all but settled)
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

    // what an act adds, while one plays
    let act: CompanionAct | null = null;
    let t = 0;
    if (this.act) {
      t = (now - this.act.at) / this.act.act.ms;
      if (t >= 1) this.act = null;
      else act = this.act.act;
    }
    const a = this.amp;
    const add = (keys: Act['earLeft']): number => (keys ? sampleKeys(keys, t) * a : 0);

    // where he looks
    if (this.glance && now >= this.glance.until) this.glance = null;
    let look: CharacterPoint = { x: 0, y: 0 };
    if (act?.look) look = act.look;
    else if (pose.look === 'field') look = looks.caret ?? looks.pointer ?? { x: 0, y: 0.4 };
    else if (pose.look === 'up') look = { x: 0.55, y: -0.8 };
    else if (pose.look === 'pointer') look = this.glance?.look ?? looks.pointer ?? { x: 0, y: 0 };
    const focus = act?.look || pose.look !== 'pointer' || this.glance || looks.pointer ? 1 : pose.focus;

    // the head leans a little after the caret, as a reader's does
    const lean = pose.look === 'field' ? Math.max(-1, Math.min(1, look.x)) * 4 * a : 0;
    // a hoof pawing at the sill, or stamped on it
    let drum = 0;
    if (this.tap) {
      const u = (now - this.tap.at) / this.tap.paw.ms;
      if (u >= 1) this.tap = null;
      else drum = sampleKeys(this.tap.paw.keys, u) * this.tap.size;
    }
    // coming up, or only just up: the forelegs still lifted from the climb
    const climbing = !still && this.climbing(now);
    const climb = climbing ? CLIMB : 0;
    const hoof = (side: 0 | 1): number => Math.max(climb, pose.hooves[side] + (this.tap?.side === side ? drum : 0));
    const turn = act?.turn ? sampleKeys(act.turn, t) : 0;
    const target: Record<Channel, number> = {
      hoofLeft: hoof(0),
      hoofRight: hoof(1),
      swingLeft: hoof(0),
      swingRight: hoof(1),
      earLeft: pose.ears[0] + add(act?.earLeft),
      earRight: pose.ears[1] + add(act?.earRight),
      // the ears go after his head where it is, not where it is going (or, still, straight there with it)
      sway: headTurn(still ? look.x : this.x.lookX, turn),
      tilt: pose.tilt + lean + add(act?.tilt),
      lookX: look.x,
      lookY: look.y,
      focus,
      enter: 0,
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
      // in steps of a sixtieth of a second at most, so a page drawing few frames moves him as far, and as surely, as one drawing many
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

    // the eyes: an act's, a blink's, or the pose's, never straight from open to shut
    const held = act ? sampleHold(act.eyes, t) : null;
    const blinking = held ? null : this.blinkEyes(now);
    const goal: readonly [EyeState, EyeState] = held ? [held, held] : blinking && pose.eyes[0] === 'open' && pose.eyes[1] === 'open' ? [blinking, blinking] : pose.eyes;
    const eyes = this.eyesToward(goal, now, still);
    const mouth = (act ? sampleHold(act.mouth, t) : null) ?? pose.mouth;

    // the sign over his head
    if (this.sign && now >= this.sign.until) this.sign = null;
    const status = this.input.status;
    const emote: CompanionEmote | null =
      status === 'busy' ? 'think' : status === 'waiting' || (this.asleep(now) && !still) ? 'sleep' : (this.sign?.emote ?? null);
    if (this.word && now >= this.word.until) this.word = null;
    const say = this.word && now >= this.word.at ? this.word.word : null;

    const rise = act?.rise ? sampleKeys(act.rise, t) * a : 0;
    const stretch = act?.stretch ? 1 + (sampleKeys(act.stretch, t) - 1) * a : 1;
    const sniff = act?.sniff ? 1 + (sampleKeys(act.sniff, t) - 1) * a : 1;

    // all the way up with this frame: the next one lays his forelegs over the sill
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

/** The transform of each moving group for a frame, as SVG transform attributes in the drawing's units, and the forelegs' outlines. */
export interface CompanionTransforms {
  body: string;
  head: string;
  /** the head's parts as it turns in the round: each antler and each ear where it grows from his head, the face's outline coming round with his jaw, what is on it (`features`, and the eyes, mouth and nose in `gaze`) furthest */
  antlerLeft: string;
  antlerRight: string;
  earLeft: string;
  earRight: string;
  /** the shade on each side of his face, in as that side turns away */
  cheekLeft: string;
  cheekRight: string;
  face: string;
  features: string;
  gaze: string;
  pupilLeft: string;
  pupilRight: string;
  nose: string;
  /** the forelegs together: up with him as he hops or comes up */
  legs: string;
  /** how far below the sill the forelegs may be seen: at the sill while he comes up, over the card's face once he is there */
  legGate: string;
  /** each foreleg's outline, from the shoulder in his chest round the knee to the fetlock, as path data (the one part that is not a transform) */
  legLeft: string;
  legRight: string;
  /** the line along each foreleg's edge that is shaded, and the shadow it throws, as path data too */
  rimLeft: string;
  rimRight: string;
  castLeft: string;
  castRight: string;
  /** each hoof, on the end of its leg, and its shadow on the card */
  hoofLeft: string;
  hoofRight: string;
  hoofShadowLeft: string;
  hoofShadowRight: string;
  /** his shadow on the card where he leans on it */
  shade: string;
  /** the shadow of each knee on the sill, gone as it lifts */
  contactLeft: string;
  contactRight: string;
}

/** The parts of `CompanionTransforms` that are path data, an outline drawn anew, rather than a transform. */
export const COMPANION_OUTLINES = ['legLeft', 'legRight', 'rimLeft', 'rimRight', 'castLeft', 'castRight'] as const satisfies readonly (keyof CompanionTransforms)[];


const ease = (t: number): number => t * t * (3 - 2 * t);
const clamp = (t: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, t));

/** A scale, to a thousandth: a tenth is too coarse for a lean or a sniff. */
const f3 = (v: number): string => String(Math.round(v * 1000) / 1000);

/** One of a foreleg's measures (`LEG_KEYS` column `i`) at `k`, along a smooth curve through the keys, straight on past the last. */
function legKey(k: number, i: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): number {
  const keys = LEG_KEYS;
  const at = (j: number): number => keys[j]![i];
  const kk = (j: number): number => keys[j]![0];
  const last = keys.length - 1;
  const slope = (j: number): number => (at(j + 1) - at(j)) / (kk(j + 1) - kk(j));
  // each key's tangent: the mean of the slopes either side of it, or the one slope at an end
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
 * A foreleg `v` of the way from hanging over the sill (0) to its hoof over
 * its eye (1), and what hangs from its knee `swing` of the way, which follows
 * `v` a moment later and may swing on past rest (below 0), out from the
 * face. One outline from the shoulder, which stays in the brown of his
 * chest's side wherever the leg goes, to the fetlock; the hoof on its end.
 * Raised, the leg is a little larger, nearer to us.
 */
function foreleg(side: 'left' | 'right', v: number, swing: number): { outline: string; rim: string; cast: string; hoof: string; hoofShadow: string; contact: string } {
  const k = clamp(v, 0, 1.06);
  const w = clamp(swing, 0, 1.06);
  const flip = side === 'left' ? 1 : -1;
  // the shoulders are either side of his chest, the hooves go to his eyes, which are a little to one side of it
  const face = BODY_AXIS + (FACE_AXIS - BODY_AXIS) * clamp(k * 1.4, 0, 1);
  const across = (x: number, axis: number): number => (side === 'left' ? x : 2 * axis - x);
  const shoulder = { x: across(legKey(k, 1), BODY_AXIS), y: legKey(k, 2) };
  const knee = { x: across(legKey(k, 3), face), y: legKey(k, 4) };
  const size = legKey(k, 8);
  const turn = flip * (legKey(w, 5) + Math.max(0, -swing) * SWING_TURN);
  const cannon = legKey(w, 6) * size;
  const a = (turn * Math.PI) / 180;
  const fetlock = { x: knee.x - Math.sin(a) * cannon, y: knee.y + Math.cos(a) * cannon };
  // out from the face, across a part of the leg: whichever way across it is away from the middle
  const outFrom = (a: CharacterPoint, b: CharacterPoint): CharacterPoint => {
    const way = unit(minus(b, a));
    return way.y * flip > 0 ? { x: -way.y, y: way.x } : { x: way.y, y: -way.x };
  };
  const part = (a: CharacterPoint, b: CharacterPoint, rows: typeof FOREARM, first: boolean): Round[] =>
    rows.map(([t, half, out], i) => ({
      c: plus(plus(a, minus(b, a), t), outFrom(a, b), out * size),
      // nearer to us as it rises, all but the shoulder, which stays in his side
      r: half * (first && i === 0 ? Math.sqrt(size) : size),
    }));
  const rounds: Round[] = [...part(shoulder, knee, FOREARM, true), ...part(knee, fetlock, CANNON, false)];
  const { outline, rim } = legOutline(rounds);
  // its shadow starts down the forearm, narrower than the leg there, so none shows round the shoulder
  const cast = legOutline([{ ...rounds[1]!, r: rounds[1]!.r * 0.7 }, ...rounds.slice(2)]).outline;
  const lifted = clamp((COMPANION_EDGE - 6 - knee.y) / 40, 0, 1);
  const hoof = `translate(${n(fetlock.x)} ${n(fetlock.y)}) rotate(${n(turn + flip * legKey(w, 7))}) scale(${f3(size * HOOF)} ${f3(size * HOOF * legKey(w, 9))})`;
  return {
    outline,
    rim,
    cast,
    hoof,
    // the hoof's shadow, on the card only: down and to the right of it, as the leg's is
    hoofShadow: `translate(6 10) ${hoof}`,
    contact: `translate(${n(knee.x + 5)} ${COMPANION_EDGE + 4}) scale(${f3(1 - ease(lifted))})`,
  };
}

const DEG = Math.PI / 180;

/** Where each ear is held to his head: the inner end of its foot, level with where it turns when it twitches. */
const earRootAt = (side: 'left' | 'right'): CharacterPoint => {
  const pivot = RIG.rig!.ears[side].pivot;
  return { x: pivot.x + (side === 'left' ? ROUND.earRoot : -ROUND.earRoot), y: pivot.y };
};

/** How far a point on his head, `depth` in front of its middle, moves as the head turns `yaw` across (to his left, our right, more than 0) and `pitch` down (radians). */
function inTheRound(p: CharacterPoint, depth: number, yaw: number, pitch: number): CharacterPoint {
  const x = p.x - ROUND.centre.x;
  const y = p.y - ROUND.centre.y;
  const across = x * Math.cos(yaw) + depth * Math.sin(yaw);
  const nearer = depth * Math.cos(yaw) - x * Math.sin(yaw);
  return { x: across - x, y: y * Math.cos(pitch) + nearer * Math.sin(pitch) - y };
}

/**
 * An ear or an antler on his head, turned `yaw` and `pitch`: it goes with
 * the point it grows from (`pivot`, `depth` in front of the middle of his
 * head); it leans back `back` degrees, so as the head turns its tip swings
 * the other way from its foot, and it is seen shorter as the head tips back;
 * and it is seen narrower as its side turns away and wider as it comes round
 * towards us (it faces `out` degrees out to its side), as far as it has
 * turned itself, `own` (an ear swings on after his head). All this about
 * `root`, where it is held to the head (an ear by the inner end of its
 * foot); `lift` turns it about `pivot` first (an ear's twitch).
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

/** His shadow on the card's top, under his chest: none while he is still below the sill, and smaller and fainter as he hops off it. */
function shadeAt(enter: number, rise: number): string {
  const there = 1 - clamp(enter * 3, 0, 1);
  const lift = clamp(rise * 5, 0, 0.6);
  return `translate(${BODY_AXIS} ${COMPANION_EDGE}) scale(${f3(there * (1 - lift * 0.3))} ${f3(there * (1 - lift))})`;
}

export function companionTransforms(frame: CompanionFrame): CompanionTransforms {
  const rig = RIG.rig!;
  const pivot = RIG.headPivot;
  const shift = pupilShift(RIG, frame.look, frame.focus);
  // up for a hop, and down behind the sill before he has come up
  const up = frame.rise * RIG.bust.h - frame.enter * ENTER_DROP;
  // the head turns towards where he looks, and further for a shake, in the round; nearer as he leans in
  const yaw = headTurn(frame.look.x, frame.turn) * ROUND.yaw * DEG;
  const pitch = clamp(frame.look.y, -1, 1) * ROUND.pitch * DEG;
  // the ears turn as his head does, but a moment after it, and swing on past
  const sway = clamp(frame.sway, -1.6, 1.6) * ROUND.yaw * DEG;
  const near = 1 + clamp(frame.lean, -0.4, 1.4) * 0.07;
  // the outline comes round with his jaw, not at all at his brow; what is on his face, in front, comes furthest
  const jaw = (Math.sin(yaw) * ROUND.jaw) / (ROUND.chin - ROUND.brow);
  const drop = Math.sin(pitch) * ROUND.jaw * 0.5;
  const front = inTheRound({ x: ROUND.centre.x, y: COMPANION_EYES.y }, ROUND.features, yaw, pitch);
  const inner = `translate(${n(front.x - (COMPANION_EYES.y - ROUND.brow) * jaw)} ${n(front.y - drop)})`;
  const ears = rig.ears;
  const antlers = rig.antlers!;
  const tall = frame.stretch;
  // a crouch spreads a little and a stretch narrows, as something soft does
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
    legGate: `translate(0 ${n(-COMPANION_OVERHANG * clamp((frame.enter * ENTER_DROP) / KNEES_OVER, 0, 1))})`,
    legLeft: left.outline,
    legRight: right.outline,
    rimLeft: left.rim,
    rimRight: right.rim,
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

/**
 * Where something on the screen is, as a look from his eyes: `box` is where
 * the companion's SVG is drawn, `x`, `y` the point. Far is two of his widths.
 */
export function companionLook(box: { left: number; top: number; width: number; height: number }, x: number, y: number): CharacterPoint {
  const v = COMPANION_VIEW;
  // drawn standing on the bottom of its box, as wide as the box allows (xMidYMax meet)
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
