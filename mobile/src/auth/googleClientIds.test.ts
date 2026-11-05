import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigContext } from 'expo/config';
import appJson from '../../app.json';
import appConfig, { GOOGLE_SIGNIN_PLUGIN, googleIosUrlScheme, googleSignInPlugin } from '../../app.config';
import { googleSignInAvailable } from './googleClientIds';

// made-up ids in the shape Google issues them; no real client is named in the repository
const IOS_ID = '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com';
const IOS_SCHEME = 'com.googleusercontent.apps.123456789012-abcdefghijklmnopqrstuvwxyz012345';
const WEB_ID = '123456789012-zyxwvutsrqponmlkjihgfedcba543210.apps.googleusercontent.com';

describe('the iOS URL scheme', () => {
  it('is the client id reversed', () => {
    expect(googleIosUrlScheme(IOS_ID)).toBe(IOS_SCHEME);
    expect(googleIosUrlScheme(`  ${IOS_ID}\n`)).toBe(IOS_SCHEME);
  });

  it('is nothing without an id, or with something that is not one', () => {
    expect(googleIosUrlScheme(undefined)).toBeNull();
    expect(googleIosUrlScheme('')).toBeNull();
    expect(googleIosUrlScheme('   ')).toBeNull();
    expect(googleIosUrlScheme(IOS_SCHEME)).toBeNull();
    expect(googleIosUrlScheme('123456789012-abc')).toBeNull();
    expect(googleIosUrlScheme('123 456.apps.googleusercontent.com')).toBeNull();
  });
});

describe('the config plugin entry', () => {
  it('carries the reversed id when the build has one', () => {
    expect(googleSignInPlugin(IOS_ID)).toEqual([GOOGLE_SIGNIN_PLUGIN, { iosUrlScheme: IOS_SCHEME }]);
  });

  it('is left out when the build has none', () => {
    expect(googleSignInPlugin(undefined)).toBeNull();
    expect(googleSignInPlugin('')).toBeNull();
  });

  it('stops the build when the id is set but malformed, rather than shipping a button that cannot work', () => {
    expect(() => googleSignInPlugin('not-a-client-id')).toThrow(/EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID/);
  });
});

describe('app.config.ts', () => {
  const context = (): ConfigContext => ({
    projectRoot: '.',
    staticConfigPath: 'app.json',
    packageJsonPath: 'package.json',
    config: structuredClone(appJson.expo) as ConfigContext['config'],
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is app.json unchanged when the build has no iOS client id', () => {
    vi.stubEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', '');
    expect(appConfig(context())).toEqual(appJson.expo);
  });

  it('adds the plugin with the reversed id, after app.json’s own plugins, when it has one', () => {
    vi.stubEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', IOS_ID);
    const config = appConfig(context());
    expect(config.plugins?.slice(0, -1)).toEqual(appJson.expo.plugins);
    expect(config.plugins?.at(-1)).toEqual([GOOGLE_SIGNIN_PLUGIN, { iosUrlScheme: IOS_SCHEME }]);
    expect({ ...config, plugins: undefined }).toEqual({ ...appJson.expo, plugins: undefined });
  });
});

describe('whether the sign-in screen offers Google', () => {
  it('needs the web id everywhere', () => {
    expect(googleSignInAvailable('android', {})).toBe(false);
    expect(googleSignInAvailable('ios', { ios: IOS_ID })).toBe(false);
    expect(googleSignInAvailable('android', { web: WEB_ID })).toBe(true);
  });

  it('needs the iOS id as well on iOS, because without it nothing can come back to the app', () => {
    expect(googleSignInAvailable('ios', { web: WEB_ID })).toBe(false);
    expect(googleSignInAvailable('ios', { web: WEB_ID, ios: '  ' })).toBe(false);
    expect(googleSignInAvailable('ios', { web: WEB_ID, ios: IOS_ID })).toBe(true);
  });
});
