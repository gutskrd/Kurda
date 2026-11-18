import { deviceSwitch } from './devicePref';

/**
 * Settings → Sounds: whether a lesson plays its Kurdish recording by itself a moment after each answer; off, it
 * waits for "Hear it". Listening exercises play their clip on open either way. Hearing the sentence while the
 * answer is on screen ties sound to spelling, but a phone on a bus may not want to speak unasked. On by default
 * and kept per device, like Sounds (soundPref.ts).
 */
const autoplay = deviceSwitch('hevalo_autoplay_audio');

export const autoplayOn = autoplay.isOn;
export const loadAutoplayPref = autoplay.load;
export const setAutoplay = autoplay.set;
export const useAutoplayPref = autoplay.use;
export const resetAutoplayPref = autoplay.reset;
