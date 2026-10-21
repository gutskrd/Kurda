// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
import { AppState } from 'react-native';
import type { HapticEvent } from './hapticPacing';
import { haptic, onHaptic, setHapticDriver } from './haptics';
import { loadVibrationPref, resetVibrationPref, setVibration, vibrationOn } from './vibrationPref';
import { memoryStore } from '../keyboard/deviceStore';

describe('haptic()', () => {
  let felt: HapticEvent[];
  let restore: () => void;
  let stop: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    resetVibrationPref();
    felt = [];
    restore = setHapticDriver((e) => felt.push(e));
    stop = onHaptic(() => undefined);
  });
  afterEach(() => {
    restore();
    stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hands each event to the device, paced', () => {
    haptic('correct');
    haptic('correct');
    vi.setSystemTime(10_100);
    haptic('wrong');
    expect(felt).toEqual(['correct', 'wrong']);
  });

  it('is silent with Settings → Vibration off, and buzzes again once it is back on', async () => {
    const store = memoryStore();
    await setVibration(false, store);
    expect(store.data.get('hevalo_vibration')).toBe('off');
    haptic('celebrate');
    expect(felt).toEqual([]);
    await setVibration(true, store);
    expect(store.data.has('hevalo_vibration')).toBe(false);
    haptic('celebrate');
    expect(felt).toEqual(['celebrate']);
  });

  it('is on by default, and remembers off across launches', async () => {
    expect(vibrationOn()).toBe(true);
    await loadVibrationPref(memoryStore({ hevalo_vibration: 'off' }));
    expect(vibrationOn()).toBe(false);
  });

  it('never buzzes while the app is in the background (a timer that fires late)', () => {
    vi.spyOn(AppState, 'currentState', 'get').mockReturnValue('background');
    haptic('celebrate');
    expect(felt).toEqual([]);
  });

  it('a missing native module is a quiet no-op', () => {
    restore();
    restore = setHapticDriver(null);
    // the web build: no module, nothing thrown
    expect(() => haptic('error')).not.toThrow();
  });
});
