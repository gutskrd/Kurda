import { useEffect, useRef } from 'react';
import {
  DEER_BREATH_LOW,
  DEER_BREATH_MS,
  DEER_CURL_STEPS,
  DEER_LOOP_MS,
  DEER_MARK_EYES_FROM,
  DEER_MARK_VIEW,
  deerCurlPath,
  deerLoopAt,
  deerLoopTrack,
  deerMarkPath,
} from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';

/** The turn and squash as keyframes for a mark `size` pixels wide; the curl is drawn separately each frame. */
function rollKeyframes(size: number): Keyframe[] {
  const { at, poses } = deerLoopTrack(60);
  return poses.map((pose, i) => ({
    offset: at[i],
    transform: `translateY(${(pose.drop * size) / DEER_MARK_VIEW}px) scale(${pose.scaleX}, ${pose.scaleY}) rotate(${pose.turn}deg)`,
  }));
}

const BREATH: Keyframe[] = [{ opacity: 1 }, { opacity: DEER_BREATH_LOW }, { opacity: 1 }];

/**
 * Hevalo's mark as the loader (shared deer-mark.ts): he curls into a ball, rolls one turn and unfurls, in the ink. The
 * turn and squash are a Web Animation on the compositor and the curl follows that animation's clock, so on a busy page
 * the shape may pause a moment but the roll keeps going. Under Reduce Motion the mark only breathes in opacity. The
 * caller says what is loading; to assistive technology this is only a picture.
 */
export function DeerLoader({ size = 48 }: { size?: number }): React.JSX.Element {
  const svg = useRef<SVGSVGElement>(null);
  const path = useRef<SVGPathElement>(null);
  const eyes = size >= DEER_MARK_EYES_FROM;

  useEffect(() => {
    const mark = svg.current;
    const shape = path.current;
    if (!mark || !shape || typeof mark.animate !== 'function') return;
    if (prefersReducedMotion()) {
      const breath = mark.animate(BREATH, { duration: DEER_BREATH_MS, iterations: Infinity, easing: 'ease-in-out' });
      return () => breath.cancel();
    }
    const roll = mark.animate(rollKeyframes(size), { duration: DEER_LOOP_MS, iterations: Infinity });
    let frame = 0;
    let drawn = 0;
    const draw = (): void => {
      const step = Math.round(deerLoopAt(Number(roll.currentTime ?? 0) / DEER_LOOP_MS).curl * DEER_CURL_STEPS);
      if (step !== drawn) {
        drawn = step;
        shape.setAttribute('d', deerCurlPath(step / DEER_CURL_STEPS, { eyes }));
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      roll.cancel();
      shape.setAttribute('d', deerMarkPath({ eyes }));
    };
  }, [size, eyes]);

  return (
    <svg ref={svg} className="deer-loader" viewBox={`0 0 ${DEER_MARK_VIEW} ${DEER_MARK_VIEW}`} width={size} height={size} aria-hidden="true" focusable="false">
      <path ref={path} d={deerMarkPath({ eyes })} />
    </svg>
  );
}
