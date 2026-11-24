import { describe, expect, it } from 'vitest';
import { APP_LOCALES, INKS, PAPER_TONES, WIDGET_IMAGE, paperColors } from '@kurda/shared';
import rawAppJson from '../../app.json';
import {
  APP_GROUP,
  WIDGET_KEYS,
  WIDGET_KIND,
  isWidgetFeed,
  letterThreadLink,
  nextSkyChange,
  refreshSeconds,
  widgetImageSize,
  widgetImageUrl,
  widgetSkyAt,
} from './contract';
import { WIDGET_LOCALES, WIDGET_STRINGS, widgetDate, widgetText } from './strings';

/*
 * The widget spans three programs: this app, the iPhone extension (Swift, mobile/targets/letter-widget) and the
 * Android resources written at build time. Nothing compiles the Swift here, so what they must agree on (the
 * token's location, the widget kind, its words, the paper colours) is read from the Swift and strings files and
 * checked against the app's values.
 */

/** Node's file system, which this workspace's types do not describe; the test reads the files beside it. */
interface Files {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string): string[];
}
const FILES = 'node:fs';
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ FILES)) as Files;

const TARGET = new URL('../../targets/letter-widget/', import.meta.url).pathname;
const swift = (name: string): string => readFileSync(`${TARGET}${name}`, 'utf8');

const appJson = rawAppJson as unknown as {
  expo: {
    ios: { bundleIdentifier: string; entitlements: Record<string, string[]> };
    android: { package: string };
    plugins: Array<string | [string, Record<string, unknown>]>;
  };
};

/** A Localizable.strings file as key → value. */
function readStrings(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/^"((?:[^"\\]|\\.)*)" = "((?:[^"\\]|\\.)*)";$/gm)) out[m[1]!] = m[2]!.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return out;
}

describe('the widget’s contract with the server', () => {
  it('asks for a picture the server will draw: whole points within bounds, the longer side inside its pixels', () => {
    expect(widgetImageSize(158.4, 158.4, 3)).toEqual({ w: 158, h: 158, scale: 3 });
    // A large widget at 3× would pass 1600 pixels: the density comes down instead.
    const large = widgetImageSize(364, 382, 3);
    expect(large.w).toBe(364);
    expect(large.h * large.scale).toBeLessThanOrEqual(WIDGET_IMAGE.maxPixels);
    expect(widgetImageSize(10, 2000, 2)).toMatchObject({ w: WIDGET_IMAGE.minSide, h: WIDGET_IMAGE.maxSide });
    expect(widgetImageSize(100, 100, Number.NaN).scale).toBe(2);
    expect(widgetImageSize(100, 100, 9).scale).toBe(WIDGET_IMAGE.maxScale);
    expect(widgetImageUrl('https://api.test', { w: 158, h: 158, scale: 3 }, 'dusk')).toBe('https://api.test/letters/widget/image?w=158&h=158&scale=3&sky=dusk');
  });

  it('gives the empty sill the sky of the phone’s hour, and asks again when it turns', () => {
    expect([4, 5, 8, 16, 17, 20].map(widgetSkyAt)).toEqual(['night', 'dawn', 'day', 'day', 'dusk', 'night']);
    expect(nextSkyChange(new Date(2026, 10, 15, 9, 30)).getHours()).toBe(17);
    const late = nextSkyChange(new Date(2026, 10, 15, 22, 10));
    expect([late.getDate(), late.getHours()]).toEqual([16, 5]);
  });

  it('keeps to the feed’s refresh, within sensible bounds', () => {
    expect(refreshSeconds(1800)).toBe(1800);
    expect(refreshSeconds(3600)).toBe(3600);
    expect(refreshSeconds(1)).toBe(300);
    expect(refreshSeconds(10 ** 9)).toBe(12 * 3600);
  });

  it('opens the correspondence at the app’s own address for it', () => {
    expect(letterThreadLink('8f2c1a8e-0000-4000-8000-000000000001')).toBe('hevalo://app/letters/8f2c1a8e-0000-4000-8000-000000000001');
  });

  it('takes a feed as the server sends it, and nothing else', () => {
    const letter = { id: 'l1', threadId: 't1', from: { name: 'Rojda', bird: 2 }, excerpt: 'Silav!', sentAt: '2026-11-14T10:00:00.000Z', paper: { style: 'lined', tone: 'cream', ink: 'navy' }, rtl: false, drawn: false };
    expect(isWidgetFeed({ letter, pinned: false, showWords: true, refreshAfter: 1800 })).toBe(true);
    expect(isWidgetFeed({ letter: null, pinned: false, showWords: true, refreshAfter: 1800 })).toBe(true);
    expect(isWidgetFeed({ letter: { ...letter, from: null }, pinned: false, showWords: true, refreshAfter: 1800 })).toBe(false);
    expect(isWidgetFeed({ code: 'WIDGET_UNAUTHORIZED' })).toBe(false);
  });
});

