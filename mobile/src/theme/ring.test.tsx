// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
import { Animated } from 'react-native';
import { act, cleanup, render } from '@testing-library/react';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { useRing } from './animate';
import { RING_MS, RING_STEPS } from './motion';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Bell({ ring }: { ring: number }): null {
  useRing(ring);
  return null;
}

describe('a bell that swings when it is rung', () => {
  it('swings one way and the other, less each time, and comes to rest', () => {
    expect(RING_STEPS[0]).toBe(0);
    expect(RING_STEPS[RING_STEPS.length - 1]).toBe(0);
    const reach = RING_STEPS.slice(1, -1).map(Math.abs);
    expect(reach).toEqual([...reach].sort((a, b) => b - a));
    // Each swing goes to the other side of the one before.
    for (let i = 2; i < RING_STEPS.length - 1; i++) expect(Math.sign(RING_STEPS[i]!)).toBe(-Math.sign(RING_STEPS[i - 1]!));
    expect(RING_MS).toBeLessThanOrEqual(600);
  });

  // What was waiting when the bell first rendered is not news, nor is a count going down.
  it('is still as it is first drawn, and when what is waiting goes down', () => {
    patchReactNativeWeb();
    const swing = vi.spyOn(Animated, 'sequence');
    const view = render(<Bell ring={3} />);
    expect(swing).not.toHaveBeenCalled();
    view.rerender(<Bell ring={1} />);
    expect(swing).not.toHaveBeenCalled();
    view.rerender(<Bell ring={1} />);
    expect(swing).not.toHaveBeenCalled();
  });

  it('swings once each time something more arrives', () => {
    patchReactNativeWeb();
    const swing = vi.spyOn(Animated, 'sequence');
    const view = render(<Bell ring={0} />);
    view.rerender(<Bell ring={1} />);
    expect(swing).toHaveBeenCalledTimes(1);
    view.rerender(<Bell ring={2} />);
    expect(swing).toHaveBeenCalledTimes(2);
  });

  it('does not move for somebody who has asked for less motion', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    const swing = vi.spyOn(Animated, 'sequence');
    const view = render(<Bell ring={0} />);
    // The setting is requested and answers a moment after the first frame.
    await act(async () => {});
    view.rerender(<Bell ring={1} />);
    expect(swing).not.toHaveBeenCalled();
  });
});
