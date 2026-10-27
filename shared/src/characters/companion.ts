import type { Viseme } from '../lipsync/visemes.js';
import { n, prefixFor } from '../art/svg.js';
import { drawHevalo } from './hevalo.js';
import { ACTS, BLINK_STEPS, HABITS, between, eyesMiddle, glanceTarget, pupilShift, sampleHold, sampleKeys, type Act, type Keys } from './life.js';
import type { CharacterPoint, EyeState } from './types.js';

/**
 * Hevalo as a companion beside a form. The form's card is a windowsill and he
 * is outside it, leaning in: his head and neck above the sill, the rest of
 * him behind the card, his knees on the sill and his forelegs hanging over
 * it, down the card's face. He pops up from behind it as the page opens.
 *
 * He watches the caret along a box being typed in, his ears up and his head
 * leaning after it. For a password he lifts his hooves over his eyes, and
 * when the password is shown he lowers one and peeks. While a form is being
 * sent he looks up and thinks; a mistake gets a curious tilt of the head and
 * a question, never a sad face; getting in gets a happy hop. Left alone he
 * breathes, blinks, glances about, twitches an ear, sniffs and drums a hoof
 * on the sill; on the website, left long enough, he dozes. A tap gets a
 * greeting.
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
 * staff at work, with the same reactions at a smaller size, no bounce, no
 * words and no doze.
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
 * Where the card's top edge crosses his neck, in the character's units. The
 * card is a windowsill: he is outside, behind it, leaning in over it, so the
 * rest of him goes on down behind the card and is never seen cut off.
 */
export const COMPANION_EDGE = 520;

/** The companion's box: the bust above the sill, with room above the antlers for a sign. Its bottom is the sill. */
export const COMPANION_VIEW = { x: -15, y: -78, w: 540, h: COMPANION_EDGE + 78 } as const;

/** The character he is drawn from, with the rig his moving parts turn on. */
const RIG = drawHevalo('cprig-');

/**
 * His head is drawn a little smaller than the character's own, about where
 * it meets his neck, so his forelegs are in proportion to him; and his
 * forelegs a little larger than a deer's would be beside a head this size.
 */
const HEAD_SCALE = 0.9;
const LEG_SCALE = 1.22;

/** Where a point of the character's head is, the head drawn at `HEAD_SCALE`. */
function onHead(at: CharacterPoint): CharacterPoint {
  const pivot = RIG.headPivot;
  return { x: pivot.x + (at.x - pivot.x) * HEAD_SCALE, y: pivot.y + (at.y - pivot.y) * HEAD_SCALE };
}

/** How far below the sill his forelegs may hang, over the card's face: the platform keeps that much of the card's top clear. */
export const COMPANION_OVERHANG = 118;

/** How far below the sill he waits before he pops up into view. */
const ENTER_DROP = 560;

/**
 * Each foreleg, the left (the right is its mirror across the face), from
 * hanging over the sill (0) through a tap on it, the knee lifting, a wave by
 * the cheek and a peek, to over the eye (1): where its knee is, which way the
 * leg below the knee points (degrees: 0 straight down, more turning it out
 * from the face, round and up), and how large the leg is, nearer to us as it
 * rises. At rest the knee lies on the sill and the leg hangs down the card's
 * face; raised, the knee comes up off the sill by the cheek and the leg folds
 * up from it to the eye.
 */
const LEG_KEYS: readonly (readonly [k: number, x: number, y: number, turn: number, size: number])[] = [
  [0, 178, 506, 0, 1],
  [0.2, 176, 497, 12, 1.02],
  [0.32, 164, 478, 48, 1.1],
  [0.55, 150, 462, 140, 1.25],
  [1, 168, 461, 186, 1.45],
];

/** Where each foreleg's upper part comes from, down behind the sill: it is seen only above the sill, rising to the knee. */
const SHOULDER = { x: 184, y: 612 } as const;

/** How long the upper part of a foreleg is drawn, before it is stretched from the shoulder to the knee. */
const ARM_UNIT = 100;

