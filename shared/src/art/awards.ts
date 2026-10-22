/**
 * What Hevalo is doing on each badge: his mood and pose, and the badge's own
 * picture as the thing he holds up, holds at his chest, or stands in front
 * of — the book he is reading, the gem he has found, the fire of Newroz
 * behind him — or what he wears for it: glasses over the dictionary,
 * headphones to listen, a scarf in winter, flowers in spring.
 *
 * Positions are in his own units (mascot.ts): `hold` is where his hooves
 * meet at his chest, `raised` above his raised hoof, `behind` round his head,
 * `front` before his chest with his hooves free.
 * A secret, once found, is not his: it is a treasure on its own (badges.ts).
 */
import type { DeerPose } from './mascot.js';

export interface Prop {
  at: 'hold' | 'raised' | 'behind' | 'front';
  /** how big, 1 being the 40-unit picture at his own scale */
  scale: number;
  dx?: number;
  dy?: number;
  rotate?: number;
}

export interface Scene {
  pose: DeerPose;
  /** the badge's own picture, and where it goes; none when what he wears says it */
  prop?: Prop;
}

const hold = (scale = 1.6, rotate = 0): Prop => ({ at: 'hold', scale, rotate });
const raised = (scale = 1.5, rotate = 0): Prop => ({ at: 'raised', scale, rotate });
const behind = (scale: number, dx = 0, dy = -20): Prop => ({ at: 'behind', scale, dx, dy });

export const SCENES: Readonly<Record<string, Scene>> = {
  // learning
  ders: { pose: { mood: 'happy', arms: 'hold' }, prop: hold(2.49) },
  'peyven-min': { pose: { mood: 'laugh', arms: 'raise', tilt: -6 }, prop: raised(2.13) },
  bekemasi: { pose: { mood: 'wow', arms: 'raise' }, prop: raised(2.13) },
  dubare: { pose: { mood: 'wink', arms: 'hold', tilt: 6 }, prop: hold(2.3) },
  cirokbej: { pose: { mood: 'proud', arms: 'hold' }, prop: hold(2.39, -10) },
  rewi: { pose: { mood: 'laugh', arms: 'raise', tilt: -5 }, prop: raised(2) },
  ferheng: { pose: { mood: 'focus', arms: 'hold', wear: ['glasses'] }, prop: hold(2.39) },
  // habit
  agir: { pose: { mood: 'laugh', arms: 'raise' }, prop: raised(2.15) },
  hefte: { pose: { mood: 'happy', arms: 'hold' }, prop: hold(2.31) },
  roj: { pose: { mood: 'dream', arms: 'down', tilt: 6 }, prop: behind(2.4, -44, -40) },
  vegera: { pose: { mood: 'laugh', arms: 'raise', tilt: -8 }, prop: raised(2.02, -10) },
  pela: { pose: { mood: 'wow', arms: 'cheer' }, prop: { at: 'front', scale: 2.2, dy: 6 } },
  // games
  peyvzan: { pose: { mood: 'proud', arms: 'hold' }, prop: hold(2.22) },
  helbestvan: { pose: { mood: 'dream', arms: 'hold', tilt: -6 }, prop: hold(2.67, 8) },
  bilez: { pose: { mood: 'focus', arms: 'hold', wear: ['headband'] }, prop: hold(2.22) },
  rastnivis: { pose: { mood: 'wink', arms: 'hold' }, prop: hold(2.22) },
  guhdar: { pose: { mood: 'dream', arms: 'down', tilt: -7, wear: ['headphones'] } },
  hemereng: { pose: { mood: 'laugh', arms: 'raise' }, prop: raised(2.13) },
  dilpak: { pose: { mood: 'happy', arms: 'hold', tilt: 5 }, prop: hold(2.31) },
  // ranked: the six tiers hold up their stone (badges.ts); the rest
  hilkiser: { pose: { mood: 'proud', arms: 'cheer' }, prop: { at: 'front', scale: 2.1, dy: 12 } },
  cihgirti: { pose: { mood: 'happy', arms: 'raise' }, prop: raised(2.02) },
  // friends
  heval: { pose: { mood: 'happy', arms: 'hold', tilt: 6 }, prop: hold(2.31) },
  diyari: { pose: { mood: 'wow', arms: 'hold' }, prop: hold(2.31) },
  mevandar: { pose: { mood: 'happy', arms: 'raise' }, prop: raised(2.13) },
  // events
  newroz: { pose: { mood: 'laugh', arms: 'cheer' }, prop: { at: 'front', scale: 2.2, dy: 6 } },
  'roja-ziman': { pose: { mood: 'proud', arms: 'hold' }, prop: hold(2.22, -12) },
  'zimane-dayike': { pose: { mood: 'happy', arms: 'raise' }, prop: raised(2.13) },
  zivistan: { pose: { mood: 'happy', arms: 'down', wear: ['scarf'] }, prop: behind(1.7, -48, -40) },
  bihar: { pose: { mood: 'laugh', arms: 'down', wear: ['flowers'] } },
  havin: { pose: { mood: 'proud', arms: 'down', wear: ['sunglasses'], tilt: -6 }, prop: behind(2.1, 46, -44) },
  payiz: { pose: { mood: 'dream', arms: 'raise' }, prop: raised(2.13, 10) },
  mehane: { pose: { mood: 'wow', arms: 'down' }, prop: behind(2, 46, -46) },
};

/** The ranked tiers' scene: Hevalo holding the rank's stone at his chest, amazed. */
export const STONE_SCENE: Scene = { pose: { mood: 'wow', arms: 'hold' } };
