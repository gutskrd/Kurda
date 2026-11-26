import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { lensAt, planSwitch, retarget, type LensFrame, type SelectorMove } from '@kurda/shared';

/**
 * The phone's selectors moving as the website's do (shared selector-lens.ts): one run of the shared motion sampled
 * into interpolations of a single progress value, so the capsule's pieces and the lens over them move on the native
 * driver. A tap during a move sends it on from where it is; under Reduce Motion the capsule only fades in at its place.
 */

/** Samples per second of a run: a frame of a 60 Hz screen. */
const SAMPLE_MS = 1000 / 60;

/** The run of frames for a move, from now until it rests, and how long it lasts. */
export function sampleMove(move: SelectorMove, now: number): { frames: LensFrame[]; ms: number } {
  const frames: LensFrame[] = [];
  let t = now;
  for (;;) {
    const f = lensAt(move, t);
    frames.push(f);
    if (f.phase === 'rest') break;
    t += SAMPLE_MS;
  }
  return { frames, ms: Math.max(t - now, 1) };
}

/** What the pieces need: positions in points from the left, scales and opacities, for every frame. */
export function piecesFor(frames: LensFrame[], slot: number, height: number, width: number) {
  return frames.map((f) => {
    const centre = (f.at + f.lead + 0.5) * slot;
    const w = slot * (1 + f.stretch) * f.scale;
    const h = height * f.scale;
    const left = Math.max(centre - w / 2, -2);
    const right = Math.min(centre + w / 2, width + 2);
    return {
      left,
      endLeft: right - height,
      spanLeft: left + h / 2,
      spanScale: slot > 0 ? Math.max(right - left - h, 0) / slot : 0,
      lensScale: slot > 0 ? (right - left) / slot : 0,
      scale: f.scale,
      scaleY: f.scale * f.squash,
      tint: f.tint,
      lens: f.lens,
    };
  });
}

export type SelectorPieces = ReturnType<typeof useSelectorLens>;

/**
 * The animated values for a selector of `count` equal places, `slot` points wide and `height` tall, its choice at
 * `place` (counted from the left). Placed without a move until it has been measured and on its first draw.
 */
export function useSelectorLens(place: number, slot: number, height: number, count: number, reduce: boolean) {
  const progress = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const state = useRef<{ move: SelectorMove | null; at: number | null; began: number; ms: number }>({ move: null, at: null, began: 0, ms: 1 });
  const run = useRef<{ frames: LensFrame[]; ms: number }>({ frames: [lensAt(planSwitch(place, place, 0), 0)], ms: 1 });
  const width = slot * count;

  // A new run of frames when the choice moves; its values are read below as interpolations of `progress`.
  const key = useMemo(() => {
    const s = state.current;
    if (slot <= 0) return 0;
    const now = Date.now();
    if (s.at === null || reduce) {
      run.current = { frames: [lensAt(planSwitch(place, place, now), now)], ms: 1 };
      s.move = null;
    } else if (s.at !== place) {
      // From where the move under way is now, at its speed, or afresh from rest.
      const live = s.move && now - s.began < s.ms ? s.move : null;
      s.move = live ? retarget(live, place, now) : planSwitch(s.at, place, now);
      run.current = sampleMove(s.move, now);
      s.began = now;
      s.ms = run.current.ms;
    }
    s.at = place;
    return now;
  }, [place, slot, reduce]);

  useEffect(() => {
    if (slot <= 0) return;
    if (reduce) {
      fade.setValue(0);
      const anim = Animated.timing(fade, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true });
      anim.start();
      return () => anim.stop();
    }
    if (run.current.frames.length < 2) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const anim = Animated.timing(progress, { toValue: 1, duration: run.current.ms, easing: Easing.linear, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
    // Once per run of frames.
  }, [key]);

  return useMemo(() => {
    const pieces = piecesFor(run.current.frames, slot, height, width);
    const steps = pieces.length;
    const input = steps > 1 ? pieces.map((_, i) => i / (steps - 1)) : [0, 1];
    const pick = (f: (p: (typeof pieces)[number]) => number) => {
      const out = steps > 1 ? pieces.map(f) : [f(pieces[0]!), f(pieces[0]!)];
      return progress.interpolate({ inputRange: input, outputRange: out, extrapolate: 'clamp' });
    };
    return {
      left: pick((p) => p.left),
      endLeft: pick((p) => p.endLeft),
      spanLeft: pick((p) => p.spanLeft),
      spanScale: pick((p) => p.spanScale),
      lensScale: pick((p) => p.lensScale),
      scale: pick((p) => p.scale),
      scaleY: pick((p) => p.scaleY),
      tint: Animated.multiply(pick((p) => p.tint), fade),
      lens: pick((p) => p.lens),
    };
    // A new set of interpolations per run.
  }, [key, slot, height, width]);
}
