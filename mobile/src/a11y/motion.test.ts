import { describe, expect, it } from 'vitest';
import {
  GLOBE_BREATH,
  resolveMotion,
  SELECT_HIGHLIGHT,
  WELCOME_ROTATE,
  type MotionSpec,
} from './motion';

const breath: MotionSpec = { durationMs: 1000, delayMs: 100, iterations: Infinity };

describe('resolveMotion', () => {
  it('passes timing through when motion is allowed', () => {
    expect(resolveMotion(breath, false)).toEqual({
      durationMs: 1000,
      delayMs: 100,
      iterations: Infinity,
      animate: true,
    });
  });

  it('defaults delay to 0 and iterations to 1', () => {
    expect(resolveMotion({ durationMs: 300 }, false)).toEqual({
      durationMs: 300,
      delayMs: 0,
      iterations: 1,
      animate: true,
    });
  });

  it('drops the animation entirely when motion is reduced', () => {
    expect(resolveMotion(breath, true)).toEqual({
      durationMs: 0,
      delayMs: 0,
      iterations: 1,
      animate: false,
    });
  });

  it('never returns a shortened-but-still-moving animation when reduced', () => {
    const resolved = resolveMotion({ durationMs: 5000, iterations: Infinity }, true);
    expect(resolved.animate).toBe(false);
    expect(resolved.durationMs).toBe(0);
    expect(resolved.iterations).toBe(1);
  });

  it('reports nothing to animate for a zero-duration spec', () => {
    expect(resolveMotion({ durationMs: 0 }, false).animate).toBe(false);
  });
});

describe('shared motion specs', () => {
  it('the globe breathes on an endless loop', () => {
    expect(GLOBE_BREATH.iterations).toBe(Infinity);
    expect(GLOBE_BREATH.durationMs).toBeGreaterThan(0);
  });

  it('the welcome subtitle dwells before rotating', () => {
    expect(WELCOME_ROTATE.delayMs).toBeGreaterThan(WELCOME_ROTATE.durationMs);
    expect(WELCOME_ROTATE.iterations).toBe(Infinity);
  });

  it('the selection highlight plays once', () => {
    expect(SELECT_HIGHLIGHT.iterations).toBe(1);
  });

  it('every shared spec falls back to a static resting state under reduce-motion', () => {
    for (const spec of [GLOBE_BREATH, WELCOME_ROTATE, SELECT_HIGHLIGHT]) {
      expect(resolveMotion(spec, true).animate).toBe(false);
    }
  });
});
