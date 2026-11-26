import { LETTER_BIRD_FEET, letterBirdSvg, type PigeonPose } from '@kurda/shared';

/**
 * The pen-pal pigeon's pictures for the apps-coming-soon card (AppSoon.tsx), loaded only when a download button is
 * near a pointer or pressed: flying in with a letter, perched with it, and perched without it, happy and blinking.
 * It flies in from the right, so it faces left.
 */
export type SoonFrame = 'up' | 'down' | 'holding' | 'perched' | 'happy' | 'blink';

const FRAMES: Record<SoonFrame, { pose: PigeonPose; letter: boolean }> = {
  up: { pose: 'wings-up', letter: true },
  down: { pose: 'wings-down', letter: true },
  holding: { pose: 'perched', letter: true },
  perched: { pose: 'perched', letter: false },
  happy: { pose: 'happy', letter: false },
  blink: { pose: 'blink', letter: false },
};

/** The grey pigeon, as the letters pages draw a new member's bird. */
const BIRD = 0;

export function soonFrames(size: number, prefix: string): Record<SoonFrame, string> {
  const out = {} as Record<SoonFrame, string>;
  for (const [name, f] of Object.entries(FRAMES) as Array<[SoonFrame, (typeof FRAMES)[SoonFrame]]>) {
    out[name] = letterBirdSvg({ bird: BIRD, pose: f.pose, letter: f.letter, facingLeft: true, shadow: false, size, idPrefix: `${prefix}${name}` });
  }
  return out;
}

/** Where the pigeon's feet are on its square, so the card can stand it on its top edge. */
export const SOON_FEET = { x: LETTER_BIRD_FEET.x / 120, y: LETTER_BIRD_FEET.y / 120 } as const;
