/**
 * The living rounds of the sky's gifts (gift-art-sky.ts): the moon, the galaxy, the shooting star, the rainbow, the
 * Newroz fire and the sun. Each layer named here is painted by the gift's drawing under the same name, back to front.
 */
import { giftLoop, type GiftLoop } from './gift-loop.js';
import type { GiftArtId } from './gift-art.js';

const TAU = Math.PI * 2;
const breath = (t: number): number => 0.5 - 0.5 * Math.cos(TAU * t);

/** The sun: its two rings of rays breathing out and in a beat apart, turning a little, and its face churning slowly. */
const roj = giftLoop(6000, {
  back: { box: [11, 14, 99, 94], origin: [60, 60], motion: (t) => ({ sx: 1 + 0.05 * breath(t), sy: 1 + 0.05 * breath(t), rot: 2.4 * Math.sin(TAU * t) }) },
  long: { box: [5, 6, 111, 110], origin: [60, 60], motion: (t) => ({ sx: 1 + 0.04 * breath(t - 0.2), sy: 1 + 0.04 * breath(t - 0.2), rot: -1.6 * Math.sin(TAU * t) }) },
  disc: { box: [26, 26, 68, 68] },
  swirl: { box: [33, 37, 52, 50], origin: [60, 60], motion: (t) => ({ rot: 9 * Math.sin(TAU * t) }) },
  face: { box: [30, 29, 60, 62] },
}, { base: 'none' });

export const SKY_LOOPS: Readonly<Partial<Record<GiftArtId, GiftLoop>>> = { roj };
