// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { act, cleanup, screen } from '@testing-library/react';
import { Animated } from 'react-native';
import { FIRE_GROW, FIRE_SMALL, FIRE_SMALL_VIEW, FIRE_STAGES, FIRE_VIEW, fireDrawing, fireFrame, type FireLevel, type FireStage } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { Fire } from './Fire';

/*
 * The streak's fire on the phone: every stage burning off one clock, its
 * painted flame stepping through its sheet on that clock, the light version
 * beside a number, a cold hearth with no streak, growing into its new stage
 * off one more value on the day it grew, and standing still (one frame)
 * under Reduce Motion or when asked, with no clock running at all — hidden
 * from VoiceOver every time, the words beside it say the streak.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const lvl = (stage: FireStage, growth = 0): FireLevel => ({ stage, growth });

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

/** Every growth run started (its timing), with a way to see it through to its end. */
function growths(): { config: Animated.TimingAnimationConfig; finish: () => void }[] {
  const runs: { config: Animated.TimingAnimationConfig; finish: () => void }[] = [];
  const real = Animated.timing;
  vi.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    const timing = real(value, config);
    // the fire's clock runs for a whole cycle with no delay; a growth waits first
    if (config.delay === undefined) return timing;
    return {
      ...timing,
      start: (cb) => {
        runs.push({ config, finish: () => cb?.({ finished: true }) });
      },
    };
  });
  return runs;
}

/** Let the Reduce Motion answer arrive. */
const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));

/** The tongues drawn, by the gradient each is filled with. */
const tongues = (el: Element): string[] =>
  [...el.querySelectorAll('path')].map((p) => /a(back|left|right|outer|flame|core|heart)\)$/.exec(p.getAttribute('fill') ?? '')?.[1]).filter((t): t is string => !!t);
/** The painted flames shown, by the stage whose sheet each plays, oldest first. */
const flames = (el: Element): string[] => [...el.querySelectorAll('[data-testid^="fire-flame-"]')].map((f) => f.getAttribute('data-testid')!.slice('fire-flame-'.length));
/** Whether a painted flame is stepping through its sheet: moved by the clock, rather than held at its first frame. */
const stepping = (el: Element, stage: string): boolean => (el.querySelector<HTMLElement>(`[data-testid="fire-flame-${stage}"]`)?.style.transform ?? '') !== '';

