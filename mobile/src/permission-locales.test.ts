/**
 * Guards the permission prompts iOS shows in each app language. iOS asks for the photo library and microphone in
 * the phone's language using the text the app ships for it (app.json `locales`, one file per language under
 * mobile/locales); without a file the prompt is English and the store does not list the language. The motion
 * sentence is there because the motion sensor's package declares it; Hevalo never asks, since the tilt he leans with
 * needs no permission.
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

const PROMPTS = ['NSPhotoLibraryUsageDescription', 'NSMicrophoneUsageDescription', 'NSMotionUsageDescription'] as const;

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
        // Written into InfoPlist.strings as "…" without escaping, so a quote or backslash would break the file.
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
    expect(english.NSMotionUsageDescription).toBe(pluginConfig('expo-sensors')?.motionPermission);
  });

  /*
   * Two plugins write the microphone prompt, the audio recorder and the image picker (which would otherwise write
   * a generic string); giving both the same text keeps the app's own whichever runs last.
   */
  it('gives both plugins that write the microphone prompt the same text', () => {
    expect(pluginConfig('expo-image-picker')?.microphonePermission).toBe(pluginConfig('expo-audio')?.microphonePermission);
  });

  /*
   * App review reads the system prompt's sentence closely: one brief, complete, active sentence ending in a full
   * stop that says what the app does with what it is given. Not a request ("Turn on microphone access.") nor an
   * unexplained need ("Microphone access is needed for a better experience."): each says what Hevalo does,
   * uploading the chosen photos or recording when record is tapped, and why.
   */
  it('says what Hevalo does, in one complete sentence, and asks for nothing', () => {
    for (const { code } of APP_LOCALES) {
      const { ios } = localeFile(code);
      for (const key of PROMPTS) {
        const sentence = ios[key]!;
        expect(sentence.endsWith('.'), `${code} ${key} ends as a sentence does`).toBe(true);
        expect(sentence.slice(0, -1), `${code} ${key} is one sentence`).not.toMatch(/[.!?؟]/);
      }
    }
    const english = localeFile('en').ios;
    expect(english.NSPhotoLibraryUsageDescription).toMatch(/^Hevalo uploads the photos you choose /);
    expect(english.NSMicrophoneUsageDescription).toMatch(/^Hevalo records your voice when you tap record, /);
    expect(english.NSMotionUsageDescription).toMatch(/^Hevalo reads how you tilt your phone /);
    for (const key of PROMPTS) expect(english[key], key).not.toMatch(/allow|access|need|turn on|better experience|would like|please/i);
  });
});