/** The middle of the face, where each eye's state is split from the other's. */
const FACE_AXIS = 253.5;

/** Where the signs stand: over his right shoulder, clear of the antlers. */
const EMOTE_AT = onHead({ x: 446, y: -22 });

const C = {
  // the fur of his legs is his body's, a shade darker towards the hoof and paler just above it, as a deer's is
  leg: '#b97f46',
  legLow: '#a86f3c',
  edge: '#8f5a2c',
  pastern: '#c99863',
  // the pale fur just above the hoof
  coronet: '#e2c194',
  fringe: '#dcb17f',
  // hooves dark and glossy, nearly black
  hoofLight: '#56423a',
  hoof: '#33251f',
  hoofDeep: '#1c1411',
  shine: '#8c766b',
  ink: '#4a2a24',
  heart: '#ef5b7a',
  spark: '#f5b942',
  sparkEdge: '#d18f1c',
} as const;

/**
 * A foreleg's upper part, from the shoulder (0,0) along `ARM_UNIT` to the
 * knee: a little fuller than the leg below it, rounder near the shoulder. It
 * is stretched from the shoulder behind the sill to the knee, and only what
 * is above the sill is seen.
 */
function forearm(id: string): string {
  const path = `M-21,0C-23,30 -21.5,66 -18.5,${ARM_UNIT}L18.5,${ARM_UNIT}C21.5,66 23,30 21,0Z`;
  return (
    `<defs><linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.edge}" stop-opacity="0.6"/><stop offset="0.35" stop-color="${C.edge}" stop-opacity="0"/>` +
    `<stop offset="0.65" stop-color="${C.edge}" stop-opacity="0"/><stop offset="1" stop-color="${C.edge}" stop-opacity="0.6"/></linearGradient></defs>` +
    `<path d="${path}" fill="${C.legLow}"/><path d="${path}" fill="url(#${id}s)"/>`
  );
}

/**
 * A foreleg from the knee (0,0) down, all of a piece as a deer's is: the
 * rounded knee, the slender cannon, the fetlock a little fuller, the pastern
 * paling to cream where it meets the hoof, and the hoof itself, two dark
 * glossy toes, rounded on the outside and meeting along a slit, with the
 * small dewclaws showing at the sides behind the fetlock. Seen from the
 * front, it is the same either way round, so turned up over an eye the toes
 * point up.
 */
