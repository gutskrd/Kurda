import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PATTERNS, canVibrate, haptic, resetHaptics, setVibration, vibrationOn } from './haptics';

/** A phone's browser: a touch screen whose browser can vibrate. */
function touchScreen(coarse = true) {
  const vibrate = vi.fn((_pattern: VibratePattern) => true);
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q === '(pointer: coarse)', media: q }) as MediaQueryList);
  return vibrate;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(50_000);
  resetHaptics();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  // jsdom has no vibrate of its own: take ours away again
  delete (navigator as { vibrate?: unknown }).vibrate;
});

describe('haptic() on the web', () => {
  it('buzzes a short pulse for a right answer, a gentle double for a wrong one, and a little more for a celebration', () => {
    const vibrate = touchScreen();
    haptic('correct');
    vi.setSystemTime(50_100);
    haptic('wrong');
    vi.setSystemTime(50_200);
    haptic('celebrate');
    expect(vibrate.mock.calls).toEqual([[PATTERNS.correct], [PATTERNS.wrong], [PATTERNS.celebrate]]);
    // a "wrong" is never a long buzz
    expect((PATTERNS.wrong as number[]).every((ms) => ms <= 80)).toBe(true);
  });

  it('is paced like the phone: never two within 60 ms, a celebration once in two seconds', () => {
    const vibrate = touchScreen();
    haptic('correct');
    haptic('correct');
    vi.setSystemTime(50_100);
    haptic('celebrate');
    vi.setSystemTime(51_500);
    haptic('celebrate');
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('stays still with a mouse, without the API, with Settings → Vibration off, or in a hidden tab', () => {
    const mouse = touchScreen(false);
    haptic('correct');
    expect(mouse).not.toHaveBeenCalled();
    expect(canVibrate()).toBe(false);

    const vibrate = touchScreen();
    expect(vibrationOn()).toBe(true);
    setVibration(false);
    expect(localStorage.getItem('hevalo_vibration')).toBe('off');
    haptic('celebrate');
    expect(vibrate).not.toHaveBeenCalled();
    setVibration(true);
    expect(localStorage.getItem('hevalo_vibration')).toBeNull();

    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    haptic('celebrate');
    expect(vibrate).not.toHaveBeenCalled();
    hidden.mockRestore();

    haptic('celebrate');
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});
