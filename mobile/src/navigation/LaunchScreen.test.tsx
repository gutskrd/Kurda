// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
/*
 * The springs and timings things arrive on, held where they start: under
 * test every animation otherwise ends the moment it begins, and the first
 * frame — the whole point of the launch — would never be seen.
 */
const asked = vi.hoisted(() => ({
  springs: [] as { to: number; kind: string; delay: number }[],
  timings: [] as { to: number; ms: number; delay: number }[],
}));
vi.mock('../theme/animate', async (original) => ({
  ...(await original<typeof import('../theme/animate')>()),
  springTo: (_value: unknown, to: number, kind = 'standard', delay = 0) => {
    asked.springs.push({ to, kind, delay });
    return { start: () => undefined, stop: () => undefined, reset: () => undefined };
  },
  timing: (_value: unknown, to: number, ms: number, opts: { delay?: number } = {}) => {
    asked.timings.push({ to, ms, delay: opts.delay ?? 0 });
    return { start: () => undefined, stop: () => undefined, reset: () => undefined };
  },
}));

import { act, cleanup, screen } from '@testing-library/react';
import { Animated, Text } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { characterLayers } from '../characters/layers';
import { duration } from '../theme/motion';
import { DARK, LIGHT } from '../theme/palette';
import config from '../../app.json';
import { Entrance, LaunchScreen } from './LaunchScreen';
import { LAUNCH, SPLASH_BACKGROUND, SPLASH_DEER, SPLASH_IMAGE_WIDTH, heroPlace } from './launch/splash';

/*
 * The first thing anybody sees of the app: it opens on what the native splash
 * showed — the flat colour, the picture's deer in its box in the middle —
 * and comes alive from there, Hevalo arriving on a spring where the picture
 * was and the words rising under him, with a light drifting across the page;
 * all of it still for somebody who has asked for less motion. And the native
 * splash in app.json is set to the same colours, light and dark.
 */

beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: false });
  asked.springs = [];
  asked.timings = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  await act(async () => undefined);
}

/** a device that has said whether it wants motion, known from the launch's first frame */
async function device({ reduceMotion }: { reduceMotion: boolean }): Promise<void> {
  patchReactNativeWeb({ reduceMotion });
  renderWithProviders(<LaunchScreen />).unmount();
  await settle();
  asked.springs = [];
  asked.timings = [];
}

/** How many loops were started: the drifting light is the only thing on the page that loops. */
function loops(): { started: number } {
  const seen = { started: 0 };
  const real = Animated.loop;
  vi.spyOn(Animated, 'loop').mockImplementation((animation, config) => {
    const loop = real(animation, config);
    return {
      ...loop,
      start: (cb) => {
        seen.started += 1;
        loop.start(cb);
      },
    };
  });
  return seen;
}

/** a colour as the browser says it back */
const rgb = (hex: string): string => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
/** how much of an element shows; one when nothing says otherwise */
const shown = (el: Element): number => Number(getComputedStyle(el).opacity || 1);

