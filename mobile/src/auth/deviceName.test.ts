import { describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({
  OS: 'android' as string,
  isPad: false,
  constants: { Manufacturer: 'Google', Model: 'Pixel 8' } as Record<string, string>,
  screen: { width: 412, height: 915 },
}));
vi.mock('react-native', () => ({
  Platform: platform,
  Dimensions: { get: () => platform.screen },
}));

import { DEVICE_NAME_MAX, deviceName, deviceNameFor } from './deviceName';

describe('what the device list calls this phone', () => {
  it('names an iPhone and an iPad', () => {
    expect(deviceNameFor({ os: 'ios', isPad: false })).toBe('iPhone');
    expect(deviceNameFor({ os: 'ios', isPad: true })).toBe('iPad');
  });

  it('says phone or tablet on Android, with the maker and the model', () => {
    expect(deviceNameFor({ os: 'android', manufacturer: 'samsung', model: 'SM-S911B', shortSide: 384 })).toBe('Android phone (Samsung SM-S911B)');
    expect(deviceNameFor({ os: 'android', manufacturer: 'Google', model: 'Pixel Tablet', shortSide: 800 })).toBe('Android tablet (Google Pixel Tablet)');
  });

  it('does not say the maker twice, or anything it was not told', () => {
    expect(deviceNameFor({ os: 'android', manufacturer: 'OnePlus', model: 'OnePlus 12', shortSide: 400 })).toBe('Android phone (OnePlus 12)');
    expect(deviceNameFor({ os: 'android', shortSide: 400 })).toBe('Android phone');
    expect(deviceNameFor({ os: 'android', manufacturer: '  \n', model: 'Pixel 8', shortSide: 400 })).toBe('Android phone (Pixel 8)');
  });

  it('stays within what the server keeps', () => {
    const name = deviceNameFor({ os: 'android', manufacturer: 'Maker', model: 'M'.repeat(200), shortSide: 400 })!;
    expect(name.length).toBeLessThanOrEqual(DEVICE_NAME_MAX);
    expect(name.startsWith('Android phone (Maker MMM')).toBe(true);
  });

  it('sends nothing off iOS and Android', () => {
    expect(deviceNameFor({ os: 'web' })).toBeUndefined();
  });

  it('reads this phone from the platform', () => {
    expect(deviceName()).toBe('Android phone (Google Pixel 8)');
    platform.OS = 'ios';
    platform.isPad = true;
    expect(deviceName()).toBe('iPad');
  });
});
