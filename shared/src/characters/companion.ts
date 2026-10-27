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

/** How far below the sill his forelegs may hang, over the card's face: the platform keeps that much of the card's top clear. */
export const COMPANION_OVERHANG = 92;

/** How far below the sill he waits before he pops up into view. */
const ENTER_DROP = 560;

/**
 * Each foreleg: the knee resting on the sill, and the fetlock (the joint just
 * above the hoof) hanging over the card's face at rest and up by the eye when
 * he covers it, with the way between them, out round his cheek
 * (`out`, `up`: the curve's handles). Leg and hoof always lie along one line
 * from the knee, so the hoof is the leg's own end.
 */
const LEG = {
  left: { knee: { x: 172, y: 516 }, rest: { x: 172, y: 552 }, out: { x: 82, y: 548 }, up: { x: 132, y: 418 }, cover: { x: 182, y: 344 } },
  right: { knee: { x: 338, y: 516 }, rest: { x: 338, y: 552 }, out: { x: 428, y: 548 }, up: { x: 378, y: 418 }, cover: { x: 326, y: 344 } },
} as const;

/** The hoof's size hanging over the sill, and over an eye: raised, it is nearer to us. */
const HOOF_SCALE = { rest: 0.86, cover: 1.5 } as const;

/** How long a leg is drawn in its own units, before it is stretched from the knee to the fetlock. */
const LEG_UNIT = 100;

/** The middle of the face, where each eye's state is split from the other's. */
const FACE_AXIS = 253.5;

/** Where the signs stand: over his right shoulder, clear of the antlers. */
const EMOTE_AT = { x: 446, y: -22 } as const;

