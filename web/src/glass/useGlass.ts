import { useCallback, useRef } from 'react';
import { dropLens, lensSupported, takeLens, type Lens } from '@kurda/shared/src/glass-lens';

const BENDS = lensSupported();

/**
 * Turns an element wearing `.glass` into a lens cut to its size and corners, remade when either changes: its face by
 * day and by night as `--glass-face-light` and `--glass-face-dark` everywhere, and where the browser can bend a
 * backdrop, the filter as `--glass-lens` with `data-lens` set so glass.css uses it.
 */
export function useGlass<T extends HTMLElement>(): (el: T | null) => void {
  const stop = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    stop.current?.();
    stop.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let lens: Lens | null = null;
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
      const was = lens;
      lens = takeLens({ width, height, radius }, dpr, BENDS);
      if (was) dropLens(was);
      if (lens.light) el.style.setProperty('--glass-face-light', `url(${lens.light})`);
      if (lens.dark) el.style.setProperty('--glass-face-dark', `url(${lens.dark})`);
      if (lens.filter) {
        el.style.setProperty('--glass-lens', `url(#${lens.filter})`);
        el.dataset.lens = '';
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
      if (lens) dropLens(lens);
      el.style.removeProperty('--glass-lens');
      el.style.removeProperty('--glass-face-light');
      el.style.removeProperty('--glass-face-dark');
      delete el.dataset.lens;
    };
  }, []);
}
