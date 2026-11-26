/**
 * A hand holding up a game's stamp to show it, for the front page's games moment: seen from the front and a little
 * below, the thumb in front and upright pinching the stamp's lower strip, the index finger behind it on the right
 * curving up and over, and the other fingers curled behind to the left, the nearest reaching a little way out. Flat
 * colour in the same skin as the hand holding the phone (hand-paint.ts), with its one shade step, the gaps between the
 * digits and the stamp in the antlers' dark brown, and a few warm brown lines.
 *
 * Two layers on one frame: `back` (the palm and the fingers behind the stamp) and `front` (the thumb), so an app can lay
 * the stamp itself (`HAND_STAMP_CARD`) between them and turn it over. Each digit is a group marked `data-part`, turning
 * about its own knuckle (its `transform-origin`, in the frame's units), so an app can move the hand through a turn: the
 * thumb and its tip (`thumb`, `thumb-tip`), the index finger (`index`), the reaching finger (`reaching`) and the curled
 * ones (`curled`).
 */
import { Drawing, n, prefixFor, type Pt } from './svg.js';
import { SKIN, flat, line, smooth } from './hand-paint.js';

/** The frame in drawing units, which the front page draws one to one in pixels; the hand leaves it at its foot. */
export const HAND_STAMP_VIEW = { w: 260, h: 280 } as const;

/**
 * Where the stamp is held: a box `w` by `h` centred on (`cx`, `cy`), turned `turn` degrees. The thumb covers only its
 * foot: the top `clear` units of it, where its picture goes, are never covered.
 */
export const HAND_STAMP_CARD = { cx: 91, cy: 90, w: 128, h: 152, turn: 3, clear: 116 } as const;

/** The shadow in the gaps between the digits and the stamp: the dark brown of Hevalo's antlers. */
const GAP = '#4f3029';
/** The nail, a step paler than the skin. */
const NAIL = '#ecc3a3';

/** The hand is laid out on a larger grid, the stamp's foot at 506 on it; this places that grid on the frame. */
const K = 0.438;
const at = ([x, y]: Pt): Pt => [(x - 465) * K + 10, (y - 506) * K + (HAND_STAMP_CARD.cy + HAND_STAMP_CARD.h / 2)];
const shape = (points: readonly Pt[]): string => smooth(points.map(at));
const stroke = (points: readonly Pt[], width = 1.1, opacity = 0.75): string =>
  `<path d="${line(points.map(at))}" fill="none" stroke="${SKIN.crease}" stroke-width="${n(width)}" stroke-linecap="round" opacity="${n(opacity)}"/>`;
/** A digit's group, turning about its knuckle. */
const digit = (part: string, knuckle: Pt, inner: string): string => {
  const [x, y] = at(knuckle);
  return `<g data-part="${part}" style="transform-origin:${n(x)}px ${n(y)}px">${inner}</g>`;
};
const moved = (points: readonly Pt[], dx: number, dy: number): Pt[] => points.map(([x, y]) => [x + dx, y + dy] as Pt);

/** The palm behind everything, under the fingers and out of the frame at its foot, as wide as the hand is there. */
const PALM: readonly Pt[] = [
  [600, 690],
  [700, 630],
  [800, 600],
  [920, 640],
  [1005, 690],
  [1020, 780],
  [1024, 900],
  [600, 900],
  [588, 760],
];

/** The finger reaching out to the left under the stamp: short and low, its tip round. */
const REACHING: readonly Pt[] = [
  [652, 655],
  [628, 612],
  [600, 581],
  [572, 570],
  [545, 577],
  [521, 593],
  [505, 613],
  [502, 636],
  [513, 654],
  [538, 664],
  [576, 661],
  [614, 652],
  [652, 662],
];
/** Its shadow, where it lifts off the stamp beside the thumb. */
const REACHING_GAP: readonly Pt[] = [
  [604, 566],
  [637, 558],
  [642, 612],
  [624, 592],
];

/** The other two fingers, curled under it toward the palm, each a rounded knuckle, the lower one smaller and steeper. */
const CURLED: readonly (readonly Pt[])[] = [
  [
    [652, 668],
    [616, 668],
    [588, 678],
    [572, 695],
    [574, 714],
    [592, 726],
    [624, 728],
    [652, 722],
  ],
  [
    [650, 728],
    [622, 730],
    [600, 742],
    [594, 758],
    [606, 772],
    [650, 774],
  ],
];