const C = {
  // the fur of his legs is his body's, a shade darker towards the hoof and paler just above it, as a deer's is
  leg: '#b97f46',
  legLow: '#a86f3c',
  edge: '#8f5a2c',
  pastern: '#c99863',
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
 * A foreleg's cannon: from the knee (0,0) straight along `LEG_UNIT`, slender
 * and a little narrower towards the fetlock, shaded at its sides. It is
 * stretched and turned to reach the fetlock wherever the hoof is.
 */
function leg(id: string): string {
  const w = 20;
  const path = `M${-w},0C${-w},${LEG_UNIT * 0.4} ${-w + 2},${LEG_UNIT * 0.8} ${-w + 3},${LEG_UNIT}L${w - 3},${LEG_UNIT}C${w - 2},${LEG_UNIT * 0.8} ${w},${LEG_UNIT * 0.4} ${w},0Z`;
  return (
    `<defs>` +
    `<linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.leg}"/><stop offset="1" stop-color="${C.legLow}"/></linearGradient>` +
    `<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.edge}" stop-opacity="0.55"/><stop offset="0.32" stop-color="${C.edge}" stop-opacity="0"/>` +
    `<stop offset="0.72" stop-color="${C.edge}" stop-opacity="0"/><stop offset="1" stop-color="${C.edge}" stop-opacity="0.5"/></linearGradient>` +
    `</defs>` +
    `<path d="${path}" fill="url(#${id}f)"/><path d="${path}" fill="url(#${id}s)"/>`
  );
}

/** A knee resting on the sill: the bend of the leg, its fur lit from above, a little shadow where it presses on the edge. */
function knee(id: string, at: CharacterPoint): string {
  const { x, y } = at;
  return (
    `<defs><radialGradient id="${id}" cx="0.45" cy="0.3" r="0.75"><stop offset="0" stop-color="${C.pastern}"/><stop offset="0.55" stop-color="${C.leg}"/><stop offset="1" stop-color="${C.edge}"/></radialGradient></defs>` +
    `<ellipse cx="${x}" cy="${y + 4}" rx="27" ry="9" fill="#24130a" opacity="0.22"/>` +
    `<ellipse cx="${x}" cy="${y}" rx="25" ry="17" fill="url(#${id})"/>`
  );
}

/** The soft shadow a hanging hoof throws on the card behind it, gone as the hoof lifts away. */
function hoofShadow(id: string): string {
  return (
    `<defs><radialGradient id="${id}"><stop offset="0" stop-color="#1b0f08" stop-opacity="0.32"/><stop offset="1" stop-color="#1b0f08" stop-opacity="0"/></radialGradient></defs>` +
    `<ellipse cx="0" cy="0" rx="30" ry="9" fill="url(#${id})"/>`
  );
}

/**
 * A front hoof as a deer's is, standing, seen from the front: the fetlock (the
 * joint above it) at 0,0, the pastern down from it, paler fur where it meets
 * the hoof, and the hoof itself in two narrow toes, dark and glossy, coming
 * to points with a slit between them. The small dewclaws show at its sides
 * behind the fetlock. Turned over, its toes point up, over an eye.
 */
function hoofArt(id: string): string {
  // one toe, the left: broad and rounded on its outer side, meeting the other along a narrow slit that opens at the tips
  const toe = 'M-1,6C-9,4 -21,4 -27,8C-32,13 -33,30 -30,44C-27,56 -17,64 -7,67C-4,67.5 -2.5,64 -2,58C-1.6,42 -1,22 -1,6Z';
  const mirror = (d: string): string => d.replace(/(-?\d+(?:\.\d+)?),/g, (_, x: string) => `${-Number(x)},`);
  const dewclaw = 'M-18,-13C-24,-14 -28,-10 -28,-5C-26,-4 -23,-6 -20,-8Z';
  const fringe = 'M-29,12Q-25,4 -20,11Q-15,3 -10,10Q-5,3 0,10Q5,3 10,10Q15,3 20,11Q25,4 29,12L28,-2L-28,-2Z';
  return (
    `<defs>` +
    `<linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.hoofLight}"/><stop offset="0.4" stop-color="${C.hoof}"/><stop offset="1" stop-color="${C.hoofDeep}"/></linearGradient>` +
    `<radialGradient id="${id}g"><stop offset="0" stop-color="${C.shine}" stop-opacity="0.6"/><stop offset="1" stop-color="${C.shine}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.leg}"/><stop offset="0.55" stop-color="${C.legLow}"/><stop offset="1" stop-color="${C.pastern}"/></linearGradient>` +
    `</defs>` +
    // the dewclaws, behind
    `<path d="${dewclaw}" fill="${C.hoofDeep}"/><path d="${mirror(dewclaw)}" fill="${C.hoofDeep}"/>` +
    // the toes, each with the soft shine of horn on its outer side
    `<path d="${toe}" fill="url(#${id}h)"/><path d="${mirror(toe)}" fill="url(#${id}h)"/>` +
    `<ellipse cx="-19" cy="24" rx="8" ry="15" fill="url(#${id}g)" transform="rotate(12 -19 24)"/>` +
    `<ellipse cx="19" cy="24" rx="7" ry="13" fill="url(#${id}g)" opacity="0.6" transform="rotate(-12 19 24)"/>` +
    // the pastern and the fetlock, the fur paler where it meets the hoof
    `<path d="M-19,-6C-21,0 -25,6 -28,8L28,8C25,6 21,0 19,-6Z" fill="url(#${id}p)"/>` +
    `<path d="${fringe}" fill="${C.fringe}" opacity="0.8"/>` +
    `<ellipse cx="0" cy="-8" rx="22" ry="19" fill="${C.leg}"/>` +
    `<ellipse cx="0" cy="-8" rx="22" ry="19" fill="url(#${id}s)"/>` +
    `<defs><linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.edge}" stop-opacity="0.45"/><stop offset="0.35" stop-color="${C.edge}" stop-opacity="0"/>` +
    `<stop offset="0.7" stop-color="${C.edge}" stop-opacity="0"/><stop offset="1" stop-color="${C.edge}" stop-opacity="0.4"/></linearGradient></defs>`
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
    // the forelegs over the sill, in front of the card
    `<g clip-path="url(#${id('legs')})"><g data-cp="legs">` +
    `<g data-cp="shadow-left">${hoofShadow(id('shadowL'))}</g><g data-cp="shadow-right">${hoofShadow(id('shadowR'))}</g>` +
    `<g data-cp="leg-left">${leg(id('legL'))}</g><g data-cp="leg-right">${leg(id('legR'))}</g>` +
    knee(id('kneeL'), LEG.left.knee) +
    knee(id('kneeR'), LEG.right.knee) +
    `<g data-cp="hoof-left">${hoofArt(id('hoofL'))}</g><g data-cp="hoof-right">${hoofArt(id('hoofR'))}</g>` +
    `</g></g>` +
    `<g data-cp="emotes">${emotes(id('emote'))}</g>` +
    `</svg>`
  );
}

/** The middle of his eyes in the companion's box, for a player to measure where something is from. */
export const COMPANION_EYES: CharacterPoint = eyesMiddle(drawHevalo('cpeyes-'));

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
  /** how far below the sill the forelegs may be seen: at the sill while he comes up, over the card's face once he is there */
  legGate: string;
  legLeft: string;
  legRight: string;
  hoofLeft: string;
  hoofRight: string;
  shadowLeft: string;
  shadowRight: string;
}

