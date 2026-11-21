// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { PEEK_LEAN, PEEK_PLACE, mapPath } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { HevaloPeek } from './HevaloPeek';

// The phone's tilt reaches the web build as the browser's orientation; the phone app reads the same tilt from its sensor.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Tilts the phone: held upright (`beta` 90) and turned like a wheel by `deg`, or `deg` the other way for a negative one. */
function tilt(deg: number): void {
  const event = new Event('deviceorientation') as Event & { beta: number; gamma: number };
  // Held a little back from upright, so the turn shows in `gamma`.
  Object.assign(event, { beta: 30, gamma: deg / Math.cos((30 * Math.PI) / 180) });
  act(() => {
    window.dispatchEvent(event);
  });
}

/** Lets the Reduce Motion setting, read just after he appears, arrive. */
const settle = (): Promise<void> => act(() => new Promise<void>((r) => setTimeout(r, 50)));

/** The angle a layer is turned by, from its inline transform. */
function turnOf(testId: string): number {
  const transform = screen.getByTestId(testId).style.transform;
  const match = /rotate\((-?[\d.e-]+)deg\)/.exec(transform);
  return match ? Number(match[1]) : 0;
}

describe('Hevalo coming through the page', () => {
  // Tests run the animations to their end at once, so these check where each part grows and turns from, and where it rests.
  it('bursts the tear open from its middle and brings him to rest at full size, his shadow at the foot of its fall', () => {
    patchReactNativeWeb();
    renderWithProviders(<HevaloPeek size={240} />);
    const at = ({ x, y }: { x: number; y: number }): string => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`;
    for (const id of ['hevalo-peek-back', 'hevalo-peek-front']) {
      expect(screen.getByTestId(id).style.transformOrigin).toBe(at(PEEK_PLACE.tear));
      expect(screen.getByTestId(id).style.transform).toBe('scale(1)');
    }
    const him = screen.getByTestId('hevalo-peek-figure');
    expect(him.style.transformOrigin).toBe(at(PEEK_PLACE.pivot));
    expect(him.style.transform).toBe('rotate(0deg) scale(1)');
    expect(Number(him.style.opacity)).toBe(1);
    const cast = screen.getByTestId('hevalo-peek-cast');
    expect(cast.style.transformOrigin).toBe(at(PEEK_PLACE.castPivot));
    expect(cast.style.transform).toBe('translateY(0px) rotate(0deg)');
    expect(screen.getByTestId('hevalo-peek-cast-ears').style.transformOrigin).toBe(at(PEEK_PLACE.earsPivot));
  });

  it('is simply there under Reduce Motion', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    renderWithProviders(<HevaloPeek size={240} />);
    await waitFor(() => expect(Number(screen.getByTestId('hevalo-peek-figure').style.opacity)).toBe(1));
    expect(screen.getByTestId('hevalo-peek-back').style.transform).toMatch(/scale\(1\)/);
  });
});

describe('Hevalo leaning with the phone', () => {
  it('leans to the right when the phone tilts right and to the left when it tilts left, his shadows swinging with him', async () => {
    patchReactNativeWeb();
    renderWithProviders(<HevaloPeek size={240} pop={false} />);
    await settle();
    tilt(24);
    await waitFor(() => expect(turnOf('hevalo-peek-figure')).toBeGreaterThan(5), { timeout: 3000 });
    expect(turnOf('hevalo-peek-figure')).toBeLessThanOrEqual(PEEK_LEAN.maxDeg * 1.1);
    expect(turnOf('hevalo-peek-cast')).toBeCloseTo(turnOf('hevalo-peek-figure'));
    expect(turnOf('hevalo-peek-cast-ears')).toBeCloseTo(turnOf('hevalo-peek-figure'));
    tilt(-24);
    await waitFor(() => expect(turnOf('hevalo-peek-figure')).toBeLessThan(-5), { timeout: 3000 });
  });

  it('stays upright for a hand that is only nearly level', async () => {
    patchReactNativeWeb();
    renderWithProviders(<HevaloPeek size={240} pop={false} />);
    await settle();
    tilt(PEEK_LEAN.deadDeg * 0.8);
    await new Promise((r) => setTimeout(r, 300));
    expect(turnOf('hevalo-peek-figure')).toBe(0);
  });

  it('stands still under Reduce Motion, and is not left reading the tilt then', async () => {
    const turns = (spy: { mock: { calls: unknown[][] } }): number => spy.mock.calls.filter(([type]) => type === 'deviceorientation').length;
    patchReactNativeWeb({ reduceMotion: true });
    const listen = vi.spyOn(window, 'addEventListener');
    const stop = vi.spyOn(window, 'removeEventListener');
    renderWithProviders(<HevaloPeek size={240} pop={false} />);
    await settle();
    tilt(30);
    await new Promise((r) => setTimeout(r, 300));
    expect(turnOf('hevalo-peek-figure')).toBe(0);
    expect(turns(listen)).toBe(turns(stop));
  });

  it('leans as a still picture too, which has no other life', async () => {
    patchReactNativeWeb();
    renderWithProviders(<HevaloPeek size={240} pop={false} still />);
    await settle();
    tilt(-24);
    await waitFor(() => expect(turnOf('hevalo-peek-figure')).toBeLessThan(-5), { timeout: 3000 });
  });

  it('stops reading the tilt once he is gone', async () => {
    patchReactNativeWeb();
    const stop = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderWithProviders(<HevaloPeek size={240} pop={false} />);
    await settle();
    tilt(20);
    await waitFor(() => expect(turnOf('hevalo-peek-figure')).toBeGreaterThan(3), { timeout: 3000 });
    unmount();
    expect(stop.mock.calls.filter(([type]) => type === 'deviceorientation')).toHaveLength(1);
  });
});

/** Swings the phone round its upright line at `rate` degrees a second (its right side going back above 0), `times` readings 40 ms apart. */
async function swing(rate: number, times = 12): Promise<void> {
  for (let i = 0; i < times; i++) {
    act(() => {
      window.dispatchEvent(Object.assign(new Event('devicemotion'), { rotationRate: { alpha: 0, beta: 0, gamma: rate } }));
    });
    await act(() => new Promise<void>((r) => setTimeout(r, 40)));
  }
}

/** How far across his nose is seen, in his own units (the middle of his face is 255): its outline's points where its piece puts them. */
function noseX(): number {
  const markup = document.querySelector('svg[data-markup*=\'id="id-nose"\']')?.getAttribute('data-markup') ?? '';
  // Each shape of a turned head sits in its piece's `matrix(wide 0 0 tall x y)`; facing us, it is drawn as it is.
  const pieces = [...markup.matchAll(/<g transform="matrix\(([^)]+)\)">(.*?)<\/g>/g)];
  const placed = pieces.length > 0 ? pieces.map((m) => ({ by: m[1]!.split(' ').map(Number), inner: m[2]! })) : [{ by: [1, 0, 0, 1, 0, 0], inner: markup }];
  const xs = placed.flatMap(({ by, inner }) =>
    [...inner.matchAll(/ d="([^"]+)"/g)].flatMap((m) =>
      (mapPath(m[1]!, (x, y) => [x, y]).match(/-?[\d.]+,-?[\d.]+/g) ?? []).map((pair) => by[0]! * Number(pair.split(',')[0]) + by[4]!),
    ),
  );
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

describe('Hevalo turning his head as the phone swings round or tilts', () => {
  it('draws his head turned toward the side the phone swings back on, faces us again as it swings back, and turns the other way past it', async () => {
    patchReactNativeWeb();
    renderWithProviders(<HevaloPeek size={240} pop={false} />);
    await settle();
    expect(noseX()).toBeCloseTo(255, 0);
    // A quarter-second swing of 24 degrees, its right side going back.
    await swing(60, 10);
    await waitFor(() => expect(noseX()).toBeGreaterThan(275), { timeout: 3000 });
    await swing(-60, 10);
    await waitFor(() => expect(Math.abs(noseX() - 255)).toBeLessThan(4), { timeout: 3000 });
    await swing(-60, 10);
    await waitFor(() => expect(noseX()).toBeLessThan(235), { timeout: 3000 });
  }, 15000);

  it('turns his head toward the side the phone tilts down on, as well as leaning him', async () => {
    patchReactNativeWeb();
    renderWithProviders(<HevaloPeek size={240} pop={false} />);
    await settle();
    tilt(16);
    await waitFor(() => expect(noseX()).toBeGreaterThan(270), { timeout: 3000 });
    await waitFor(() => expect(turnOf('hevalo-peek-figure')).toBeGreaterThan(3), { timeout: 3000 });
    tilt(-16);
    await waitFor(() => expect(noseX()).toBeLessThan(240), { timeout: 3000 });
  });

  it('turns as a still picture too, and the same way on screen when mirrored', async () => {
    patchReactNativeWeb();
    renderWithProviders(<HevaloPeek size={240} pop={false} still flip />);
    await settle();
    await swing(60, 10);
    // Mirrored, the drawing turns the other way so that on screen he turns toward the same side.
    await waitFor(() => expect(noseX()).toBeLessThan(235), { timeout: 3000 });
  });
});
