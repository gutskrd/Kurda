import { Animated } from 'react-native';
import { HEAD_RIG, PEEK_TURN, headParts, type CharacterArt, type CharacterBox, type HeadParts, type PartTurn } from '@kurda/shared';

/**
 * The antlers and ears of a head turning aside on the phone, as styles driven by one value: `turn`, a share of a full
 * turn from -1 (to our left) to 1 (to our right). Each follows the shared head (head-turn.ts), riding with the whole head
 * as it turns about his neck, sampled along the turn and joined in straight pieces, which is closer than the eye can
 * tell, so they run on the native driver; the face itself is drawn turned (TurnedHead).
 */

/** Where the turn is sampled; the parts move smoothly between. */
const SAMPLES = [-1, -0.875, -0.75, -0.625, -0.5, -0.375, -0.25, -0.125, 0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

export type Turn = Animated.Value | Animated.AnimatedInterpolation<number>;

export type PartStyles = Record<keyof HeadParts, object>;

/** The styles for each antler and ear of `art`'s head drawn `unit` points to its unit in `frame`, turned by `turn`. */
export function partStyles(turn: Turn, art: CharacterArt, frame: CharacterBox, unit: number): PartStyles {
  const poses = SAMPLES.map((s) => headParts(art, s, PEEK_TURN.yawDeg, HEAD_RIG.pivot));
  const along = (values: number[]) => turn.interpolate({ inputRange: SAMPLES, outputRange: values, extrapolate: 'clamp' });
  const deg = (values: number[]) => turn.interpolate({ inputRange: SAMPLES, outputRange: values.map((v) => `${v.toFixed(3)}deg`), extrapolate: 'clamp' });
  const at = (x: number, y: number): string => `${(((x - frame.x) / frame.w) * 100).toFixed(3)}% ${(((y - frame.y) / frame.h) * 100).toFixed(3)}%`;
  const part = (pick: (pose: HeadParts) => PartTurn) => {
    const root = pick(poses[0]!).root;
    return {
      transformOrigin: at(root.x, root.y),
      transform: [
        { translateX: along(poses.map((p) => pick(p).x * unit)) },
        { translateY: along(poses.map((p) => pick(p).y * unit)) },
        { skewX: deg(poses.map((p) => pick(p).skew)) },
        { scaleX: along(poses.map((p) => pick(p).wide)) },
        { scaleY: along(poses.map((p) => pick(p).tall)) },
      ],
    };
  };
  return {
    antlerLeft: part((p) => p.antlerLeft),
    antlerRight: part((p) => p.antlerRight),
    earLeft: part((p) => p.earLeft),
    earRight: part((p) => p.earRight),
  };
}
