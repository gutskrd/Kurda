// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderUi } from '../test/render';
import { Backdrop, startRibbons } from './Backdrop';
import { RIBBONS, SCENE, fitScene, fragmentShader } from './ribbons';

describe('the ribbons', () => {
  it('fit a phone by its width, the whole shape across the middle and black above and below', () => {
    const fit = fitScene(390, 844);
    expect(fit.scale).toBeCloseTo(390 / SCENE.width);
    expect(fit.top).toBeGreaterThan(0);
    expect(fit.top * 2 + SCENE.height * fit.scale).toBeCloseTo(844);
  });

  it('fill a wide window edge to edge, losing only black above and below', () => {
    const fit = fitScene(1280, 860);
    expect(fit.scale * SCENE.width).toBeCloseTo(1280);
    expect(fit.top).toBeLessThan(0);
    // the band the ribbons move in, a little over a third of the scene, stays in the window
    const band = [SCENE.height * 0.3, SCENE.height * 0.7].map((y) => fit.top + y * fit.scale);
    expect(band[0]).toBeGreaterThan(0);
    expect(band[1]).toBeLessThan(860);
  });

  it('are worked out for every ribbon, in words a graphics chip takes', () => {
    const shader = fragmentShader();
    expect(shader.match(/float mid = /g)).toHaveLength(RIBBONS.length);
    // reserved in the shading language, so never a name (a comment may say them)
    const code = shader.replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/\b(half|input|output|filter|sample)\b/);
    // every number written as a float, as the language wants
    expect(code).not.toMatch(/[^\w.]\d+ \*/);
  });

  it('leave the dark behind them where there is nothing to draw them with', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    const stop = startRibbons(canvas);
    expect(() => stop()).not.toThrow();
  });

  it('stay where they are when a phone keyboard opens, and fit again when the phone turns', () => {
    // a graphics chip that takes every call and remembers where it was asked to draw
    const viewport = vi.fn();
    const gl = new Proxy({} as Record<string | symbol, unknown>, {
      get: (_, key) => {
        if (key === 'viewport') return viewport;
        if (typeof key === 'string' && /^[A-Z_]+$/.test(key)) return 1;
        return () => ({});
      },
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    const box = document.createElement('div');
    let screen = { width: 390, height: 844 };
    Object.defineProperty(box, 'clientWidth', { get: () => screen.width });
    Object.defineProperty(box, 'clientHeight', { get: () => screen.height });
    const canvas = box.appendChild(document.createElement('canvas'));
    vi.spyOn(canvas, 'getContext').mockReturnValue(gl as unknown as WebGLRenderingContext);
    const stop = startRibbons(canvas);
    expect(viewport).toHaveBeenCalledTimes(1);

    // the keyboard takes half the window; the box, the screen at its largest, stays as it was
    vi.stubGlobal('innerHeight', 420);
    window.dispatchEvent(new Event('resize'));
    expect(viewport).toHaveBeenCalledTimes(1);

    screen = { width: 844, height: 390 };
    window.dispatchEvent(new Event('resize'));
    expect(viewport).toHaveBeenCalledTimes(2);
    stop();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('are hidden from assistive technology', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { container } = renderUi(<Backdrop />, { kit: false });
    const backdrop = container.querySelector('.ribbons');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop?.querySelector('canvas')).not.toBeNull();
  });
});
