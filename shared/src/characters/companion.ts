import type { Viseme } from '../lipsync/visemes.js';
import { n, prefixFor } from '../art/svg.js';
import { drawHevalo } from './hevalo.js';
import { ACTS, BLINK_STEPS, HABITS, between, eyesMiddle, glanceTarget, pupilShift, sampleHold, sampleKeys, type Act } from './life.js';
import type { CharacterArt, CharacterPoint, EyeState } from './types.js';

/**
 * Hevalo as a companion beside a form: standing behind the card with his
 * front hooves resting on its top edge, as a deer looks over a wall, and
 * taking part in what is being typed.
 *
 * He watches the caret along a box being typed in, his ears up and his head
 * leaning after it. For a password he lifts his hooves over his eyes, and
 * when the password is shown he lowers one and peeks. While a form is being
 * sent he looks up and thinks; a mistake gets a curious tilt of the head and
 * a question, never a sad face; getting in gets a happy hop. Left alone he
 * breathes, blinks, glances about, twitches an ear, sniffs; on the website,
 * left long enough, he dozes. A tap gets a greeting.
 *
 * Everything here is the same for every platform and touches no page: the
 * drawing as markup (`companionSvg`), what he does (`CompanionMotion`, fed
 * with what the person is doing and asked for a frame whenever the platform
 * draws), and how a frame turns into the drawing's transforms
 * (`companionTransforms`). Each app keeps only a thin player that reads the
 * pointer and the caret, draws, and sleeps when he is still.
 *
 * Two tones for two audiences: `playful` on the website, for learners of
 * every age, with a hop, a heart, a Kurdish word now and then and a doze;
 * `calm` in the admin console, for staff at work, with the same reactions at
 * a smaller size, no words, no doze, and reading glasses.
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

/** Where the card's top edge crosses his neck, in the character's units: his hooves rest on it. */
export const COMPANION_EDGE = 520;

/** The companion's box: the bust, with room above the antlers for a sign, cut a little under the edge. */
export const COMPANION_VIEW = { x: -15, y: -78, w: 540, h: COMPANION_EDGE + 8 + 78 } as const;

/** Where each hoof rests on the edge, and where it covers its eye (the middle of each eye's white), with its turn there. */
const HOOF = {
  left: { rest: { x: 150, y: 507 }, cover: { x: 178, y: 286 }, turn: -12, bulge: -22 },
  right: { rest: { x: 360, y: 507 }, cover: { x: 329, y: 286 }, turn: 12, bulge: 22 },
} as const;

/** The middle of the face, where each eye's state is split from the other's. */
const FACE_AXIS = 253.5;

/** Where the signs stand: over his right shoulder, clear of the antlers. */
const EMOTE_AT = { x: 446, y: -22 } as const;

const C = {
  leg: '#b97f46',
  legLow: '#a86f3c',
  edge: '#8f5a2c',
  hoofLight: '#8a6447',
  hoof: '#73503a',
  hoofDeep: '#4e3324',
  shine: '#b08868',
  frame: '#2e2220',
  ink: '#4a2a24',
  heart: '#ef5b7a',
  spark: '#f5b942',
  sparkEdge: '#d18f1c',
} as const;

/**
 * One foreleg, upright, the hoof's middle at 0,0 and the leg running down
 * from it: cloven, the two halves of the hoof turned up to the face, big
 * enough to cover an eye. Shaded at its sides as his legs are.
 */
function foreleg(id: string): string {
  const leg = 'M-28,44C-31,80 -28,170 -25,380L25,380C28,170 31,80 28,44C31,32 22,24 0,24C-22,24 -31,32 -28,44Z';
  return (
    `<defs>` +
    `<linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.leg}"/><stop offset="1" stop-color="${C.legLow}"/></linearGradient>` +
    `<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.edge}" stop-opacity="0.5"/><stop offset="0.3" stop-color="${C.edge}" stop-opacity="0"/>` +
    `<stop offset="0.75" stop-color="${C.edge}" stop-opacity="0"/><stop offset="1" stop-color="${C.edge}" stop-opacity="0.45"/></linearGradient>` +
    `<linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.hoofLight}"/><stop offset="0.45" stop-color="${C.hoof}"/><stop offset="1" stop-color="${C.hoofDeep}"/></linearGradient>` +
    `</defs>` +
    `<path d="${leg}" fill="url(#${id}f)"/><path d="${leg}" fill="url(#${id}s)"/>` +
    `<path d="M-3,-58C-26,-62 -56,-44 -58,-10C-60,22 -42,42 -3,44Z" fill="url(#${id}h)"/>` +
    `<path d="M3,-58C26,-62 56,-44 58,-10C60,22 42,42 3,44Z" fill="url(#${id}h)"/>` +
    `<path d="M-38,-42C-28,-52 -14,-54 -6,-50" stroke="${C.shine}" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.7"/>` +
    `<path d="M38,-42C28,-52 14,-54 6,-50" stroke="${C.shine}" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.5"/>`
  );
}

