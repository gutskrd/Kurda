import { useEffect, type RefObject } from 'react';
import { PEEK_LEAN, leanFor, stepLean, tiltFromOrientation, type LeanState } from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';

/**
 * Hevalo leaning with the phone on the website, as in the phone app (shared peek-lean.ts): the browser's orientation
 * events carry the tilt, the shared spring carries him, and `--peek-lean` on `ref` turns him and his shadows. It never
 * asks for motion access: where a browser would ask first, or has no sensor, he simply stands upright. Off under
 * Reduce Motion; each frame runs only while he is moving.
 */
export function usePeekLean(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof window.DeviceOrientationEvent === 'undefined' || prefersReducedMotion()) return;
    let state: LeanState & { settled?: boolean } = { angle: 0, speed: 0 };
    let target = 0;
    let frame: number | null = null;
    let last = 0;
    const tick = (now: number): void => {
      state = stepLean(state, target, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      el.style.setProperty('--peek-lean', `${state.angle.toFixed(2)}deg`);
      frame = state.settled ? null : requestAnimationFrame(tick);
    };
    const onTurn = (event: DeviceOrientationEvent): void => {
      const tilt = tiltFromOrientation(event.beta, event.gamma, screen.orientation?.angle ?? 0);
      if (tilt == null) return;
      const wanted = leanFor(tilt);
      if (Math.abs(wanted - target) < PEEK_LEAN.wakeDeg) return;
      target = wanted;
      if (frame == null) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    };
    window.addEventListener('deviceorientation', onTurn);
    return () => {
      window.removeEventListener('deviceorientation', onTurn);
      if (frame != null) cancelAnimationFrame(frame);
      el.style.removeProperty('--peek-lean');
    };
  }, [ref, active]);
}
