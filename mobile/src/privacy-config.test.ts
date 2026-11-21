/**
 * Guards the iOS privacy configuration against silent regressions: no tracking, honest permission strings, only
 * permissions the app uses, a complete Privacy Manifest, and App Store Connect answers that match it. Reads
 * mobile/app.json and docs/app-store/privacy.md directly.
 */
import { describe, expect, it } from 'vitest';
import rawAppJson from '../app.json';

/** Node's file system, which this workspace's types do not describe: the answers to App Store Connect are read from the docs. */
interface Files {
  readFileSync(path: string, encoding: 'utf8'): string;
}
const FILES = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FILES)) as Files;
const PRIVACY_DOC = new URL('../../docs/app-store/privacy.md', import.meta.url).pathname;

const appJson = rawAppJson as unknown as {
  expo: {
    ios: {
      privacyManifests: {
        NSPrivacyTracking: boolean;
        NSPrivacyTrackingDomains: string[];
        NSPrivacyCollectedDataTypes: Array<{ NSPrivacyCollectedDataType: string; NSPrivacyCollectedDataTypeLinked: boolean; NSPrivacyCollectedDataTypeTracking: boolean }>;
        NSPrivacyAccessedAPITypes: Array<{ NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] }>;
      };
    };
    android: { blockedPermissions?: string[] };
    plugins: Array<string | [string, Record<string, unknown>]>;
  };
};

const { privacyManifests } = appJson.expo.ios;
const pluginConfig = (name: string): Record<string, unknown> | undefined => {
  const entry = appJson.expo.plugins.find((p) => (Array.isArray(p) ? p[0] === name : p === name));
  return Array.isArray(entry) ? entry[1] : undefined;
};

describe('iOS privacy config (KUR-277)', () => {
  it('declares no tracking and no tracking domains', () => {
    expect(privacyManifests.NSPrivacyTracking).toBe(false);
    expect(privacyManifests.NSPrivacyTrackingDomains).toEqual([]);
    // No collected data type may be flagged as used for tracking.
    for (const d of privacyManifests.NSPrivacyCollectedDataTypes) {
      expect(d.NSPrivacyCollectedDataTypeTracking).toBe(false);
    }
  });

  it('has honest, specific usage strings only for permissions actually used', () => {
    const photos = pluginConfig('expo-image-picker')?.photosPermission as string | undefined;
    const mic = pluginConfig('expo-audio')?.microphonePermission as string | undefined;
    expect(photos).toBeTruthy();
    expect(mic).toBeTruthy();
    expect(photos!.length).toBeGreaterThan(20);
    expect(mic!.length).toBeGreaterThan(20);
    // The app never opens the camera or uses Face ID. Omitting the option is not enough, since each plugin then
    // writes its own generic "Allow Hevalo to access…" string, which App Review rejects as vague; `false` keeps
    // the key out.
    expect(pluginConfig('expo-image-picker')?.cameraPermission).toBe(false);
    expect(pluginConfig('expo-secure-store')?.faceIDPermission).toBe(false);
    // Hevalo leans and turns with the phone, which needs no prompt; the motion sensor's package also holds step counting,
    // so its sentence is declared, saying plainly what the motion is used for.
    expect(pluginConfig('expo-sensors')?.motionPermission).toMatch(/^Hevalo reads how you tilt and turn your phone .*keeps none of it\.$/);
  });

  /* Nothing plays in the background, so the app does not claim the background audio mode, which App Review checks is used. */
  it('does not claim background audio', () => {
    expect(pluginConfig('expo-audio')?.enableBackgroundPlayback).toBe(false);
  });

  it('declares the required-reason APIs the runtime uses, with reason codes', () => {
    const byType = new Map(privacyManifests.NSPrivacyAccessedAPITypes.map((a) => [a.NSPrivacyAccessedAPIType, a.NSPrivacyAccessedAPITypeReasons]));
    for (const t of [
      'NSPrivacyAccessedAPICategoryUserDefaults',
      'NSPrivacyAccessedAPICategoryFileTimestamp',
      'NSPrivacyAccessedAPICategorySystemBootTime',
      'NSPrivacyAccessedAPICategoryDiskSpace',
    ]) {
      expect(byType.get(t)?.length).toBeGreaterThan(0);
    }
  });

  /*
   * What the app and its server keep, exactly: the manifest and the App Store privacy label must match what is
   * collected. Messages, game results, feedback, the install's random device id and push token, birth month, time zone
   * and self-chosen identity tags (an ethnicity among them) are kept; the country a sign-in came from is kept in the
   * security log (api/src/security/log.ts), and a country can be put on the profile. No phone number is ever asked for
   * and no precise location read. Crash reports are sent (errors/crashReporting.ts) without an account or device id, so
   * they are declared as not linked.
   */
  it('declares exactly the data the app collects', () => {
    const types = new Set(privacyManifests.NSPrivacyCollectedDataTypes.map((d) => d.NSPrivacyCollectedDataType));
    for (const t of [
      'EmailAddress',
      'Name',
      'UserID',
      'PhotosorVideos',
      'AudioData',
      'OtherUserContent',
      'EmailsOrTextMessages',
      'GameplayContent',
      'CustomerSupport',
      'DeviceID',
      'SensitiveInfo',
      'OtherDataTypes',
      'CoarseLocation',
      'CrashData',
    ]) {
      expect(types.has(`NSPrivacyCollectedDataType${t}`), t).toBe(true);
    }
    for (const t of ['PhoneNumber', 'PreciseLocation', 'Contacts', 'AdvertisingData']) {
      expect(types.has(`NSPrivacyCollectedDataType${t}`), t).toBe(false);
    }
    const crash = privacyManifests.NSPrivacyCollectedDataTypes.find((d) => d.NSPrivacyCollectedDataType === 'NSPrivacyCollectedDataTypeCrashData');
    expect(crash?.NSPrivacyCollectedDataTypeLinked).toBe(false);
  });
});

describe('the App Store Connect answers in docs/app-store/privacy.md', () => {
  it('list the manifest’s data types one for one, in its order, linked as it says', () => {
    const rows = [...readFileSync(PRIVACY_DOC, 'utf8').matchAll(/^\| [^|]+ \| `(\w+)` \| (yes|\*\*no\*\*) \| no \|/gm)].map((m) => ({
      type: m[1],
      linked: m[2] === 'yes',
    }));
    const declared = privacyManifests.NSPrivacyCollectedDataTypes.map((d) => ({
      type: d.NSPrivacyCollectedDataType.replace('NSPrivacyCollectedDataType', ''),
      linked: d.NSPrivacyCollectedDataTypeLinked,
    }));
    expect(rows).toEqual(declared);
  });
});

describe('Android permissions', () => {
  it('keeps out drawing over other apps, which the project template asks for and Hevalo never uses', () => {
    expect(appJson.expo.android.blockedPermissions).toContain('android.permission.SYSTEM_ALERT_WINDOW');
  });

  it('keeps out physical-activity access, which the motion sensor’s package asks for and the tilt never needs', () => {
    expect(appJson.expo.android.blockedPermissions).toContain('android.permission.ACTIVITY_RECOGNITION');
  });
});
