import { deviceSwitch } from './devicePref';

/**
 * Settings → Vibration: whether this phone buzzes at all. On by default and kept per device, since it is about
 * where the phone is, not who holds it. Read once at startup and held in memory, so deciding to buzz never waits
 * on storage; until it loads, the default (on) stands.
 */
const vibration = deviceSwitch('hevalo_vibration');

export const vibrationOn = vibration.isOn;
export const loadVibrationPref = vibration.load;
export const setVibration = vibration.set;
export const useVibrationPref = vibration.use;
export const resetVibrationPref = vibration.reset;
