import { GIFT_REDUCED_MOTION_MS, GIFT_UNWRAP_MS, type GiftTier } from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';

/** Timing and sound for the gift moments, kept out of the components so they can be tested without animation. */

/** How long an unwrap plays before the item is shown (shared GIFT_UNWRAP_MS), or the reduced-motion fade. */
export function unwrapMs(tier: GiftTier, reduced: boolean = prefersReducedMotion()): number {
  return reduced ? GIFT_REDUCED_MOTION_MS : GIFT_UNWRAP_MS[tier];
}

/** The send (wrap, tie, fly into the chat), or the reduced-motion fade. */
const SEND_MS = 1150;
export function sendMs(reduced: boolean = prefersReducedMotion()): number {
  return reduced ? GIFT_REDUCED_MOTION_MS : SEND_MS;
}

// ---- The chime ----

const SOUND_KEY = 'hevalo_gift_sound';

/** Whether the unwrap may chime (Settings → Sounds). On unless turned off on this device. */
export function giftSoundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setGiftSound(on: boolean): void {
  try {
    if (on) localStorage.removeItem(SOUND_KEY);
    else localStorage.setItem(SOUND_KEY, 'off');
  } catch {
    // Without storage the choice lasts as long as the page.
  }
}

/** The notes of each tier's chime, in Hz, rising: a small one, an arpeggio, a fanfare. */
export const CHIME_NOTES: Readonly<Record<GiftTier, readonly number[]>> = {
  common: [1318.5, 1975.5],
  rare: [1046.5, 1318.5, 1568, 2093],
  legendary: [784, 1046.5, 1318.5, 1568, 2093, 2637],
};

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

/**
 * A short bell synthesised by the browser: each note a sine with a quieter octave above, a quick attack and a soft
 * tail. Called only from the tap that opens a gift, since autoplay rules allow sound started by the user, and never
 * under Reduce Motion or with gift sounds off.
 */
export function playChime(tier: GiftTier): void {
  if (!giftSoundOn() || prefersReducedMotion()) return;
  try {
    const Ctor: AudioCtor | undefined =
      (window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }).AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    const start = ctx.currentTime + 0.02;
    const step = tier === 'legendary' ? 0.11 : 0.09;
    CHIME_NOTES[tier].forEach((freq, i) => {
      const at = start + i * step;
      const tail = tier === 'legendary' ? 1.4 : 0.9;
      for (const [mult, level] of [
        [1, 0.12],
        [2, 0.035],
      ] as const) {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * mult;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(level, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + tail);
        osc.connect(gain).connect(ctx!.destination);
        osc.start(at);
        osc.stop(at + tail + 0.05);
      }
    });
  } catch {
    // A browser that will not make a sound just gives a quiet gift.
  }
}

/** Seeded, so a burst looks the same on every render and in tests. */
export function scatter(i: number, seed = 7): number {
  const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