describe('the fire', () => {
  it('burns at every stage off one clock, stopped when it is gone, each with the parts it promises and its painted flame stepping on that clock', async () => {
    patchReactNativeWeb({ reduceMotion: false });
    for (const stage of FIRE_STAGES.filter((s) => s !== 'cold')) {
      const seen = clocks();
      const drawing = fireDrawing(lvl(stage), 168);
      const { unmount } = renderWithProviders(<Fire size={168} level={lvl(stage)} />);
      await settle();
      const fire = screen.getByTestId('fire-lit');
      expect(fire.getAttribute('aria-hidden')).toBe('true');
      expect(fire.style.height).toBe('168px');
      expect(tongues(fire), stage).toEqual([]);
      expect(flames(fire), stage).toEqual([stage]);
      expect(fire.querySelector(`[data-testid="fire-flame-${stage}"]`)!.outerHTML, stage).toContain(`${stage}.webp`);
      expect(stepping(fire, stage), stage).toBe(true);
      // the window onto the sheet is the flame's own box, the sheet behind it its frames laid out
      const window = fire.querySelector<HTMLElement>(`[data-testid="fire-flame-${stage}"]`)!.parentElement!;
      expect(parseFloat(window.style.height), stage).toBeCloseTo((drawing.painted!.box.h * 168) / FIRE_VIEW.h, 3);
      expect([window.style.overflowX, window.style.overflowY], stage).toEqual(['hidden', 'hidden']);
      const { sheet, box } = drawing.painted!;
      const sheetWide = parseFloat(fire.querySelector<HTMLElement>(`[data-testid="fire-flame-${stage}"]`)!.style.width);
      expect(sheetWide, stage).toBeCloseTo(((sheet.sheet.w * box.w) / sheet.frame.w) * (168 / FIRE_VIEW.h), 3);
      expect(fire.querySelector('path[fill$="rays)"]') !== null, stage).toBe(stage === 'newroz');
      expect(fire.querySelector('path[fill$="stone)"]') !== null, stage).toBe(stage === 'blaze' || stage === 'newroz');
      // its glow round it, and the same light pooled on the ground
      expect(fire.querySelectorAll('ellipse'), stage).toHaveLength(2);
      expect(seen, stage).toEqual({ started: 1, stopped: 0 });
      unmount();
      expect(seen.stopped, stage).toBe(1);
      vi.restoreAllMocks();
    }
  });

  it('is a cold hearth with no streak: charred logs, an ember and its smoke moving off the clock, and no flame', async () => {
    patchReactNativeWeb({ reduceMotion: false });
    const seen = clocks();
    renderWithProviders(<Fire size={168} level={lvl('cold')} />);
    await settle();
    const fire = screen.getByTestId('fire-unlit');
    expect([tongues(fire), flames(fire)]).toEqual([[], []]);
    expect(fire.querySelectorAll('path[fill$="char)"]').length).toBeGreaterThan(0);
    expect(fire.querySelectorAll('circle[fill$="cinder)"]')).toHaveLength(1);
    expect(fire.querySelectorAll('linearGradient[id$="d0"], linearGradient[id$="d1"]')).toHaveLength(2);
    // no glow, nothing lit on the ground
    expect(fire.querySelectorAll('ellipse')).toHaveLength(0);
    expect(seen.started).toBe(1);
  });

  it('is the light version at the small size, in the same box at every stage, the grey flame of no streak standing still', async () => {
    patchReactNativeWeb({ reduceMotion: false });
    for (const stage of FIRE_STAGES) {
      const seen = clocks();
      renderWithProviders(<Fire size={FIRE_SMALL} level={lvl(stage)} />);
      await settle();
      const fire = screen.getByTestId(stage === 'cold' ? 'fire-unlit-small' : 'fire-lit-small');
      expect(fire.style.width, stage).toBe(`${(FIRE_SMALL * FIRE_SMALL_VIEW.w) / FIRE_SMALL_VIEW.h}px`);
      expect(tongues(fire), stage).toEqual(['outer', 'core', 'heart']);
      expect(flames(fire), stage).toEqual([]);
      expect(fire.querySelectorAll('ellipse'), stage).toHaveLength(0);
      expect(seen.started, stage).toBe(stage === 'cold' ? 0 : 1);
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it('takes up only its stage frame when framed, drawn as big as the whole would be, each part where it lies in it', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    for (const stage of FIRE_STAGES) {
      const frame = fireFrame(stage);
      renderWithProviders(<Fire size={FIRE_VIEW.h} level={lvl(stage)} framed />);
      await settle();
      const fire = screen.getByTestId(stage === 'cold' ? 'fire-unlit' : 'fire-lit');
      expect(parseFloat(fire.style.width), stage).toBeCloseTo(frame.w, 6);
      expect(parseFloat(fire.style.height), stage).toBeCloseTo(frame.h, 6);
      cleanup();
    }
    // each part laid out from the frame's corner, not the whole box's: the logs low in a spark's frame, not far below it
    renderWithProviders(<Fire size={FIRE_VIEW.h} level={lvl('spark')} framed />);
    await settle();
    const tops = [...screen.getByTestId('fire-lit').children].map((layer) => parseFloat((layer as HTMLElement).style.top)).filter((top) => !Number.isNaN(top));
    expect(Math.max(...tops)).toBeLessThan(fireFrame('spark').h);
    cleanup();
    // beside a number it is the light version's own box, framed or not
    renderWithProviders(<Fire size={FIRE_SMALL} level={lvl('spark')} framed />);
    await settle();
    expect(screen.getByTestId('fire-lit-small').style.width).toBe(`${(FIRE_SMALL * FIRE_SMALL_VIEW.w) / FIRE_SMALL_VIEW.h}px`);
  });

  it('stands still under Reduce Motion: the fire at its stage, its flame one frame, but no clock runs and nothing rises', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    // the setting is asked once; a fire after the answer starts from it
    renderWithProviders(<Fire size={40} level={lvl('campfire')} />);
    await settle();
    cleanup();
    const seen = clocks();
    const runs = growths();
    renderWithProviders(<Fire size={168} level={lvl('kindling')} from={lvl('spark')} />);
    await settle();
    const fire = screen.getByTestId('fire-lit');
    expect(flames(fire)).toEqual(['kindling']);
    expect(stepping(fire, 'kindling')).toBe(false);
    expect(fire.querySelectorAll('circle')).toHaveLength(0);
    expect(seen.started).toBe(0);
    expect(runs).toHaveLength(0);
  });

  it('stands still when asked to, as for a stage not reached yet: no clock, one frame, no sparks, no growing', async () => {
    patchReactNativeWeb({ reduceMotion: false });
    const seen = clocks();
    const runs = growths();
    renderWithProviders(<Fire size={104} level={lvl('blaze')} from={lvl('bonfire')} still />);
    await settle();
    const fire = screen.getByTestId('fire-lit');
    expect(flames(fire)).toEqual(['blaze']);
    expect(stepping(fire, 'blaze')).toBe(false);
    expect([seen.started, runs.length]).toEqual([0, 0]);
  });

  it('grows from the old fire into the new one off one more native value after a moment, the old flame fading into the new, then lets the old one go', async () => {
    patchReactNativeWeb({ reduceMotion: false });
    const seen = clocks();
    const runs = growths();
    renderWithProviders(<Fire size={190} level={lvl('kindling')} from={lvl('spark', 0.9)} />);
    await settle();
    const fire = screen.getByTestId('fire-lit');
    // the old flame under the new one, both playing off the one clock
    expect(flames(fire)).toEqual(['spark', 'kindling']);
    expect([stepping(fire, 'spark'), stepping(fire, 'kindling')]).toEqual([true, true]);
    expect(seen.started).toBe(1);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.config).toMatchObject({ toValue: 1, delay: FIRE_GROW.delayMs, duration: FIRE_GROW.ms, useNativeDriver: true });
    await act(async () => runs[0]!.finish());
    expect(flames(fire)).toEqual(['kindling']);
  });

  it('lights cold logs on the first day: the cold hearth is drawn over the new one, to fade as the logs catch', async () => {
    patchReactNativeWeb({ reduceMotion: false });
    growths();
    renderWithProviders(<Fire size={190} level={lvl('spark')} from={lvl('cold')} />);
    await settle();
    const fire = screen.getByTestId('fire-lit');
    expect(fire.querySelectorAll('path[fill*="char)"]').length).toBeGreaterThan(0);
    expect(fire.querySelectorAll('circle[fill$="bcinder)"]')).toHaveLength(1);
    expect(flames(fire)).toEqual(['spark']);
  });
});