/** The index finger, behind the stamp on the right: from the palm up and over, its tip out of sight behind the stamp. */
const INDEX: readonly Pt[] = [
  [774, 470],
  [798, 456],
  [842, 474],
  [895, 505],
  [940, 540],
  [978, 581],
  [1000, 626],
  [1008, 682],
  [1012, 760],
  [1014, 840],
  [920, 840],
  [904, 772],
  [888, 724],
  [866, 678],
  [838, 634],
  [806, 600],
  [782, 582],
  [772, 525],
];
/** The shadow between the index finger and the thumb, running down to the palm. */
const INDEX_GAP: readonly Pt[] = [
  [770, 578],
  [806, 590],
  [840, 626],
  [868, 676],
  [886, 726],
  [892, 800],
  [842, 800],
  [814, 724],
  [798, 652],
  [782, 610],
];

/** The thumb's foot, slim and long, widening into the palm, and its tip above the joint, which bends as it pinches. */
const THUMB: readonly Pt[] = [
  [640, 600],
  [762, 600],
  [770, 652],
  [781, 704],
  [792, 760],
  [800, 840],
  [624, 840],
  [630, 760],
  [634, 704],
  [638, 652],
];
const THUMB_TIP: readonly Pt[] = [
  [699, 429],
  [722, 432],
  [741, 447],
  [752, 471],
  [757, 506],
  [760, 548],
  [762, 594],
  [764, 640],
  [638, 640],
  [638, 594],
  [639, 548],
  [642, 504],
  [650, 468],
  [665, 443],
  [681, 432],
];
/** The nail, a soft rounded square near the tip, and the shadow beside the tip where it presses the stamp. */
const NAIL_SHAPE: readonly Pt[] = [
  [672, 452],
  [726, 452],
  [742, 470],
  [744, 512],
  [728, 528],
  [670, 528],
  [654, 512],
  [656, 470],
];
const TIP_GAP: readonly Pt[] = [
  [752, 470],
  [774, 474],
  [777, 522],
  [764, 510],
];

export interface HandStampOptions {
  /** `back`: the palm and the fingers behind the stamp; `front`: the thumb over its foot. */
  part: 'back' | 'front';
  idPrefix?: string;
}

/** One layer of the hand holding a stamp on its frame (`HAND_STAMP_VIEW`), clear all round. It is decoration. */
export function handStampSvg(opts: HandStampOptions): string {
  const dr = new Drawing(prefixFor(opts.idPrefix, 'hand-stamp', opts.part));
  if (opts.part === 'back') {
    // Each shadow goes down before the finger beside it, so the finger's edge stays clean against it; a finger tucked
    // behind another shows its side a shade step down.
    dr.add(flat(shape(PALM), SKIN.face));
    dr.add(
      digit(
        'curled',
        [650, 760],
        CURLED.map((f) => flat(shape(moved(f, 4, -6)), SKIN.shade) + flat(shape(f), SKIN.face)).join(''),
      ),
    );
    dr.add(digit('reaching', [652, 640], flat(shape(REACHING_GAP), GAP) + flat(shape(moved(REACHING, 3, -5)), SKIN.shade) + flat(shape(REACHING), SKIN.face)));
    dr.add(
      digit(
        'index',
        [930, 800],
        flat(shape(INDEX_GAP), GAP) +
          flat(shape(INDEX), SKIN.face) +
          // The one crease at its middle joint.
          stroke([[892, 664], [912, 651], [933, 643]]),
      ),
    );
  } else if (opts.part === 'front') {
    dr.add(
      digit(
        'thumb',
        [712, 800],
        flat(shape(THUMB), SKIN.face) +
          // The line where the thumb's foot meets the palm beside the index finger.
          stroke([[786, 640], [796, 700], [806, 760]], 1, 0.55) +
          digit(
            'thumb-tip',
            [700, 620],
            flat(shape(TIP_GAP), GAP) +
              flat(shape(THUMB_TIP), SKIN.face) +
              flat(shape(NAIL_SHAPE), NAIL) +
              // The one crease where it bends.
              stroke([[668, 600], [700, 594], [734, 598]]),
          ),
      ),
    );
  } else {
    throw new RangeError(`art: no hand-stamp part called ${String(opts.part)}`);
  }
  const { defs, body } = dr.parts();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HAND_STAMP_VIEW.w} ${HAND_STAMP_VIEW.h}" aria-hidden="true">${defs}${body}</svg>`;
}
