import { deviceSwitch } from './devicePref';

/**
 * Settings → Sounds → Character voices: whether Hevalo and Xezo say a short recorded line at moments worth marking
 * (characters/reactions.ts). On by default and kept per device, like Sounds (soundPref.ts), which silences them too.
 */
const voices = deviceSwitch('hevalo_character_voices');

export const characterVoicesOn = voices.isOn;
export const loadCharacterVoicesPref = voices.load;
export const setCharacterVoices = voices.set;
export const useCharacterVoicesPref = voices.use;