describe('the widget’s own words', () => {
  const keys = Object.keys(WIDGET_STRINGS.en).sort();

  it('are written in every one of the app’s languages, every word of them', () => {
    expect([...WIDGET_LOCALES].sort()).toEqual(APP_LOCALES.map((l) => l.code).sort());
    for (const locale of WIDGET_LOCALES) {
      expect(Object.keys(WIDGET_STRINGS[locale]).sort(), locale).toEqual(keys);
      for (const key of keys) expect(widgetText(locale, key as never).trim().length, `${locale} ${key}`).toBeGreaterThan(0);
      // The sealed line names who the letter is from, and the signed-out line names the app.
      expect(WIDGET_STRINGS[locale].sealed, locale).toContain('{name}');
      expect(WIDGET_STRINGS[locale].signedOut, locale).toContain('Hevalo');
      // Written into Localizable.strings and Android resources, where a raw quote or backslash would need escaping.
      for (const key of keys) expect(WIDGET_STRINGS[locale][key as 'name'], `${locale} ${key}`).not.toMatch(/["\\]/);
    }
  });

  it('are a translation, not the English copied over', () => {
    for (const locale of WIDGET_LOCALES.filter((l) => l !== 'en')) {
      for (const key of ['description', 'signedOut', 'empty', 'emptyMore'] as const) {
        expect(WIDGET_STRINGS[locale][key], `${locale} ${key}`).not.toBe(WIDGET_STRINGS.en[key]);
      }
    }
  });

  it('fill in who a sealed letter is from, and fall back to English for a language there is none in', () => {
    expect(widgetText('ku', 'sealed', { name: 'Rojda' })).toBe('Nameyek ji Rojda');
    expect(widgetText('xx', 'empty')).toBe('No letter yet');
  });

  it('give a letter’s date as the day and month, with the year only when it is not this one', () => {
    const now = new Date('2026-11-15T12:00:00Z');
    expect(widgetDate('2026-11-14T10:00:00.000Z', 'en', now)).toMatch(/14|Nov/);
    expect(widgetDate('2025-03-02T10:00:00.000Z', 'en', now)).toMatch(/2025/);
    expect(widgetDate('not a date', 'en', now)).toBe('');
  });

  it('are the same words in the iPhone extension’s Localizable.strings, language by language', () => {
    const folders = readdirSync(TARGET).filter((f) => f.endsWith('.lproj'));
    expect(folders.map((f) => f.replace('.lproj', '')).sort()).toEqual([...WIDGET_LOCALES].sort());
    for (const locale of WIDGET_LOCALES) {
      expect(readStrings(readFileSync(`${TARGET}${locale}.lproj/Localizable.strings`, 'utf8')), locale).toEqual(WIDGET_STRINGS[locale]);
    }
  });

  it('are offered by the extension in all nine languages', () => {
    const plist = swift('Info.plist');
    const declared = [...plist.matchAll(/<string>([a-z]{2,3})<\/string>/g)].map((m) => m[1]);
    for (const { code } of APP_LOCALES) expect(declared, code).toContain(code);
  });

  it('give the Android build a folder for every language', async () => {
    const plugin = (await import('../../plugins/withLetterWidgetStrings.cjs')) as unknown as { default: { FOLDERS: Record<string, string>; resourceText: (t: string) => string } };
    const { FOLDERS, resourceText } = plugin.default;
    expect(Object.keys(FOLDERS).sort()).toEqual([...WIDGET_LOCALES].sort());
    expect(FOLDERS.en).toBe('values');
    expect(FOLDERS.ckb).toBe('values-b+ckb');
    // An apostrophe ends an Android string unless it is escaped; a leading @ makes it a reference.
    expect(resourceText("it's <b> & @home")).toBe("it\\'s &lt;b&gt; &amp; @home");
    expect(resourceText('@home')).toBe('\\@home');
  });
});

describe('what the iPhone extension reads', () => {
  it('is left under the same names the app writes, in the same App Group', () => {
    const feed = swift('LetterFeed.swift');
    expect(feed).toContain(`static let appGroup = "${APP_GROUP}"`);
    expect(feed).toContain(`static let tokenKey = "${WIDGET_KEYS.token}"`);
    expect(feed).toContain(`static let apiBaseKey = "${WIDGET_KEYS.apiBase}"`);
    expect(feed).toContain(`static let localeKey = "${WIDGET_KEYS.locale}"`);
    expect(feed).toContain(`static let rejectedKey = "${WIDGET_KEYS.rejected}"`);
    // And it marks a refused token the way the app reads it.
    expect(feed).toContain('defaults?.set("1", forKey: rejectedKey)');
    // A parent's switch is not a revoked token: the iPhone widget tells them apart as the Android one does.
    expect(feed).toContain('case 403 where refusalCode(data) == "PARENTAL_BLOCKED":');
  });

  it('is the widget kind the app reloads, and asks the same two routes with the widget’s own header', () => {
    expect(swift('LetterWidget.swift')).toContain(`let kind = "${WIDGET_KIND}"`);
    const feed = swift('LetterFeed.swift');
    expect(feed).toContain('"/letters/widget/feed"');
    expect(feed).toContain('/letters/widget/image?w=');
    expect(feed).toContain('"Widget \\(config.token)"');
    expect(swift('LetterWidget.swift')).toContain('hevalo://app/letters/');
  });

  it('sets the words in each letter’s own ink, the colours shared/src/letter-paper.ts gives', () => {
    const text = swift('PaperColors.swift');
    for (const tone of PAPER_TONES) {
      const block = new RegExp(`"${tone}": Sheet\\(\\s*sheet: "(#[0-9a-f]{6})",\\s*inks: \\[([^\\]]*)\\]`).exec(text);
      expect(block, tone).not.toBeNull();
      expect(block![1], tone).toBe(paperColors({ style: 'lined', tone, ink: 'navy' }).sheet);
      for (const ink of INKS) {
        const colours = paperColors({ style: 'lined', tone, ink });
        expect(block![2], `${tone} ${ink}`).toContain(`"${ink}": Ink(ink: "${colours.ink}", muted: "${colours.muted}")`);
      }
    }
  });
});

describe('the build’s configuration', () => {
  const plugin = (name: string): Record<string, unknown> | undefined => {
    const entry = appJson.expo.plugins.find((p) => (Array.isArray(p) ? p[0] === name : p === name));
    return Array.isArray(entry) ? entry[1] : entry ? {} : undefined;
  };

  it('puts the app and its iPhone widget in the same App Group', () => {
    expect(appJson.expo.ios.entitlements['com.apple.security.application-groups']).toEqual([APP_GROUP]);
    const target = JSON.parse(readFileSync(`${TARGET}expo-target.config.json`, 'utf8')) as { type: string; bundleIdentifier: string; entitlements: Record<string, string[]> };
    expect(target.type).toBe('widget');
    expect(target.entitlements['com.apple.security.application-groups']).toEqual([APP_GROUP]);
    expect(`${appJson.expo.ios.bundleIdentifier}${target.bundleIdentifier}`).toBe('app.hevalo.mobile.widget');
    expect(plugin('@bacons/apple-targets')).toBeDefined();
  });

  it('declares why the extension reads the App Group’s defaults, and that it tracks nothing', () => {
    const manifest = swift('PrivacyInfo.xcprivacy');
    expect(manifest).toContain('NSPrivacyAccessedAPICategoryUserDefaults');
    expect(manifest).toContain('1C8F.1');
    expect(manifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  });

  it('adds the Android widget under the name the app updates, named and described in the widget’s own words', () => {
    const config = plugin('react-native-android-widget') as { widgets: Array<Record<string, unknown>> };
    const widget = config.widgets.find((w) => w.name === WIDGET_KIND);
    expect(widget).toBeDefined();
    expect(widget!.label).toBe('@string/letter_widget_name');
    expect(widget!.description).toBe('@string/letter_widget_description');
    // Android's own clock, every half hour (its least); the app asks for more when something changes.
    expect(widget!.updatePeriodMillis).toBe(30 * 60 * 1000);
    expect(plugin('./plugins/withLetterWidgetStrings.cjs')).toBeDefined();
  });
});
