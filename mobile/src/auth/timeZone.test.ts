/**
 * The learner's own time zone (timeZone.ts): what is sent, and when nothing is.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => undefined }) } }));

import { deviceTimeZone, zoneToSend } from './timeZone';

describe('the learner’s time zone', () => {
  it('reads the device’s IANA zone', () => {
    expect(deviceTimeZone()).toBe(new Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('sends the device’s zone where the server counts the days in another', () => {
    expect(zoneToSend('UTC', 'Asia/Baghdad')).toBe('Asia/Baghdad');
    expect(zoneToSend('Europe/Berlin', 'Europe/Istanbul')).toBe('Europe/Istanbul');
  });

  it('sends nothing where they agree, where the device cannot say, or where the server does not say', () => {
    expect(zoneToSend('Asia/Baghdad', 'Asia/Baghdad')).toBeNull();
    expect(zoneToSend('UTC', null)).toBeNull();
    expect(zoneToSend(undefined, 'Asia/Baghdad')).toBeNull();
    expect(zoneToSend(null, 'Asia/Baghdad')).toBeNull();
  });
});