const RIG = drawHevalo('cprig-');

const ease = (t: number): number => t * t * (3 - 2 * t);
const clamp = (t: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, t));

/**
 * A foreleg `v` of the way from hanging over the sill (0) to over its eye (1).
 * The knee stays on the sill; the fetlock comes up along a curve, out round
 * the cheek and in to the eye; the cannon is stretched from the knee to it and
 * the hoof turned the same way, so leg and hoof are one line and the toes
 * point down over the card at rest and up over the eye. Raised, the hoof is
 * a little larger, nearer to us.
 */
function foreleg(side: 'left' | 'right', v: number): { leg: string; hoof: string; shadow: string } {
  const l = LEG[side];
  const k = clamp(v, -0.12, 1.12);
  const u = 1 - k;
  const bez = (a: number, b: number, c: number, d: number): number => u * u * u * a + 3 * u * u * k * b + 3 * u * k * k * c + k * k * k * d;
  const fx = bez(l.rest.x, l.out.x, l.up.x, l.cover.x);
  const fy = bez(l.rest.y, l.out.y, l.up.y, l.cover.y);
  const dx = fx - l.knee.x;
  const dy = fy - l.knee.y;
  const reach = Math.max(1, Math.hypot(dx, dy));
  const angle = (Math.atan2(-dx, dy) * 180) / Math.PI;
  const scale = HOOF_SCALE.rest + (HOOF_SCALE.cover - HOOF_SCALE.rest) * clamp(k, 0, 1);
  const shade = 1 - ease(clamp(k * 3, 0, 1));
  return {
    leg: `translate(${n(l.knee.x)} ${n(l.knee.y)}) rotate(${n(angle)}) scale(1 ${n(reach / LEG_UNIT)})`,
    hoof: `translate(${n(fx)} ${n(fy)}) rotate(${n(angle)}) scale(${n(scale)})`,
    // on the card under the toes, behind them and a little down and out of the light
    shadow: `translate(${n(l.rest.x + 5)} ${n(l.rest.y + 54)}) scale(${n(shade)})`,
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
    head: `rotate(${n(frame.tilt)} ${n(pivot.x)} ${n(pivot.y)})`,
    earLeft: `rotate(${n(frame.earLeft)} ${n(rig.ears.left.pivot.x)} ${n(rig.ears.left.pivot.y)})`,
    earRight: `rotate(${n(-frame.earRight)} ${n(rig.ears.right.pivot.x)} ${n(rig.ears.right.pivot.y)})`,
    pupilLeft: `translate(${n(shift.left.x)} ${n(shift.left.y)})`,
    pupilRight: `translate(${n(shift.right.x)} ${n(shift.right.y)})`,
    nose: `translate(${n(rig.sniff.x)} ${n(rig.sniff.y)}) scale(${n(frame.sniff)}) translate(${n(-rig.sniff.x)} ${n(-rig.sniff.y)})`,
    legs: `translate(0 ${n(-up)})`,
    legGate: `translate(0 ${n(-COMPANION_OVERHANG * clamp(frame.enter * 3, 0, 1))})`,
    legLeft: left.leg,
    legRight: right.leg,
    hoofLeft: left.hoof,
    hoofRight: right.hoof,
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
