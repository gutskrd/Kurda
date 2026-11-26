import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEER_BREATH_LOW, DEER_BREATH_MS, DEER_LOOP_MS, deerCurlPath, deerLoopAt, deerMarkPath } from '@kurda/shared';
import { I18nProvider } from '../i18n/I18nProvider';
import { DeerLoader } from './DeerLoader';
import { Loading } from './states';

/** A moment of the loop when he is wholly the ball. */
const BALL_AT = Array.from({ length: 200 }, (_, i) => i / 200).find((t) => deerLoopAt(t).curl === 1) as number;

/** What `animate` was asked to play, and a clock the test can set. */
interface Played {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: { currentTime: number; cancel: () => void };
}

function playAnimations(): Played[] {
  const played: Played[] = [];
  const animate = vi.fn(function animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    const animation = { currentTime: 0, cancel: vi.fn() };
    played.push({ keyframes, options, animation });
    return animation as unknown as Animation;
  });
  Object.defineProperty(Element.prototype, 'animate', { value: animate, configurable: true, writable: true });
  return played;
}

/** Frames run only when the test steps them. */
function holdFrames(): () => void {
  let pending: FrameRequestCallback | null = null;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    pending = null;
  });
  return () => {
    const cb = pending;
    pending = null;
    cb?.(0);
  };
}

function reduceMotion(on: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: on && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (Element.prototype as { animate?: unknown }).animate;
});

describe('Loading', () => {
  it('is a status with its words for screen readers and the deer for everyone else', () => {
    render(
      <I18nProvider>
        <Loading label="Restoring your session…" />
      </I18nProvider>,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Restoring your session…');
    const mark = status.querySelector('svg.deer-loader');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(mark?.getAttribute('width')).toBe('48');
    expect(mark?.querySelector('path')?.getAttribute('d')).toBe(deerMarkPath());
  });

  it('says “Loading…” when nothing more exact is known', () => {
    render(
      <I18nProvider>
        <Loading />
      </I18nProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('Loading…');
  });
});

describe('DeerLoader', () => {
  it('turns and squashes as one Web Animation, the length of the loop, ending where it starts', () => {
    reduceMotion(false);
    holdFrames();
    const played = playAnimations();
    render(<DeerLoader size={120} />);
    expect(played).toHaveLength(1);
    const [{ keyframes, options }] = played as [Played];
    expect(options).toMatchObject({ duration: DEER_LOOP_MS, iterations: Infinity });
    // It ends a whole turn on from where it starts, so each loop meets the next without turning back.
    expect(String(keyframes[0]?.transform)).toContain('rotate(0deg)');
    expect(String(keyframes[keyframes.length - 1]?.transform)).toBe(String(keyframes[0]?.transform).replace('rotate(0deg)', 'rotate(360deg)'));
    const turns = keyframes.map((k) => Number(/rotate\(([-\d.]+)deg\)/.exec(String(k.transform))?.[1]));
    turns.slice(1).forEach((turn, i) => expect(turn).toBeGreaterThanOrEqual(turns[i] as number));
  });

  it('draws the curl from that animation’s clock, so the shape keeps time with the roll', () => {
    reduceMotion(false);
    const step = holdFrames();
    const played = playAnimations();
    const { container } = render(<DeerLoader size={120} />);
    const path = container.querySelector('path') as SVGPathElement;
    expect(path.getAttribute('d')).toBe(deerMarkPath());
    // As the ball, wherever in the loop that is.
    (played[0] as Played).animation.currentTime = BALL_AT * DEER_LOOP_MS;
    step();
    expect(path.getAttribute('d')).toBe(deerCurlPath(1));
    (played[0] as Played).animation.currentTime = DEER_LOOP_MS;
    step();
    expect(path.getAttribute('d')).toBe(deerMarkPath());
  });

  it('is drawn as the small mark when too small for his eyes and three tines', () => {
    const { container } = render(<DeerLoader size={24} />);
    expect(container.querySelector('path')?.getAttribute('d')).toBe(deerMarkPath({ small: true }));
  });

  it('only breathes under Reduce Motion', () => {
    reduceMotion(true);
    holdFrames();
    const played = playAnimations();
    const { container } = render(<DeerLoader />);
    expect(played).toHaveLength(1);
    const [{ keyframes, options }] = played as [Played];
    expect(options).toMatchObject({ duration: DEER_BREATH_MS, iterations: Infinity });
    expect(keyframes.map((k) => k.opacity)).toEqual([1, DEER_BREATH_LOW, 1]);
    expect(keyframes.some((k) => 'transform' in k)).toBe(false);
    expect(container.querySelector('path')?.getAttribute('d')).toBe(deerMarkPath());
  });
});