describe('LaunchScreen', () => {
  it('opens on the splash: its colour under everything, the picture’s deer whole in its box, the gradient not yet come in', async () => {
    renderWithProviders(<LaunchScreen />);
    await settle();
    // the screen is dark unless asked otherwise, so the splash's dark colour
    expect(getComputedStyle(screen.getByTestId('launch-first-frame')).backgroundColor).toBe(rgb(SPLASH_BACKGROUND.dark));
    const picture = screen.getByTestId('launch-picture');
    expect(shown(picture)).toBe(1);
    // the picture is as wide as the splash drew it, not as wide as the file is
    expect(getComputedStyle(picture).width).toBe(`${SPLASH_IMAGE_WIDTH}px`);
    expect(getComputedStyle(picture.parentElement as HTMLElement).width).toBe(`${SPLASH_IMAGE_WIDTH}px`);
    expect(shown(screen.getByTestId('launch-ground'))).toBe(0);
    expect(screen.getByText('Hevalo')).toBeTruthy();
    expect(screen.getByText('Jiyan bi kurdî xweştire')).toBeTruthy();
    // then the gradient comes in over the colour and the picture gives way, each in its own time
    expect(asked.timings).toContainEqual({ to: 1, ms: duration.slow + 180, delay: LAUNCH.groundMs });
    expect(asked.timings).toContainEqual({ to: 0, ms: LAUNCH.pictureMs, delay: LAUNCH.heroMs });
  });

  it('brings Hevalo in on a spring where the picture’s deer was, and the words after him on the standard one', async () => {
    await device({ reduceMotion: false });
    renderWithProviders(<LaunchScreen />);
    await settle();
    expect(asked.springs).toEqual([
      { to: 1, kind: 'bouncy', delay: LAUNCH.heroMs },
      { to: 1, kind: 'standard', delay: LAUNCH.wordsMs },
    ]);
    // waiting to arrive: not there yet, and small
    const hero = screen.getByTestId('launch-hero');
    expect(shown(hero)).toBe(0);
    expect(hero.style.transform).toContain('scale(0.6)');
    // drawn as the picture's deer: as wide, with his eyes on its eyes
    const layers = characterLayers('hevalo', 'half');
    const place = heroPlace(SPLASH_IMAGE_WIDTH, layers.frame, layers.eyesAt);
    expect(hero.style.width).toBe(`${place.width}px`);
    expect(hero.style.left).toBe(`${place.left}px`);
    expect(hero.style.top).toBe(`${place.top}px`);
  });

  it('has a light drifting across the page, which is the one thing that loops', async () => {
    await device({ reduceMotion: false });
    const seen = loops();
    renderWithProviders(<LaunchScreen />);
    await settle();
    expect(screen.getByTestId('launch-wash')).toBeTruthy();
    expect(seen.started).toBeGreaterThanOrEqual(1);
  });

  it('is still under Reduce Motion: no light, no loop, no spring, and Hevalo and the words simply fading in', async () => {
    await device({ reduceMotion: true });
    const seen = loops();
    renderWithProviders(<LaunchScreen />);
    await settle();
    expect(screen.queryByTestId('launch-wash')).toBeNull();
    expect(seen.started).toBe(0);
    expect(asked.springs).toEqual([]);
    expect(asked.timings).toContainEqual({ to: 1, ms: duration.slow, delay: LAUNCH.heroMs });
    expect(asked.timings).toContainEqual({ to: 1, ms: duration.slow, delay: LAUNCH.wordsMs });
    expect(screen.getByTestId('launch-hero').style.transform).toBe('');
  });
});

describe('where Hevalo is drawn in the picture’s box', () => {
  it('puts his eyes on the picture’s eyes, as wide as the picture’s deer', () => {
    // a drawing twice as tall as wide, its eyes a quarter of the way down, in a box 100 wide
    const place = heroPlace(100, { w: 1, h: 2 }, { x: 0.5, y: 0.25 });
    expect(place.width).toBeCloseTo(100 * SPLASH_DEER.width);
    expect(place.height).toBeCloseTo(place.width * 2);
    expect(place.left + 0.5 * place.width).toBeCloseTo(50);
    expect(place.top + 0.25 * place.height).toBeCloseTo(100 * SPLASH_DEER.eyes);
  });
});

describe('Entrance', () => {
  it('settles the next screen in on the standard spring, over the launch’s own colour', async () => {
    await device({ reduceMotion: false });
    renderWithProviders(
      <Entrance>
        <Text>next</Text>
      </Entrance>,
    );
    await settle();
    expect(asked.springs).toEqual([{ to: 1, kind: 'standard', delay: 0 }]);
    // nothing of the window underneath shows through while the screen is still faint
    expect(getComputedStyle(screen.getByTestId('entrance-ground')).backgroundColor).toBe(rgb(SPLASH_BACKGROUND.dark));
  });

  it('has it simply there under Reduce Motion', async () => {
    await device({ reduceMotion: true });
    renderWithProviders(
      <Entrance>
        <Text>next</Text>
      </Entrance>,
    );
    await settle();
    expect(asked.springs).toEqual([]);
    expect(screen.getByText('next')).toBeTruthy();
  });
});

describe('the native splash', () => {
  it('is the first stop of the page’s gradient, light and dark, so the gradient can come in over it', () => {
    expect(SPLASH_BACKGROUND).toEqual({ light: LIGHT.gradient[0], dark: DARK.gradient[0] });
  });

  it('is set to the launch screen’s colours in app.json, on both platforms, with the same picture', () => {
    const { splash, ios, android } = config.expo;
    for (const light of [splash, ios.splash, android.splash]) expect(light.backgroundColor).toBe(SPLASH_BACKGROUND.light);
    for (const dark of [ios.splash.dark, android.splash.dark]) expect(dark.backgroundColor).toBe(SPLASH_BACKGROUND.dark);
    for (const each of [splash, ios.splash, android.splash, ios.splash.dark, android.splash.dark]) expect(each.image).toBe(splash.image);
  });
});
