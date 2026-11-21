import { useLayoutEffect, useRef, useState } from 'react';

/** A canvas to measure words on: off-screen where there is one, a detached element otherwise, none in a test DOM. */
function measuringPen(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1).getContext('2d');
  if (typeof document === 'undefined' || /jsdom/i.test(navigator.userAgent)) return null;
  return document.createElement('canvas').getContext('2d');
}

/**
 * How much of the text size a row of `count` equal places can draw its words at for the longest to fit its place:
 * 1 where it fits, less where it does not. The row is measured as one line of places whatever its layout, so a caller
 * may lay it out otherwise when the words would have to shrink too far. Measured on a canvas, so nothing is laid out
 * twice; without one it is 1. `typeOf` names an element in the row with the words' type at full size.
 */
export function useWordFit<T extends HTMLElement>(
  words: readonly string[],
  { typeOf, weight, inset }: { typeOf: string; weight: number; inset: number },
): [React.RefObject<T | null>, number] {
  const row = useRef<T>(null);
  const [fit, setFit] = useState(1);
  const key = words.join('\n');
  useLayoutEffect(() => {
    const el = row.current;
    const pen = measuringPen();
    if (!el || !pen) return;
    const measure = () => {
      const style = getComputedStyle(el.querySelector(typeOf) ?? el);
      pen.font = `${weight} ${style.fontSize} ${style.fontFamily}`;
      const all = key.split('\n');
      const widest = Math.max(...all.map((w) => pen.measureText(w).width));
      const room = el.clientWidth / Math.max(1, all.length) - inset;
      if (widest > 0 && room > 0) setFit(Math.min(1, room / widest));
    };
    measure();
    void document.fonts?.ready.then(measure);
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    watch?.observe(el);
    return () => watch?.disconnect();
  }, [key, typeOf, weight, inset]);
  return [row, fit];
}
