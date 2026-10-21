/**
 * Guards the iOS privacy configuration (KUR-277) against silent regressions: no
 * tracking, honest permission strings, only permissions the app actually uses, and
 * a complete Privacy Manifest. Reads mobile/app.json directly.
 */
import { describe, expect, it } from 'vitest';
import rawAppJson from '../app.json';

const appJson = rawAppJson as unknown as {
  expo: {
    ios: {
      privacyManifests: {
        NSPrivacyTracking: boolean;
        NSPrivacyTrackingDomains: string[];
        NSPrivacyCollectedDataTypes: Array<{ NSPrivacyCollectedDataType: string; NSPrivacyCollectedDataTypeTracking: boolean }>;
        NSPrivacyAccessedAPITypes: Array<{ NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] }>;
      };
    };
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
    // no collected data type may be flagged as used for tracking
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
    // the app never opens the camera or asks for Face ID. Leaving the option
    // out is not enough: each plugin then writes its own generic "Allow Hevalo
    // to access…" string into the app, which App Review rejects as vague.
    // `false` is what keeps the key out altogether.
    expect(pluginConfig('expo-image-picker')?.cameraPermission).toBe(false);
    expect(pluginConfig('expo-secure-store')?.faceIDPermission).toBe(false);
  });

  /*
   * Nothing plays while the app is in the background, so it does not claim
   * the background audio mode, which App Review checks is actually used.
   */
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
   * What the app and its server actually keep, no more and no less: the
   * manifest and the App Store privacy label have to match what is collected.
   * Messages, game results, feedback, the install's random device id, the
   * birth month and self-chosen identity tags are kept; a phone number is
   * never asked for, and no crash reports are sent anywhere.
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
    ]) {
      expect(types.has(`NSPrivacyCollectedDataType${t}`), t).toBe(true);
    }
    for (const t of ['PhoneNumber', 'CrashData', 'PreciseLocation', 'Contacts', 'AdvertisingData']) {
      expect(types.has(`NSPrivacyCollectedDataType${t}`), t).toBe(false);
    }
  });
});
