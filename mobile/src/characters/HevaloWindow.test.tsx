// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', async () => {
  const { createElement } = await import('react');
  return {
    SvgXml: ({ xml, width, height }: { xml: string; width: number; height: number }) => createElement('svg', { width, height, 'data-markup': xml }),
  };
});
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
// the springs his head rises on, held where they start: a test's animations otherwise end as they begin
const springs = vi.hoisted(() => ({ asked: [] as { to: number; kind: string; delay: number }[] }));
vi.mock('../theme/animate', async (original) => ({
  ...(await original<typeof import('../theme/animate')>()),
  springTo: (_value: unknown, to: number, kind = 'standard', delay = 0) => {
    springs.asked.push({ to, kind, delay });
    return { start: () => undefined, stop: () => undefined, reset: () => undefined };
  },
}));

import { act, cleanup, screen } from '@testing-library/react';
import { WINDOW_PLACE, WINDOW_POP, WINDOW_VIEW, windowArt } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { characterLayers } from './layers';
import { HevaloWindow } from './HevaloWindow';

/*
 * Hevalo leaning out of his window: the window behind him, his head and neck
 * cut off at the sill, the sill in front; his head popping up as it appears
 * (simply there under Reduce Motion); his reactions as ever; and the whole of
 * it mirrored for a language read from the right.
 */

const NECK = characterLayers('hevalo', 'head');
// the test's screen is dark, as the app is unless asked otherwise: the window at dusk
const DUSK = windowArt({ dark: true });

beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  springs.asked = [];
});
afterEach(() => {
  cleanup();
});

async function settle(): Promise<void> {
  await act(async () => undefined);
}

/** the element a drawing was drawn as */
const drawing = (markup: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>('svg[data-markup]')].find((el) => el.getAttribute('data-markup') === markup);

/** how far down his head is from its place, in points */
const lowered = (): number => Number(/translateY\((-?[\d.e-]+)px\)/.exec(screen.getByTestId('hevalo-window-figure').style.transform)?.[1] ?? 0);

/** a device that has said whether it wants motion, known from a window's first frame */
async function device({ reduceMotion }: { reduceMotion: boolean }): Promise<void> {
  patchReactNativeWeb({ reduceMotion });
  renderWithProviders(<HevaloWindow size={200} pop={false} />).unmount();
  await settle();
  springs.asked = [];
}

/** whether an element, or one it is in, short of `top`, is turned round */
function turned(el: Element | null | undefined, top: Element): boolean {
  for (let at = el; at && at !== top; at = at.parentElement) if (getComputedStyle(at).transform.includes('scaleX(-1)')) return true;
  return false;
}

describe('HevaloWindow', () => {
  it('draws his head and neck between the window behind him and the sill in front, as wide as the window is for its height', async () => {
    renderWithProviders(<HevaloWindow size={200} />);
    await settle();
    const back = drawing(DUSK.back)!;
    const front = drawing(DUSK.front)!;
    const body = drawing(NECK.body)!;
    // his head and neck, never the whole figure
    expect(body).toBeTruthy();
    expect(drawing(characterLayers('hevalo', 'full').body)).toBeUndefined();
    // behind him, him, then in front of him
    const order = [...document.querySelectorAll('svg[data-markup]')];
    expect(order.indexOf(back)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(back)).toBeLessThan(order.indexOf(body));
    expect(order.indexOf(body)).toBeLessThan(order.indexOf(front));
    expect(Number(back.getAttribute('width'))).toBeCloseTo((200 * WINDOW_VIEW.w) / WINDOW_VIEW.h);
    expect(Number(body.getAttribute('width'))).toBeCloseTo(WINDOW_PLACE.figure.width * Number(back.getAttribute('width')));
    // a picture beside words that say it all: nothing for a screen reader
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('pops his head up from under the sill on a spring as it appears', async () => {
    await device({ reduceMotion: false });
    renderWithProviders(<HevaloWindow size={200} />);
    await settle();
    // waiting all under the sill, the top of his antlers at it, to rise to his place
    expect(lowered()).toBeCloseTo(WINDOW_PLACE.drop * 200);
    expect(springs.asked).toEqual([{ to: 0, kind: 'bouncy', delay: WINDOW_POP.delayMs }]);
  });

  it('has him simply there under Reduce Motion, and when asked not to pop', async () => {
    await device({ reduceMotion: true });
    renderWithProviders(<HevaloWindow size={200} />);
    await settle();
    expect(lowered()).toBe(0);
    expect(springs.asked).toEqual([]);
    cleanup();
    await device({ reduceMotion: false });
    renderWithProviders(<HevaloWindow size={200} pop={false} />);
    await settle();
    expect(lowered()).toBe(0);
    expect(springs.asked).toEqual([]);
  });

  it('reacts as he always does: a cheer smiles, even with motion turned down', async () => {
    renderWithProviders(<HevaloWindow size={200} reaction="cheer" />);
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(drawing(NECK.eyes.happy)).toBeTruthy();
  });

  it('turns round for a language read from the right, the window mirrored with him', async () => {
    renderWithProviders(<HevaloWindow size={160} flip />);
    await settle();
    const framed = screen.getByTestId('hevalo-window');
    for (const layer of [DUSK.back, DUSK.front]) expect(turned(drawing(layer), framed)).toBe(true);
    // and he faces the other way in it
    expect(turned(drawing(NECK.body), screen.getByTestId('hevalo-window-figure'))).toBe(true);
    cleanup();
    renderWithProviders(<HevaloWindow size={160} />);
    await settle();
    expect(turned(drawing(DUSK.back), screen.getByTestId('hevalo-window'))).toBe(false);
    expect(turned(drawing(NECK.body), screen.getByTestId('hevalo-window'))).toBe(false);
  });
});
