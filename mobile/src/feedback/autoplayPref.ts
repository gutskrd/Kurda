import { deviceSwitch } from './devicePref';

/**
 * Settings → Sounds: whether a lesson plays its Kurdish recordings by itself, each exercise's line as it appears and
 * the answer's a moment after the verdict; off, they wait for a tap. Listening exercises play their clip on open
 * either way. Hearing the sentence while the
 * answer is on screen ties sound to spelling, but a phone on a bus may not want to speak unasked. On by default
 * and kept per device, like Sounds (soundPref.ts).
 */
const autoplay = deviceSwitch('hevalo_autoplay_audio');

export const autoplayOn = autoplay.isOn;
export const loadAutoplayPref = autoplay.load;
export const setAutoplay = autoplay.set;
export const useAutoplayPref = autoplay.use;
export const resetAutoplayPref = autoplay.reset;
