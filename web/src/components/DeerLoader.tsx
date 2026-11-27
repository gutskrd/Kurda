import { useEffect, useRef } from 'react';
import {
  DEER_BREATH_LOW,
  DEER_BREATH_MS,
  DEER_LOOP_MS,
  DEER_MARK_FULL_FROM,
  DEER_MARK_VIEW,
  deerFormKey,
  deerFormPath,
  deerLoopAt,
  deerLoopTrack,
  deerMarkPath,
} from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';

/** The turn as keyframes, finely enough that its speed changes smoothly between them; the shape is drawn each frame. */
function turnKeyframes(): Keyframe[] {
  const { at, poses } = deerLoopTrack();
  return poses.map((pose, i) => ({ offset: at[i], transform: `rotate(${pose.turn}deg)` }));
}

const BREATH: Keyframe[] = [{ opacity: 1 }, { opacity: DEER_BREATH_LOW }, { opacity: 1 }];

/**
 * Hevalo's mark as the loader (shared deer-mark.ts): the deer flows into a spinning arc and back, in the ink. The turn
 * is a Web Animation on the compositor, and every frame the shape is drawn exactly for that animation's moment, never
 * in steps, so on a busy page the shape may pause a moment but the turn keeps going. Under Reduce Motion the mark only
 * breathes in opacity. The caller says what is loading; to assistive technology this is only a picture.
 */
export function DeerLoader({ size = 48 }: { size?: number }): React.JSX.Element {
  const svg = useRef<SVGSVGElement>(null);
  const path = useRef<SVGPathElement>(null);
  const small = size < DEER_MARK_FULL_FROM;

  useEffect(() => {
    const mark = svg.current;
    const shape = path.current;
    if (!mark || !shape || typeof mark.animate !== 'function') return;
    if (prefersReducedMotion()) {
      const breath = mark.animate(BREATH, { duration: DEER_BREATH_MS, iterations: Infinity, easing: 'ease-in-out' });
      return () => breath.cancel();
    }
    const roll = mark.animate(turnKeyframes(), { duration: DEER_LOOP_MS, iterations: Infinity });
    let frame = 0;
    let drawn = deerFormKey(deerLoopAt(0));
    const draw = (): void => {
      const pose = deerLoopAt(Number(roll.currentTime ?? 0) / DEER_LOOP_MS);
      const key = deerFormKey(pose);
      if (key !== drawn) {
        drawn = key;
        shape.setAttribute('d', deerFormPath(pose, { small }));
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      roll.cancel();
      shape.setAttribute('d', deerMarkPath({ small }));
    };
  }, [small]);

  return (
    <svg ref={svg} className="deer-loader" viewBox={`0 0 ${DEER_MARK_VIEW} ${DEER_MARK_VIEW}`} width={size} height={size} aria-hidden="true" focusable="false">
      <path ref={path} d={deerMarkPath({ small })} />
    </svg>
  );
}
