// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Animated } from 'react-native';
import { DEER_BREATH_LOW, DEER_BREATH_MS, DEER_LOOP_MS, DEER_LOOP_TURNS, deerFormPath, deerLoopAt, deerMarkPath } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { DeerLoader } from './DeerLoader';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));

/** Moments of the loop: as he flows into the spinner, and as the spinner. */
const FLOWING_AT = Array.from({ length: 200 }, (_, i) => i / 200).find((t) => deerLoopAt(t).morph > 0.4) as number;
const SPINNING_AT = Array.from({ length: 200 }, (_, i) => i / 200).find((t) => deerLoopAt(t).morph === 1) as number;

/** Every timing asked for, with the value it drives, and how many loops were started; none actually runs. */
function recordMotion(): { timings: { value: Animated.Value; config: Animated.TimingAnimationConfig }[]; loops: number } {
  const seen = { timings: [] as { value: Animated.Value; config: Animated.TimingAnimationConfig }[], loops: 0 };
  const idle = { start: () => undefined, stop: () => undefined, reset: () => undefined };
  vi.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    seen.timings.push({ value: value as Animated.Value, config });
    return idle;
  });
  vi.spyOn(Animated, 'loop').mockImplementation(() => ({
    ...idle,
    start: () => {
      seen.loops += 1;
    },
  }));
  return seen;
}

async function settle(): Promise<void> {
  await act(async () => undefined);
}

/** A device that has already said whether it wants motion, as it has by the time anything waits. */
async function device({ reduceMotion }: { reduceMotion: boolean }): Promise<void> {
  patchReactNativeWeb({ reduceMotion });
  renderWithProviders(<DeerLoader />).unmount();
  await settle();
}

beforeEach(() => device({ reduceMotion: false }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DeerLoader', () => {
  it('loops once a loop’s length on the native driver, and draws the shape the clock has reached', async () => {
    const seen = recordMotion();
    const { container } = renderWithProviders(<DeerLoader size={120} />);
    await settle();
    expect(seen.loops).toBe(1);
    const clock = seen.timings.find((t) => t.config.duration === DEER_LOOP_MS);
    expect(clock?.config).toMatchObject({ toValue: 1, useNativeDriver: true });
    const path = container.querySelector('path') as SVGPathElement;
    expect(path.getAttribute('d')).toBe(deerMarkPath());
    // Flowing out, then the spinner, and back at the start the deer again.
    for (const at of [FLOWING_AT, SPINNING_AT]) {
      act(() => clock?.value.setValue(at));
      expect(path.getAttribute('d')).toBe(deerFormPath(deerLoopAt(at)));
    }
    expect(path.getAttribute('d')).not.toBe(deerMarkPath());
    act(() => clock?.value.setValue(1));
    expect(path.getAttribute('d')).toBe(deerMarkPath());
    // Whole turns on, not turned back, so the next loop carries on from here.
    const view = container.querySelector('[data-testid="deer-loader"]') as HTMLElement;
    expect(view.style.transform).toContain(`rotate(${360 * DEER_LOOP_TURNS}deg)`);
  });

  it('turns by its transform alone, upright at the start', async () => {
    recordMotion();
    renderWithProviders(<DeerLoader size={48} />);
    await settle();
    const view = document.querySelector('[data-testid="deer-loader"]') as HTMLElement;
    expect(view.style.transform).toBe('rotate(0deg)');
  });

  it('is drawn as the small mark when too small for his eyes and three tines', async () => {
    recordMotion();
    const { container } = renderWithProviders(<DeerLoader size={24} />);
    await settle();
    expect(container.querySelector('path')?.getAttribute('d')).toBe(deerMarkPath({ small: true }));
  });

  it('only breathes in opacity under Reduce Motion', async () => {
    await device({ reduceMotion: true });
    const seen = recordMotion();
    const { container } = renderWithProviders(<DeerLoader />);
    await settle();
    expect(seen.loops).toBe(1);
    expect(seen.timings.map((t) => [t.config.toValue, t.config.duration])).toEqual([
      [DEER_BREATH_LOW, DEER_BREATH_MS / 2],
      [1, DEER_BREATH_MS / 2],
    ]);
    expect(seen.timings.some((t) => t.config.duration === DEER_LOOP_MS)).toBe(false);
    expect(container.querySelector('path')?.getAttribute('d')).toBe(deerMarkPath());
  });
});
