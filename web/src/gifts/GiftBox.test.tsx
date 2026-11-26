import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { GIFT_BOX_GLINT_PHASES, GIFT_BOX_IDLE, GIFT_BOX_SHUT, GIFT_BOX_UNWRAPS, type GiftTier } from '@kurda/shared';
import { GiftBox } from './GiftBox';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Records every animation started on an element, as a browser that animates would run it. */
function recordAnimations(): Array<{ el: Element; frames: Keyframe[]; timing: KeyframeAnimationOptions }> {
  const runs: Array<{ el: Element; frames: Keyframe[]; timing: KeyframeAnimationOptions }> = [];
  vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(function (this: HTMLElement, frames, timing) {
    runs.push({ el: this, frames: frames as Keyframe[], timing: timing as KeyframeAnimationOptions });
    return { cancel: vi.fn() } as unknown as Animation;
  });
  return runs;
}

const parts = (root: ParentNode): string[] => [...root.querySelectorAll('[data-part]')].map((el) => el.getAttribute('data-part') ?? '');

describe('the gift box', () => {
  it('stands still as the shut box, its parts named and drawn, hidden from a screen reader', () => {
    HTMLElement.prototype.animate ??= (() => undefined) as never;
    const runs = recordAnimations();
    const { container } = render(<GiftBox tier="rare" size={72} />);
    const box = container.querySelector('.gift-box')!;
    expect(box).toHaveAttribute('aria-hidden', 'true');
    expect(box).toHaveClass('gift-box-rare');
    expect(box).toHaveStyle({ width: '72px', height: '72px' });
    expect(parts(box)).toEqual([...GIFT_BOX_SHUT]);
    for (const part of box.querySelectorAll('[data-part]')) expect(part.querySelector('svg :is(path, ellipse)')).not.toBeNull();
    expect(runs).toHaveLength(0);
  });

  it('hops now and then while it waits, each part on its own track, a glint between, and not all boxes at once', () => {
    HTMLElement.prototype.animate ??= (() => undefined) as never;
    const runs = recordAnimations();
    const { container } = render(
      <>
        <GiftBox tier="grand" size={72} motion="idle" seed="gift-a" />
        <GiftBox tier="grand" size={72} motion="idle" seed="gift-b" />
      </>,
    );
    const [a] = container.querySelectorAll('.gift-box');
    const moving = Object.keys(GIFT_BOX_IDLE.tracks).length + GIFT_BOX_GLINT_PHASES.length;
    expect(runs).toHaveLength(moving * 2);
    for (const run of runs) {
      expect(run.timing).toMatchObject({ duration: GIFT_BOX_IDLE.ms, iterations: Infinity, fill: 'both' });
      // transform and opacity only, so the browser moves it without laying anything out again
      for (const frame of run.frames) for (const key of Object.keys(frame)) expect(['offset', 'transform', 'opacity']).toContain(key);
    }
    const delays = new Set(runs.map((r) => r.timing.delay));
    expect(delays.size).toBe(2);
    // the whole box hops about its foot, scaled to its size: 15 units up at 72 pixels across 120 is 9 pixels
    const hop = runs.find((r) => r.el === a!.querySelector('.gift-box-group'))!;
    expect(hop.frames.some((f) => String(f.transform).includes('translate(0px, -9px)'))).toBe(true);
    expect(parts(a!)).toContain('sparks');
    expect(parts(a!).filter((p) => p === 'glint')).toHaveLength(GIFT_BOX_GLINT_PHASES.length);
  });

  it('unwraps in its tier’s own time, and stands still under Reduce Motion', () => {
    HTMLElement.prototype.animate ??= (() => undefined) as never;
    const runs = recordAnimations();
    for (const tier of ['common', 'grand'] as GiftTier[]) {
      runs.length = 0;
      const { unmount } = render(<GiftBox tier={tier} size={140} motion="unwrap" />);
      expect(runs.length).toBeGreaterThan(10);
      for (const run of runs) expect(run.timing).toMatchObject({ duration: GIFT_BOX_UNWRAPS[tier].ms, iterations: 1, delay: 0 });
      unmount();
    }
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    runs.length = 0;
    render(<GiftBox tier="grand" size={140} motion="unwrap" />);
    expect(runs).toHaveLength(0);
  });
});