function lowerLeg(id: string): string {
  const fur =
    'M0,-15C10.3,-15 18.4,-9 19,0C19.5,7 17.2,14 14.9,22C13.8,31 13.2,41 13.8,48C14.4,53 17.8,56 17.8,62C17.8,67 14.9,70 14.9,73C14.9,76 17.2,78 19.5,80L-19.5,80C-17.2,78 -14.9,76 -14.9,73C-14.9,70 -17.8,67 -17.8,62C-17.8,56 -14.4,53 -13.8,48C-13.2,41 -13.8,31 -14.9,22C-17.2,14 -19.5,7 -19,0C-18.4,-9 -10.3,-15 0,-15Z';
  const toe = 'M-1,78C-6.9,76.5 -16.1,76.5 -20.1,78.5C-23,83 -23.6,93 -21.8,100C-20.1,105 -12.6,108.5 -5.7,108C-2.9,107.8 -1.6,105 -1.4,101Z';
  const dewclaw = 'M-14.4,57C-21.3,56 -25.3,60.5 -24.1,66C-20.7,66 -16.7,63.5 -14.4,61.5Z';
  const mirror = (d: string): string => d.replace(/(-?\d+(?:\.\d+)?),/g, (_, x: string) => `${-Number(x)},`);
  return (
    `<defs>` +
    `<linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.leg}"/><stop offset="0.62" stop-color="${C.legLow}"/>` +
    `<stop offset="0.8" stop-color="${C.legLow}"/><stop offset="0.93" stop-color="${C.pastern}"/><stop offset="1" stop-color="${C.coronet}"/></linearGradient>` +
    `<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.edge}" stop-opacity="0.6"/><stop offset="0.3" stop-color="${C.edge}" stop-opacity="0"/>` +
    `<stop offset="0.7" stop-color="${C.edge}" stop-opacity="0"/><stop offset="1" stop-color="${C.edge}" stop-opacity="0.6"/></linearGradient>` +
    `<linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.hoofLight}"/><stop offset="0.35" stop-color="${C.hoof}"/><stop offset="1" stop-color="${C.hoofDeep}"/></linearGradient>` +
    `<radialGradient id="${id}g"><stop offset="0" stop-color="${C.shine}" stop-opacity="0.65"/><stop offset="1" stop-color="${C.shine}" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    // the dewclaws, behind the fetlock
    `<path d="${dewclaw}" fill="${C.hoofDeep}"/><path d="${mirror(dewclaw)}" fill="${C.hoofDeep}"/>` +
    // the toes, each with the soft shine of horn on its outer side
    `<path d="${toe}" fill="url(#${id}h)"/><path d="${mirror(toe)}" fill="url(#${id}h)"/>` +
    `<ellipse cx="-14.4" cy="90" rx="4" ry="8" fill="url(#${id}g)" transform="rotate(8 -14.4 90)"/>` +
    `<ellipse cx="14.4" cy="90" rx="3.5" ry="7" fill="url(#${id}g)" opacity="0.6" transform="rotate(-8 14.4 90)"/>` +
    // the leg, round at its sides, and a fold of the knee
    `<path d="${fur}" fill="url(#${id}f)"/><path d="${fur}" fill="url(#${id}s)"/>` +
    `<path d="M-11.5,13Q0,17 11.5,13" fill="none" stroke="${C.edge}" stroke-opacity="0.3" stroke-width="2" stroke-linecap="round"/>`
  );
}

/** The soft shadow a hanging leg throws on the card behind it, gone as the leg lifts away. */
function legShadow(id: string): string {
  return (
    `<defs><radialGradient id="${id}"><stop offset="0" stop-color="#1b0f08" stop-opacity="0.3"/><stop offset="1" stop-color="#1b0f08" stop-opacity="0"/></radialGradient></defs>` +
    `<ellipse cx="0" cy="0" rx="26" ry="62" fill="url(#${id})"/>`
  );
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
  if (!rig) throw new Error('companion: Hevalo is drawn without his rig');
  const id = (name: string): string => `${p}${name}`;
  const about = (pt: CharacterPoint): string => `${n(pt.x)} ${n(pt.y)}`;
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
  const mouths = (Object.keys(art.mouths) as Viseme[]).map((m) => `<g data-mouth="${m}"${m === 'rest' ? '' : ' visibility="hidden"'}>${art.mouths[m]}</g>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" width="100%" height="100%" preserveAspectRatio="xMidYMax meet" overflow="visible" aria-hidden="true" focusable="false">` +
    `<defs>` +
    // he is behind the sill: cut there and nowhere else, so an ear or a sign may reach past the sides and the top
    `<clipPath id="${id('edge')}"><rect x="${v.x - v.w}" y="${v.y - v.h}" width="${3 * v.w}" height="${COMPANION_EDGE - (v.y - v.h)}"/></clipPath>` +
    // his forelegs come over the sill, and may hang down the card's face; while he is still coming up, the gate closes at the sill
    `<clipPath id="${id('legs')}"><rect data-cp="leg-gate" x="${v.x - v.w}" y="${v.y - v.h}" width="${3 * v.w}" height="${COMPANION_EDGE + COMPANION_OVERHANG - (v.y - v.h)}"/></clipPath>` +
    `<clipPath id="${id('half-left')}">${half('left')}</clipPath><clipPath id="${id('half-right')}">${half('right')}</clipPath>` +
    // the sill's shadow on his neck: darker just where he goes on behind it
    `<linearGradient id="${id('sill')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1608" stop-opacity="0"/><stop offset="1" stop-color="#2a1608" stop-opacity="0.42"/></linearGradient>` +
    `</defs>` +
    `<g clip-path="url(#${id('edge')})"><g data-cp="body">` +
    (art.chest ?? art.body) +
    `<rect x="${v.x}" y="${COMPANION_EDGE - 70}" width="${v.w}" height="70" fill="url(#${id('sill')})" clip-path="url(#${p}figure)"/>` +
    `<g data-cp="head">` +
    rig.crown +
    `<g data-cp="ear-left" data-pivot="${about(rig.ears.left.pivot)}">${rig.ears.left.art}</g>` +
    `<g data-cp="ear-right" data-pivot="${about(rig.ears.right.pivot)}">${rig.ears.right.art}</g>` +
    rig.face +
    rig.look.whites +
    `<g data-cp="pupil-left">${rig.look.left.art}</g><g data-cp="pupil-right">${rig.look.right.art}</g>` +
    lids('left') +
    lids('right') +
    mouths +
    `<g data-cp="nose">${art.overlay}</g>` +
    `</g>` +
    `</g></g>` +
    // the forelegs: above the sill each rises from behind it to the knee, and from the knee hangs over it, in front of the card
    `<g clip-path="url(#${id('edge')})"><g data-cp="arms">` +
    `<g data-cp="arm-left">${forearm(id('armL'))}</g><g data-cp="arm-right">${forearm(id('armR'))}</g>` +
    `</g></g>` +
    `<g clip-path="url(#${id('legs')})"><g data-cp="legs">` +
    `<g data-cp="shadow-left">${legShadow(id('shadowL'))}</g><g data-cp="shadow-right">${legShadow(id('shadowR'))}</g>` +
    `<g data-cp="leg-left">${lowerLeg(id('legL'))}</g><g data-cp="leg-right">${lowerLeg(id('legR'))}</g>` +
    `</g></g>` +
    `<g data-cp="emotes">${emotes(id('emote'))}</g>` +
    `</svg>`
  );
}

