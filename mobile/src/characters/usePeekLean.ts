import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { PEEK_LEAN, leanFor, stepLean, type LeanState } from '@kurda/shared';
import { onDeviceTilt } from './deviceTilt';

/**
 * How far Hevalo leans with the phone, in degrees, carried on the shared spring (peek-lean.ts). It reads the tilt only
 * while `active`, and stands him upright otherwise. Each frame runs only while he is moving: a phone held still
 * leaves nothing running but the sensor.
 */
export function usePeekLean(active: boolean): Animated.Value {
  const lean = useRef(new Animated.Value(0)).current;
  const state = useRef<LeanState>({ angle: 0, speed: 0 });

  useEffect(() => {
    if (!active) {
      state.current = { angle: 0, speed: 0 };
      lean.setValue(0);
      return;
    }
    let target = 0;
    let frame: number | null = null;
    let last = 0;
    const tick = (now: number): void => {
      const next = stepLean(state.current, target, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      state.current = next;
      lean.setValue(next.angle);
      frame = next.settled ? null : requestAnimationFrame(tick);
    };
    const stop = onDeviceTilt((tilt) => {
      const wanted = leanFor(tilt);
      if (Math.abs(wanted - target) < PEEK_LEAN.wakeDeg) return;
      target = wanted;
      if (frame == null) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    });
    return () => {
      stop();
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [active, lean]);

  return lean;
}
