/**
 * Guards the permission prompts iOS shows in each of the app's languages.
 *
 * iOS asks for the photo library and the microphone in the phone's language,
 * using the text the app ships for that language (app.json `locales`, one file
 * each under mobile/locales). Without a file the prompt is English whatever the
 * phone is set to, and the store does not list the language either.
 */
import { APP_LOCALES } from '@kurda/shared';
import { describe, expect, it } from 'vitest';
import rawAppJson from '../app.json';
import ar from '../locales/ar.json';
import ckb from '../locales/ckb.json';
import de from '../locales/de.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import ku from '../locales/ku.json';
import nl from '../locales/nl.json';
import tr from '../locales/tr.json';

const appJson = rawAppJson as unknown as {
  expo: { locales: Record<string, string>; plugins: Array<string | [string, Record<string, unknown>]> };
};

const PROMPTS = ['NSPhotoLibraryUsageDescription', 'NSMicrophoneUsageDescription'] as const;

const pluginConfig = (name: string): Record<string, unknown> | undefined => {
  const entry = appJson.expo.plugins.find((p) => (Array.isArray(p) ? p[0] === name : p === name));
  return Array.isArray(entry) ? entry[1] : undefined;
};

const FILES: Record<string, { ios: Record<string, string> }> = { ar, ckb, de, en, es, fr, ku, nl, tr };

function localeFile(code: string): { ios: Record<string, string> } {
  const file = FILES[code];
  if (!file) throw new Error(`no locale file for ${code}`);
  return file;
}

describe('the permission prompts in every language', () => {
  it('has a file for each of the app’s languages, and no others', () => {
    expect(Object.keys(appJson.expo.locales).sort()).toEqual(APP_LOCALES.map((l) => l.code).sort());
    for (const [code, path] of Object.entries(appJson.expo.locales)) expect(path).toBe(`./locales/${code}.json`);
  });

  it('says what each permission is for, in every file, and nothing else', () => {
    for (const { code } of APP_LOCALES) {
      const { ios } = localeFile(code);
      expect(Object.keys(ios).sort(), code).toEqual([...PROMPTS].sort());
      for (const key of PROMPTS) {
        expect(ios[key]!.length, `${code} ${key}`).toBeGreaterThan(20);
        expect(ios[key], `${code} ${key}`).toContain('Hevalo');
        // written into InfoPlist.strings as "…" without escaping, so a quote or a backslash would break the file
        expect(ios[key], `${code} ${key}`).not.toMatch(/["\\]/);
      }
    }
  });

  it('is a translation, not English copied into another language', () => {
    const english = localeFile('en').ios;
    for (const { code } of APP_LOCALES.filter((l) => l.code !== 'en')) {
      const { ios } = localeFile(code);
      for (const key of PROMPTS) expect(ios[key], `${code} ${key}`).not.toBe(english[key]);
    }
  });

  it('keeps the English file word for word with the text the build writes into Info.plist', () => {
    const english = localeFile('en').ios;
    expect(english.NSPhotoLibraryUsageDescription).toBe(pluginConfig('expo-image-picker')?.photosPermission);
    expect(english.NSMicrophoneUsageDescription).toBe(pluginConfig('expo-audio')?.microphonePermission);
  });

  /*
   * Two plugins write the microphone prompt: the audio recorder, and the image
   * picker, which would otherwise put its own generic "Allow Hevalo to access
   * your microphone" there. Giving both the same text means whichever runs
   * last, the prompt is the app's own.
   */
  it('gives both plugins that write the microphone prompt the same text', () => {
    expect(pluginConfig('expo-image-picker')?.microphonePermission).toBe(pluginConfig('expo-audio')?.microphonePermission);
  });
});
