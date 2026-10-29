// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { act, cleanup, screen } from '@testing-library/react';
import { Animated } from 'react-native';
import { FIRE_BASE, FIRE_SMALL, FIRE_SMALL_VIEW, FIRE_TONGUES, FIRE_WISPS } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { Fire } from './Fire';

/*
 * The streak's fire on the phone: the whole campfire burning off one clock,
 * the light version beside a number, grey and still unlit, and standing
 * still under Reduce Motion with no clock running at all — hidden from
 * VoiceOver every time, the words beside it say the streak.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Every clock started, and whether it has been stopped. */
function clocks(): { started: number; stopped: number } {
  const seen = { started: 0, stopped: 0 };
  const real = Animated.loop;
  vi.spyOn(Animated, 'loop').mockImplementation((animation, config) => {
    const loop = real(animation, config);
    return {
      ...loop,
      start: (cb) => {
        seen.started += 1;
        loop.start(cb);
      },
      stop: () => {
        seen.stopped += 1;
        loop.stop();
      },
    };
  });
  return seen;
}

/** Let the Reduce Motion answer arrive. */
const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));

describe('the fire', () => {
  it('burns big off one clock, stopped when it is gone: every tongue, the broken-off tips, the glow and the logs', async () => {
    patchReactNativeWeb({ reduceMotion: false });
    const seen = clocks();
    const { unmount } = renderWithProviders(<Fire size={168} />);
    await settle();
    const fire = screen.getByTestId('fire-lit');
    expect(fire.getAttribute('aria-hidden')).toBe('true');
    expect(fire.style.height).toBe('168px');
    expect(fire.querySelectorAll('path')).toHaveLength(FIRE_TONGUES.length + FIRE_WISPS.length + FIRE_BASE.length);
    expect(fire.querySelectorAll('radialGradient')).toHaveLength(1);
    expect(seen).toEqual({ started: 1, stopped: 0 });
    unmount();
    expect(seen.stopped).toBe(1);
  });

  it('is the light version at the small size: three tongues cropped round the flame, gentler, nothing around it', async () => {
    patchReactNativeWeb({ reduceMotion: false });
    renderWithProviders(<Fire size={FIRE_SMALL} />);
    await settle();
    const fire = screen.getByTestId('fire-lit-small');
    expect(fire.querySelectorAll('path')).toHaveLength(FIRE_TONGUES.filter((t) => t.small).length);
    expect(fire.querySelectorAll('radialGradient')).toHaveLength(0);
    expect(fire.querySelector('svg')!.getAttribute('viewBox')).toBe(`${FIRE_SMALL_VIEW.x} ${FIRE_SMALL_VIEW.y} ${FIRE_SMALL_VIEW.w} ${FIRE_SMALL_VIEW.h}`);
  });

  it('is grey and still unlit: no clock, no glow, nothing rising', async () => {
    patchReactNativeWeb({ reduceMotion: false });
    const seen = clocks();
    renderWithProviders(<Fire size={168} lit={false} />);
    await settle();
    const fire = screen.getByTestId('fire-unlit');
    expect(fire.querySelectorAll('path')).toHaveLength(FIRE_TONGUES.length + FIRE_BASE.length);
    expect(fire.querySelectorAll('radialGradient')).toHaveLength(0);
    const colours = [...fire.querySelectorAll('stop')].map((s) => s.getAttribute('stop-color')!);
    expect(colours.length).toBeGreaterThan(FIRE_TONGUES.length * 2);
    // every colour a grey: no channel far from the others
    for (const c of colours) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThan(40);
    }
    expect(seen.started).toBe(0);
  });

  it('stands still under Reduce Motion: burning, but no clock runs and nothing rises', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    // the setting is asked once; a fire after the answer starts from it
    renderWithProviders(<Fire size={40} />);
    await settle();
    cleanup();
    const seen = clocks();
    renderWithProviders(<Fire size={168} />);
    await settle();
    const fire = screen.getByTestId('fire-lit');
    expect(fire.querySelectorAll('path')).toHaveLength(FIRE_TONGUES.length + FIRE_BASE.length);
    expect(seen.started).toBe(0);
  });
});
