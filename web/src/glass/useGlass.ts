import { useCallback, useRef } from 'react';
import { dropLens, lensSupported, takeLens } from './lens';

const SUPPORTED = lensSupported();

/**
 * Turns an element wearing `.glass` into a lens: a filter cut to its size and corners, remade when either changes, and
 * named on it as `--glass-lens` with `data-lens` set so glass.css bends its backdrop. Where the browser cannot bend
 * a backdrop it does nothing, and the element keeps the frost and the rim.
 */
export function useGlass<T extends HTMLElement>(): (el: T | null) => void {
  const stop = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    stop.current?.();
    stop.current = null;
    if (!el || !SUPPORTED || typeof ResizeObserver === 'undefined') return;
    let id: string | null = null;
    let shape = '';
    const fit = () => {
      // The layout size, which a press's scale or a sliding entrance does not change.
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, width / 2, height / 2);
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const next = `${width}x${height}r${radius}@${dpr}`;
      if (next === shape || width < 8 || height < 8) return;
      shape = next;
      const was = id;
      id = takeLens({ width, height, radius }, dpr);
      if (was) dropLens(was);
      if (id) {
        el.style.setProperty('--glass-lens', `url(#${id})`);
        el.dataset.lens = '';
      } else {
        el.style.removeProperty('--glass-lens');
        delete el.dataset.lens;
      }
    };
    let frame = 0;
    const watch = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    watch.observe(el);
    fit();
    stop.current = () => {
      watch.disconnect();
      cancelAnimationFrame(frame);
      if (id) dropLens(id);
      el.style.removeProperty('--glass-lens');
      delete el.dataset.lens;
    };
  }, []);
}
