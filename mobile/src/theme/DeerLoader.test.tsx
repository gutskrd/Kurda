// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Animated } from 'react-native';
import { DEER_BREATH_LOW, DEER_BREATH_MS, DEER_LOOP_MS, deerCurlPath, deerMarkPath } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { DeerLoader } from './DeerLoader';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));

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
  it('loops once a loop’s length on the native driver, and draws the curl the clock has reached', async () => {
    const seen = recordMotion();
    const { container } = renderWithProviders(<DeerLoader size={120} />);
    await settle();
    expect(seen.loops).toBe(1);
    const clock = seen.timings.find((t) => t.config.duration === DEER_LOOP_MS);
    expect(clock?.config).toMatchObject({ toValue: 1, useNativeDriver: true });
    const path = container.querySelector('path') as SVGPathElement;
    expect(path.getAttribute('d')).toBe(deerMarkPath());
    // Halfway round he is the ball, and back at the start the deer again.
    act(() => clock?.value.setValue(0.5));
    expect(path.getAttribute('d')).toBe(deerCurlPath(1));
    act(() => clock?.value.setValue(1));
    expect(path.getAttribute('d')).toBe(deerMarkPath());
    // A whole turn on, not turned back, so the next loop carries on from here.
    const view = container.querySelector('[data-testid="deer-loader"]') as HTMLElement;
    expect(view.style.transform).toContain('rotate(360deg)');
  });

  it('turns, squashes and drops by transforms alone, upright at the start', async () => {
    recordMotion();
    renderWithProviders(<DeerLoader size={48} />);
    await settle();
    const view = document.querySelector('[data-testid="deer-loader"]') as HTMLElement;
    expect(view.style.transform).toContain('rotate(0deg)');
    expect(view.style.transform).toContain('scaleY(1)');
  });

  it('leaves his eyes out when drawn too small for them', async () => {
    recordMotion();
    const { container } = renderWithProviders(<DeerLoader size={24} />);
    await settle();
    expect(container.querySelector('path')?.getAttribute('d')).toBe(deerMarkPath({ eyes: false }));
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