/** Reading glasses, round and thin, for the console's companion: lenses a little larger than his eyes. */
function glasses(art: CharacterArt): string {
  const rig = art.rig;
  if (!rig) return '';
  const { left, right } = rig.look;
  const r = { x: 64, y: 68 };
  const lens = (p: CharacterPoint): string =>
    `<ellipse cx="${n(p.x)}" cy="${n(p.y)}" rx="${r.x}" ry="${r.y}" fill="#ffffff" fill-opacity="0.07" stroke="${C.frame}" stroke-width="8"/>` +
    `<path d="M${n(p.x - 38)},${n(p.y - 44)}C${n(p.x - 26)},${n(p.y - 54)} ${n(p.x - 10)},${n(p.y - 57)} ${n(p.x + 4)},${n(p.y - 56)}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="6" stroke-linecap="round" fill="none"/>`;
  const bridge = `M${n(left.centre.x + r.x - 6)},${n(left.centre.y - 18)}C${n(FACE_AXIS - 8)},${n(left.centre.y - 34)} ${n(FACE_AXIS + 8)},${n(right.centre.y - 34)} ${n(right.centre.x - r.x + 6)},${n(right.centre.y - 18)}`;
  return `<g data-cp="glasses">${lens(left.centre)}${lens(right.centre)}<path d="${bridge}" stroke="${C.frame}" stroke-width="8" fill="none" stroke-linecap="round"/></g>`;
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
export function companionSvg({ prefix, tone }: { prefix: string; tone: CompanionTone }): string {
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
    // cut at the bottom only, under the card's edge: an ear or a sign may reach past the sides and the top
    `<clipPath id="${id('edge')}"><rect x="${v.x - v.w}" y="${v.y - v.h}" width="${3 * v.w}" height="${2 * v.h}"/></clipPath>` +
    `<clipPath id="${id('half-left')}">${half('left')}</clipPath><clipPath id="${id('half-right')}">${half('right')}</clipPath>` +
    `</defs>` +
    `<g clip-path="url(#${id('edge')})"><g data-cp="body"><g class="cp-breathe">` +
    (art.chest ?? art.body) +
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
    (tone === 'calm' ? glasses(art) : '') +
    `</g>` +
    `<g data-cp="hoof-left">${foreleg(id('legL'))}</g><g data-cp="hoof-right">${foreleg(id('legR'))}</g>` +
    `</g></g></g>` +
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

const SPRINGS: Record<CompanionTone, Record<'hoof' | 'ear' | 'tilt' | 'look' | 'focus', Spring>> = {
  // a little overshoot on the hooves and ears, the bounce of something alive
  playful: { hoof: { k: 150, zeta: 0.72 }, ear: { k: 220, zeta: 0.55 }, tilt: { k: 110, zeta: 0.8 }, look: { k: 420, zeta: 1 }, focus: { k: 160, zeta: 1 } },
  // none in the console: quick and settled
  calm: { hoof: { k: 170, zeta: 1 }, ear: { k: 200, zeta: 0.9 }, tilt: { k: 110, zeta: 1 }, look: { k: 420, zeta: 1 }, focus: { k: 160, zeta: 1 } },
};

type Channel = 'hoofLeft' | 'hoofRight' | 'earLeft' | 'earRight' | 'tilt' | 'lookX' | 'lookY' | 'focus';
const CHANNELS: readonly Channel[] = ['hoofLeft', 'hoofRight', 'earLeft', 'earRight', 'tilt', 'lookX', 'lookY', 'focus'];
const SPRING_OF: Record<Channel, 'hoof' | 'ear' | 'tilt' | 'look' | 'focus'> = {
  hoofLeft: 'hoof',
  hoofRight: 'hoof',
  earLeft: 'ear',
  earRight: 'ear',
  tilt: 'tilt',
  lookX: 'look',
  lookY: 'look',
  focus: 'focus',
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
  /** each hoof from 0, resting on the edge, to 1, over its eye */
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
  private readonly springs: Record<'hoof' | 'ear' | 'tilt' | 'look' | 'focus', Spring>;
  private readonly x: Record<Channel, number> = { hoofLeft: 0, hoofRight: 0, earLeft: 0, earRight: 0, tilt: 0, lookX: 0, lookY: 0, focus: 0 };
  private readonly v: Record<Channel, number> = { hoofLeft: 0, hoofRight: 0, earLeft: 0, earRight: 0, tilt: 0, lookX: 0, lookY: 0, focus: 0 };
  private act: { act: Act; at: number } | null = null;
  private sign: { emote: CompanionEmote; until: number } | null = null;
  private word: { word: CompanionWord; at: number; until: number } | null = null;
  private blink: { at: number } | null = null;
  private glance: { look: CharacterPoint; until: number } | null = null;
  private eyesShown: readonly [EyeState, EyeState] = ['open', 'open'];
  private eyesVia: { until: number; to: readonly [EyeState, EyeState] } | null = null;
  private next = { blink: 0, glance: 0, twitch: 0, sniff: 0 };
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

  /** He comes on screen: his ears spring up and he blinks as if he had just seen you; on the website, a hello. */
  arrive(now: number): void {
    this.lastInput = now;
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
      // hooves over his eyes; shown, the right comes down and that eye peeks
      return shown
        ? { hooves: [1, 0.5], ears: [-6 * a, 6 * a], tilt: 0, eyes: ['closed', 'half'], look: 'field', focus: 1, mouth: 'rest' }
        : { hooves: [1, 1], ears: [-10 * a, -10 * a], tilt: 0, eyes: ['closed', 'closed'], look: 'ahead', focus: 0, mouth: 'mbp' };
    }
    if (field === 'text' || field === 'code') {
      return { hooves: [0, 0], ears: [6 * a, 6 * a], tilt: 0, eyes: ['open', 'open'], look: 'field', focus: 1, mouth: 'rest' };
    }
    return { hooves: [0, 0], ears: [0, 0], tilt: 0, eyes: ['open', 'open'], look: 'pointer', focus: 0, mouth: 'rest' };
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
   * going, with no habits, acts or bounce, and he never dozes.
   */
  step(now: number, looks: CompanionLooks = NOWHERE, still = false): CompanionFrame {
    const dt = this.last === null ? 0 : Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (still) {
      this.act = null;
      this.blink = null;
      this.glance = null;
      if (this.sign && this.sign.emote !== 'question') this.sign = null;
      this.word = null;
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
    const target: Record<Channel, number> = {
      hoofLeft: pose.hooves[0],
      hoofRight: pose.hooves[1],
      earLeft: pose.ears[0] + add(act?.earLeft),
      earRight: pose.ears[1] + add(act?.earRight),
      tilt: pose.tilt + lean + add(act?.tilt),
      lookX: look.x,
      lookY: look.y,
      focus,
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

    moving = moving || act !== null || this.blink !== null || this.eyesVia !== null;
    const waits = [this.sign?.until, this.word ? (now < this.word.at ? this.word.at : this.word.until) : undefined, this.glance?.until];
    if (!still) {
      waits.push(this.next.blink, this.next.glance, this.next.twitch, this.next.sniff);
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
  hoofLeft: string;
  hoofRight: string;
}

const RIG = drawHevalo('cprig-');

function hoof(side: 'left' | 'right', v: number): string {
  const h = HOOF[side];
  const k = Math.max(0, Math.min(1.15, v));
  // up in an arc, a little out to the side on the way, as a leg swings rather than slides
  const x = h.rest.x + (h.cover.x - h.rest.x) * k + Math.sin(Math.PI * Math.min(1, k)) * h.bulge;
  const y = h.rest.y + (h.cover.y - h.rest.y) * k;
  return `translate(${n(x)} ${n(y)}) rotate(${n(h.turn * k)})`;
}

export function companionTransforms(frame: CompanionFrame): CompanionTransforms {
  const rig = RIG.rig!;
  const pivot = RIG.headPivot;
  const shift = pupilShift(RIG, frame.look, frame.focus);
  const up = frame.rise * RIG.bust.h;
  const tall = frame.stretch;
  // a crouch spreads a little and a stretch narrows, as something soft does
  const wide = 1 + (1 - tall) * 0.6;
  const edge = COMPANION_EDGE;
  return {
    body: `translate(0 ${n(-up)}) translate(${n(pivot.x)} ${edge}) scale(${n(wide)} ${n(tall)}) translate(${n(-pivot.x)} ${-edge})`,
    head: `rotate(${n(frame.tilt)} ${n(pivot.x)} ${n(pivot.y)})`,
    earLeft: `rotate(${n(frame.earLeft)} ${n(rig.ears.left.pivot.x)} ${n(rig.ears.left.pivot.y)})`,
    earRight: `rotate(${n(-frame.earRight)} ${n(rig.ears.right.pivot.x)} ${n(rig.ears.right.pivot.y)})`,
    pupilLeft: `translate(${n(shift.left.x)} ${n(shift.left.y)})`,
    pupilRight: `translate(${n(shift.right.x)} ${n(shift.right.y)})`,
    nose: `translate(${n(rig.sniff.x)} ${n(rig.sniff.y)}) scale(${n(frame.sniff)}) translate(${n(-rig.sniff.x)} ${n(-rig.sniff.y)})`,
    hoofLeft: hoof('left', frame.hoofLeft),
    hoofRight: hoof('right', frame.hoofRight),
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