/** The middle of his eyes in the companion's box, for a player to measure where something is from. */
export const COMPANION_EYES: CharacterPoint = onHead(eyesMiddle(RIG));

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

/** An approving nod, for a box filled in rightly: a dip of the head, the ears up, a sniff. */
const APPROVE: Act = {
  ms: 650,
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

/** A hoof lifted a little from the sill and put down again, twice, as fingers drum: he is waiting, and alive. */
const TAP: Keys = [
  [0, 0],
  [0.22, 0.2],
  [0.45, 0],
  [0.68, 0.14],
  [1, 0],
];
const TAP_MS = 700;

/** How long after he pops up he holds his hooves out by his cheeks, as if to say hello, before he puts them on the sill. */
const HELLO_HOOVES_MS = 800;

/** A small flick of one ear as a key goes in: he is listening. */
const KEY_FLICK: Act = {
  ms: 260,
  earLeft: [
    [0, 0],
    [0.4, 5],
    [1, 0],
  ],
};

/** Springs: how quickly each part goes where it is going, and how much it overshoots on the way (ζ under 1). */
interface Spring {
  k: number;
  zeta: number;
}

type Part = 'hoof' | 'ear' | 'tilt' | 'look' | 'focus' | 'enter';

const SPRINGS: Record<CompanionTone, Record<Part, Spring>> = {
  // a little overshoot on the hooves and ears, the bounce of something alive, and a pop as he comes up
  playful: {
    hoof: { k: 150, zeta: 0.72 },
    ear: { k: 220, zeta: 0.55 },
    tilt: { k: 110, zeta: 0.8 },
    look: { k: 420, zeta: 1 },
    focus: { k: 160, zeta: 1 },
    enter: { k: 75, zeta: 0.62 },
  },
  // none in the console: quick and settled
  calm: {
    hoof: { k: 170, zeta: 1 },
    ear: { k: 200, zeta: 0.9 },
    tilt: { k: 110, zeta: 1 },
    look: { k: 420, zeta: 1 },
    focus: { k: 160, zeta: 1 },
    enter: { k: 95, zeta: 1 },
  },
};

type Channel = 'hoofLeft' | 'hoofRight' | 'earLeft' | 'earRight' | 'tilt' | 'lookX' | 'lookY' | 'focus' | 'enter';
const CHANNELS: readonly Channel[] = ['hoofLeft', 'hoofRight', 'earLeft', 'earRight', 'tilt', 'lookX', 'lookY', 'focus', 'enter'];
const SPRING_OF: Record<Channel, Part> = {
  hoofLeft: 'hoof',
  hoofRight: 'hoof',
  earLeft: 'ear',
  earRight: 'ear',
  tilt: 'tilt',
  lookX: 'look',
  lookY: 'look',
  focus: 'focus',
  enter: 'enter',
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
  /** each hoof from 0, hanging over the sill, to 1, over its eye */
  hoofLeft: number;
  hoofRight: number;
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
  private readonly x: Record<Channel, number> = { hoofLeft: 0, hoofRight: 0, earLeft: 0, earRight: 0, tilt: 0, lookX: 0, lookY: 0, focus: 0, enter: 0 };
  private readonly v: Record<Channel, number> = { hoofLeft: 0, hoofRight: 0, earLeft: 0, earRight: 0, tilt: 0, lookX: 0, lookY: 0, focus: 0, enter: 0 };
  private act: { act: Act; at: number } | null = null;
  private sign: { emote: CompanionEmote; until: number } | null = null;
  private word: { word: CompanionWord; at: number; until: number } | null = null;
  private blink: { at: number } | null = null;
  private glance: { look: CharacterPoint; until: number } | null = null;
  private eyesShown: readonly [EyeState, EyeState] = ['open', 'open'];
  private eyesVia: { until: number; to: readonly [EyeState, EyeState] } | null = null;
  private next = { blink: 0, glance: 0, twitch: 0, sniff: 0, tap: 0 };
  private tap: { side: 0 | 1; at: number } | null = null;
  private arrived: number | null = null;
  private lastInput = 0;
  private last: number | null = null;
  private keys = 0;

  constructor(
    readonly tone: CompanionTone,
    private readonly random: () => number = Math.random,
  ) {
    this.amp = AMPLITUDE[tone];
    this.springs = SPRINGS[tone];
  }

  /**
   * He comes on screen: he pops up from behind the sill, his ears spring up
   * and he blinks as if he had just seen you; on the website he holds his
   * hooves up by his cheeks for a hello before he puts them on the sill.
   */
  arrive(now: number): void {
    this.lastInput = now;
    this.arrived = now;
    this.x.enter = 1;
    this.v.enter = 0;
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
        this.play(ACTS.hmm, now);
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
      if (!this.act) this.play(APPROVE, now);
    } else if (event === 'keystroke') {
      // an ear flick every few keys, never in the middle of something bigger
      this.keys += 1;
      if (this.keys % 4 === 0 && !this.act && this.input.field !== 'secret') this.play(KEY_FLICK, now);
    }
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
      return { hooves: [0, 0], ears: [12 * a, 12 * a], tilt: 0, eyes: ['happy', 'happy'], look: 'ahead', focus: 0, mouth: 'a' };
    }
    if (field === 'secret') {
      // hooves over his eyes; shown, the right comes down and that eye peeks over it
      return shown
        ? { hooves: [1, 0.62], ears: [-6 * a, 6 * a], tilt: 0, eyes: ['closed', 'half'], look: 'field', focus: 1, mouth: 'rest' }
        : { hooves: [1, 1], ears: [-10 * a, -10 * a], tilt: 0, eyes: ['closed', 'closed'], look: 'ahead', focus: 0, mouth: 'mbp' };
    }
    if (field === 'text' || field === 'code') {
      return { hooves: [0, 0], ears: [6 * a, 6 * a], tilt: 0, eyes: ['open', 'open'], look: 'field', focus: 1, mouth: 'rest' };
    }
    // just come up, on the website: hooves out by his cheeks, hello
    const hello = this.tone === 'playful' && this.arrived !== null && now - this.arrived < HELLO_HOOVES_MS ? 0.55 : 0;
    return { hooves: [hello, hello], ears: [0, 0], tilt: 0, eyes: ['open', 'open'], look: 'pointer', focus: 0, mouth: 'rest' };
  }

  private play(act: Act, now: number): void {
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
    };
  }

  /** The habits due by now, while he has nothing else to do: a blink, a glance, an ear's twitch, a sniff. */
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
    // on the website, now and then a hoof drums on the sill
    if (now >= this.next.tap) {
      if (free && this.tone === 'playful' && !this.tap) this.tap = { side: this.random() < 0.5 ? 0 : 1, at: now };
      this.next.tap = now + between(HABITS.twitch, this.random) * 1.3;
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
    const dt = this.last === null ? 0 : Math.min(0.05, Math.max(0, (now - this.last) / 1000));
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
    let act: Act | null = null;
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
    // a hoof drumming on the sill
    let drum = 0;
    if (this.tap) {
      const u = (now - this.tap.at) / TAP_MS;
      if (u >= 1) this.tap = null;
      else drum = sampleKeys(TAP, u);
    }
    const target: Record<Channel, number> = {
      hoofLeft: pose.hooves[0] + (this.tap?.side === 0 ? drum : 0),
      hoofRight: pose.hooves[1] + (this.tap?.side === 1 ? drum : 0),
      earLeft: pose.ears[0] + add(act?.earLeft),
      earRight: pose.ears[1] + add(act?.earRight),
      tilt: pose.tilt + lean + add(act?.tilt),
      lookX: look.x,
      lookY: look.y,
      focus,
      enter: 0,
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
      this.v[c] += (k * (target[c] - this.x[c]) - damping * this.v[c]) * dt;
      this.x[c] += this.v[c] * dt;
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

    moving = moving || act !== null || this.blink !== null || this.eyesVia !== null || this.tap !== null;
    const helloEnds = this.arrived !== null ? this.arrived + HELLO_HOOVES_MS : undefined;
    const waits = [this.sign?.until, this.word ? (now < this.word.at ? this.word.at : this.word.until) : undefined, this.glance?.until, helloEnds];
    if (!still) {
      waits.push(this.next.blink, this.next.glance, this.next.twitch, this.next.sniff, this.next.tap);
      if (this.tone === 'playful' && !this.asleep(now)) waits.push(this.lastInput + COMPANION_DOZE_MS);
    }
    const due = waits.filter((w): w is number => typeof w === 'number' && w > now);
    return {
      hoofLeft: this.x.hoofLeft,
      hoofRight: this.x.hoofRight,
      earLeft: this.x.earLeft,
      earRight: this.x.earRight,
      tilt: this.x.tilt,
      rise,
      stretch,
      sniff,
      enter: this.x.enter,
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

/** The transform of each moving group for a frame, as SVG transform attributes in the drawing's units. */
export interface CompanionTransforms {
  body: string;
  head: string;
  earLeft: string;
  earRight: string;
  pupilLeft: string;
  pupilRight: string;
  nose: string;
  /** the forelegs together: up with him as he hops or comes up */
  legs: string;
  /** the upper parts of the forelegs, seen above the sill only: up with him too */
  arms: string;
  /** how far below the sill the forelegs may be seen: at the sill while he comes up, over the card's face once he is there */
  legGate: string;
  /** each foreleg's upper part, from its shoulder behind the sill to its knee */
  armLeft: string;
  armRight: string;
  /** each foreleg from the knee down, the hoof its end */
  legLeft: string;
  legRight: string;
  shadowLeft: string;
  shadowRight: string;
}


const ease = (t: number): number => t * t * (3 - 2 * t);
const clamp = (t: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, t));

/** One of a foreleg's measures (`LEG_KEYS` column `i`) at `k`, along a smooth curve through the keys, straight on past the last. */
function legKey(k: number, i: 1 | 2 | 3 | 4): number {
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
 * A foreleg `v` of the way from hanging over the sill (0) to over its eye
 * (1). The leg below the knee is one piece, never stretched: it hangs from
 * the knee, swings out and round and folds up from it, the hoof always its
 * own end. The upper part reaches from the shoulder behind the sill to the
 * knee, so the leg is whole wherever the knee goes. Raised, the leg is a
 * little larger, nearer to us.
 */
function foreleg(side: 'left' | 'right', v: number): { arm: string; leg: string; shadow: string } {
  const k = clamp(v, 0, 1.06);
  const flip = side === 'left' ? 1 : -1;
  const across = (x: number): number => (side === 'left' ? x : 2 * FACE_AXIS - x);
  const knee = { x: across(legKey(k, 1)), y: legKey(k, 2) };
  const turn = flip * legKey(k, 3);
  const size = legKey(k, 4);
  const shoulder = { x: across(SHOULDER.x), y: SHOULDER.y };
  const dx = knee.x - shoulder.x;
  const dy = knee.y - shoulder.y;
  const reach = Math.max(1, Math.hypot(dx, dy));
  // pointing from the shoulder to the knee; the upper part widens less than the leg below it, being further from us
  const lean = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const thick = LEG_SCALE * (1 + (size - 1) * 0.55);
  const shade = 1 - ease(clamp(k * 3, 0, 1));
  const rest = LEG_KEYS[0]!;
  return {
    arm: `translate(${n(shoulder.x)} ${n(shoulder.y)}) rotate(${n(lean)}) scale(${n(thick)} ${n(-reach / ARM_UNIT)})`,
    leg: `translate(${n(knee.x)} ${n(knee.y)}) rotate(${n(turn)}) scale(${n(size * LEG_SCALE)})`,
    // on the card behind the hanging leg, a little down and out of the light
    shadow: `translate(${n(across(rest[1]) + 4 * LEG_SCALE)} ${n(rest[2] + 62 * LEG_SCALE)}) scale(${n(shade * LEG_SCALE)})`,
  };
}

export function companionTransforms(frame: CompanionFrame): CompanionTransforms {
  const rig = RIG.rig!;
  const pivot = RIG.headPivot;
  const shift = pupilShift(RIG, frame.look, frame.focus);
  // up for a hop, and down out of sight behind the sill before he has come up
  const up = frame.rise * RIG.bust.h - frame.enter * ENTER_DROP;
  const tall = frame.stretch;
  // a crouch spreads a little and a stretch narrows, as something soft does
  const wide = 1 + (1 - tall) * 0.6;
  const edge = COMPANION_EDGE;
  const left = foreleg('left', frame.hoofLeft);
  const right = foreleg('right', frame.hoofRight);
  return {
    body: `translate(0 ${n(-up)}) translate(${n(pivot.x)} ${edge}) scale(${n(wide)} ${n(tall)}) translate(${n(-pivot.x)} ${-edge})`,
    head: `rotate(${n(frame.tilt)} ${n(pivot.x)} ${n(pivot.y)}) translate(${n(pivot.x)} ${n(pivot.y)}) scale(${HEAD_SCALE}) translate(${n(-pivot.x)} ${n(-pivot.y)})`,
    earLeft: `rotate(${n(frame.earLeft)} ${n(rig.ears.left.pivot.x)} ${n(rig.ears.left.pivot.y)})`,
    earRight: `rotate(${n(-frame.earRight)} ${n(rig.ears.right.pivot.x)} ${n(rig.ears.right.pivot.y)})`,
    pupilLeft: `translate(${n(shift.left.x)} ${n(shift.left.y)})`,
    pupilRight: `translate(${n(shift.right.x)} ${n(shift.right.y)})`,
    nose: `translate(${n(rig.sniff.x)} ${n(rig.sniff.y)}) scale(${n(frame.sniff)}) translate(${n(-rig.sniff.x)} ${n(-rig.sniff.y)})`,
    legs: `translate(0 ${n(-up)})`,
    arms: `translate(0 ${n(-up)})`,
    legGate: `translate(0 ${n(-COMPANION_OVERHANG * clamp(frame.enter * 3, 0, 1))})`,
    armLeft: left.arm,
    armRight: right.arm,
    legLeft: left.leg,
    legRight: right.leg,
    shadowLeft: left.shadow,
    shadowRight: right.shadow,
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
