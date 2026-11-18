import { deviceSwitch } from './devicePref';

/**
 * Settings → Sounds: whether the app's chimes play (a right answer, a finished lesson, something earned). Spoken
 * Kurdish in lessons is not one of them and always plays. On by default and kept per device, like Vibration
 * (vibrationPref.ts), since it is about where the phone is, not who holds it.
 */
const sounds = deviceSwitch('hevalo_sounds');

export const soundsOn = sounds.isOn;
export const loadSoundPref = sounds.load;
export const setSounds = sounds.set;
export const useSoundPref = sounds.use;
