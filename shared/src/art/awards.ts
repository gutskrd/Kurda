/**
 * What Hevalo is doing on each badge: his face — laughing, amazed, proud,
 * dreaming — the small turn of his head, and where the badge's own picture
 * is: beside him, down by his chest, as if he were showing it to you (the
 * book he has read, the gem he has found), or behind him over a shoulder
 * (the sun he basks in, the snow of winter).
 *
 * He is the speaking character himself (characters/hevalo.ts), the same
 * deer as the app icon, so his faces are the ones he speaks with: his eyes
 * open, half shut, shut or smiling, and his mouth in one of its shapes.
 * On a badge not yet earned he is dreaming of it, eyes shut (badges.ts).
 * A secret, once found, is not his: it is a treasure on its own; nor is a
 * badge drawn as a picture by itself (pictures.ts), which has no scene.
 */
import type { EyeState } from '../characters/types.js';
import type { Viseme } from '../lipsync/visemes.js';

export type Mood = 'happy' | 'laugh' | 'grin' | 'wow' | 'proud' | 'focus' | 'dream';

/** Each mood as his eyes and his mouth. */
export const FACES: Readonly<Record<Mood, { eyes: EyeState; mouth: Viseme }>> = {
  happy: { eyes: 'happy', mouth: 'e' },
  laugh: { eyes: 'happy', mouth: 'a' },
  grin: { eyes: 'open', mouth: 'e' },
  wow: { eyes: 'open', mouth: 'o' },
  proud: { eyes: 'happy', mouth: 'rest' },
  focus: { eyes: 'open', mouth: 'rest' },
  dream: { eyes: 'closed', mouth: 'rest' },
};

export interface Prop {
  /** beside him, down by his chest, or behind him over a shoulder */
  at: 'beside' | 'behind';
  /** how big, against the badge's own size for a picture there */
  scale?: number;
  /** moved this far from its place, in the badge's units */
  dx?: number;
  dy?: number;
  rotate?: number;
}

export interface Scene {
  mood: Mood;
  /** how far his head is turned, in degrees: to his left below 0 */
  tilt?: number;
  prop: Prop;
}

const beside = (rotate = 0, scale = 1): Prop => ({ at: 'beside', scale, rotate });
/** Behind him, over one shoulder: `side` -1 his right (the badge's left), 1 his left. */
const behind = (side: -1 | 1, scale = 1, dy = 0): Prop => ({ at: 'behind', scale, dx: side, dy });

export const SCENES: Readonly<Record<string, Scene>> = {
  // learning
  ders: { mood: 'happy', prop: beside() },
  'peyven-min': { mood: 'laugh', tilt: -5, prop: beside(-8) },
  bekemasi: { mood: 'wow', prop: beside() },
  dubare: { mood: 'grin', tilt: 5, prop: beside() },
  cirokbej: { mood: 'proud', prop: beside(-8) },
  rewi: { mood: 'laugh', tilt: -4, prop: beside() },
  ferheng: { mood: 'focus', prop: beside() },
  zengil: { mood: 'happy', tilt: -4, prop: beside(-10) },
  penus: { mood: 'focus', prop: beside() },
  // habit
  agir: { mood: 'laugh', prop: beside() },
  hefte: { mood: 'happy', prop: beside() },
  roj: { mood: 'dream', tilt: 5, prop: behind(-1, 1.3) },
  vegera: { mood: 'laugh', tilt: -6, prop: beside(-8) },
  pela: { mood: 'wow', prop: beside() },
  cay: { mood: 'proud', prop: beside() },
  'gula-hefte': { mood: 'laugh', prop: beside() },
  // games
  peyvzan: { mood: 'proud', prop: beside() },
  helbestvan: { mood: 'dream', tilt: -5, prop: beside(8) },
  bilez: { mood: 'focus', prop: beside() },
  rastnivis: { mood: 'grin', prop: beside() },
  guhdar: { mood: 'dream', tilt: -6, prop: beside() },
  hemereng: { mood: 'laugh', prop: beside() },
  dilpak: { mood: 'happy', tilt: 4, prop: beside() },
  mamik: { mood: 'wow', prop: beside(8) },
  bilbil: { mood: 'dream', tilt: 5, prop: beside() },
  // ranked: the six tiers show their stone (badges.ts); the rest
  hilkiser: { mood: 'proud', prop: beside() },
  cihgirti: { mood: 'happy', prop: beside() },
  // friends
  heval: { mood: 'happy', tilt: 5, prop: beside() },
  diyari: { mood: 'wow', prop: beside() },
  mevandar: { mood: 'happy', prop: beside() },
  name: { mood: 'happy', tilt: 5, prop: beside(-8) },
  // events
  newroz: { mood: 'laugh', prop: beside() },
  'roja-ziman': { mood: 'proud', prop: beside(-10) },
  'zimane-dayike': { mood: 'happy', prop: beside() },
  sersal: { mood: 'wow', prop: behind(1, 1.05) },
  yelda: { mood: 'dream', prop: beside() },
  zivistan: { mood: 'happy', prop: behind(-1, 0.9) },
  bihar: { mood: 'laugh', prop: beside() },
  havin: { mood: 'proud', tilt: -5, prop: behind(1, 1.05) },
  payiz: { mood: 'dream', prop: beside(10) },
  mehane: { mood: 'wow', prop: beside(0, 1.15) },
};

/** The ranked tiers' scene: the rank's own stone beside him, and Hevalo amazed at it. */
export const STONE_SCENE: Scene = { mood: 'wow', prop: beside() };
