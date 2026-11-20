import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { PEEK_LEAN, PEEK_TURN, TURN_SPRING, leanFor, stepLean, swingAngle, turnForMotion, type LeanState } from '@kurda/shared';
import { onDeviceMotion } from './deviceMotion';

/**
 * How Hevalo moves with the phone (shared peek-lean.ts): `lean`, in degrees, as it tilts, and `turn`, a share of a full
 * turn of his head, as it tilts and as it swings round. Each rides its own spring; the motion is read only while
 * `active`, and he stands upright facing us otherwise. Frames run only while he is moving: a phone held still leaves
 * nothing running but the sensor.
 */
export function usePeekMotion(active: boolean): { lean: Animated.Value; turn: Animated.Value } {
  const values = useRef({ lean: new Animated.Value(0), turn: new Animated.Value(0) }).current;
  const state = useRef({ lean: { angle: 0, speed: 0 } as LeanState, turn: { angle: 0, speed: 0 } as LeanState });

  useEffect(() => {
    if (!active) {
      state.current = { lean: { angle: 0, speed: 0 }, turn: { angle: 0, speed: 0 } };
      values.lean.setValue(0);
      values.turn.setValue(0);
      return;
    }
    const target = { lean: 0, turn: 0 };
    // How far the phone has swung round from the way it is held, and how far it is tilted, in degrees.
    let swung = 0;
    let tilted = 0;
    let frame: number | null = null;
    let last = 0;
    let heard = 0;
    const tick = (now: number): void => {
      const seconds = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      const lean = stepLean(state.current.lean, target.lean, seconds);
      const turn = stepLean(state.current.turn, target.turn, seconds, TURN_SPRING);
      state.current = { lean, turn };
      values.lean.setValue(lean.angle);
      values.turn.setValue(turn.angle);
      frame = lean.settled && turn.settled ? null : requestAnimationFrame(tick);
    };
    const wake = (): void => {
      if (frame != null) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };
    const stop = onDeviceMotion(({ tilt, swing }) => {
      if (tilt != null) {
        tilted = tilt;
        const wanted = leanFor(tilt);
        if (Math.abs(wanted - target.lean) >= PEEK_LEAN.wakeDeg) {
          target.lean = wanted;
          wake();
        }
      }
      if (swing != null) {
        const now = Date.now();
        swung = swingAngle(swung, swing, heard ? (now - heard) / 1000 : PEEK_LEAN.sampleMs / 1000);
        heard = now;
      }
      const wanted = turnForMotion(swung, tilted);
      if (Math.abs(wanted - target.turn) >= PEEK_TURN.wakeShare || (wanted === 0 && target.turn !== 0)) {
        target.turn = wanted;
        wake();
      }
    });
    return () => {
      stop();
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [active, values]);

  return values;
}
