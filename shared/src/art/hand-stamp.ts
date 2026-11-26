/**
 * A hand holding up a game's stamp to show it, for the front page's games moment, posed after the owner's reference: seen
 * from the front and a little below, the thumb in front and upright pressing the stamp's lower strip, the index finger
 * behind it on the right curving up and over, and the other fingers curled behind to the left, the nearest reaching out
 * with a rounded tip. Flat colour in the same skin as the hand holding the phone (hand-paint.ts), the gaps between the
 * digits and the stamp a dark shadow, and thin dark lines only for the thumbnail, a few creases and the thumb's edge.
 *
 * Two layers on one frame: `back` (the palm and the fingers behind the stamp) and `front` (the thumb), so an app can lay
 * the stamp itself (`HAND_STAMP_CARD`) between them and turn it over. The thumb and the fingers are groups marked
 * `data-part`, so an app can shift them a little as the stamp turns.
 */
import { Drawing, n, prefixFor, type Pt } from './svg.js';
import { SKIN, flat, line, smooth } from './hand-paint.js';

/** The frame in drawing units, which the front page draws one to one in pixels; the hand leaves it at its foot. */
export const HAND_STAMP_VIEW = { w: 260, h: 262 } as const;

/**
 * Where the stamp is held: a box `w` by `h` centred on (`cx`, `cy`), turned `turn` degrees. The thumb covers only its
 * foot: the top `clear` units of it, where its picture goes, are never covered.
 */
export const HAND_STAMP_CARD = { cx: 91, cy: 90, w: 128, h: 152, turn: 3, clear: 116 } as const;

/** The shadow in the gaps between the digits and behind the stamp, and the thin lines, a dark aubergine. */
const GAP = '#3d2f36';

/**
 * The hand is modelled in the reference's own pixels, where the card it holds spans 492 to 808 across and ends at 506;
 * this places those on the frame, the card's foot on the stamp's.
 */
const K = 0.438;
const at = ([x, y]: Pt): Pt => [(x - 465) * K + 10, (y - 506) * K + (HAND_STAMP_CARD.cy + HAND_STAMP_CARD.h / 2)];
const shape = (points: readonly Pt[]): string => smooth(points.map(at));
const stroke = (points: readonly Pt[], width = 1.1): string =>
  `<path d="${line(points.map(at))}" fill="none" stroke="${GAP}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** The palm behind everything, under the fingers and out of the frame at its foot, as wide as the hand is there. */
const PALM: readonly Pt[] = [
  [600, 690],
  [700, 630],
  [800, 600],
  [920, 640],
  [1005, 690],
  [1022, 780],
  [1026, 900],
  [600, 900],
  [590, 760],
];

/** The other fingers, curled behind to the left: the nearest reaching out with a rounded tip, the next tucked lower. */
const REACHING: readonly Pt[] = [
  [652, 600],
  [626, 570],
  [601, 537],
  [577, 514],
  [556, 532],
  [521, 551],
  [491, 566],
  [471, 583],
  [467, 601],
  [477, 616],
  [501, 624],
  [536, 622],
  [571, 614],
  [606, 604],
  [650, 610],
];
const TUCKED: readonly Pt[] = [
  [650, 668],
  [604, 671],
  [562, 684],
  [522, 699],
  [484, 715],
  [452, 742],
  [470, 800],
  [650, 800],
];

/** The index finger, behind the stamp on the right: from the palm up and over, its tip out of sight behind the stamp. */
const INDEX: readonly Pt[] = [
  [772, 470],
  [792, 458],
  [836, 480],
  [893, 512],
  [942, 549],
  [982, 592],
  [1006, 638],
  [1016, 700],
  [1022, 780],
  [1026, 900],
  [920, 900],
  [905, 790],
  [890, 728],
  [868, 680],
  [838, 630],
  [806, 594],
  [782, 578],
  [772, 520],
];

/** The gaps in shadow: under the reaching finger, between the thumb and the index finger, and above the tucked one. */
const GAPS: readonly (readonly Pt[])[] = [
  [
    [572, 512],
    [627, 505],
    [632, 575],
    [612, 550],
    [590, 528],
  ],
  [
    [778, 576],
    [806, 590],
    [840, 626],
    [870, 678],
    [890, 730],
    [876, 764],
    [836, 750],
    [814, 704],
    [800, 652],
    [786, 610],
  ],
  [
    [602, 672],
    [630, 666],
    [644, 722],
    [620, 716],
  ],
];

/** The thumb, upright in front, a long even digit with a rounded tip, widening at its foot into the palm. */
const THUMB: readonly Pt[] = [
  [697, 431],
  [719, 433],
  [737, 445],
  [752, 466],
  [762, 495],
  [770, 530],
  [778, 570],
  [786, 610],
  [795, 650],
  [806, 700],
  [814, 760],
  [818, 830],
  [622, 830],
  [628, 760],
  [634, 700],
  [632, 640],
  [629, 580],
  [626, 530],
  [627, 498],
  [635, 470],
  [650, 449],
  [672, 435],
];

/** The shadow beside the thumb's tip, where it presses the stamp and the index finger meets it from behind. */
const TIP_GAP: readonly Pt[] = [
  [746, 462],
  [771, 470],
  [776, 514],
  [762, 502],
  [753, 482],
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
    // Each gap goes down before the finger beside it, so the finger's edge stays clean against the shadow.
    dr.add(flat(shape(PALM), SKIN.face));
    dr.add(
      `<g data-part="fingers">${flat(shape(GAPS[2]!), GAP)}${flat(shape(TUCKED), SKIN.face)}${flat(shape(GAPS[0]!), GAP)}` +
        `${flat(shape(REACHING), SKIN.face)}${flat(shape(GAPS[1]!), GAP)}${flat(shape(INDEX), SKIN.face)}` +
        // The crease at the index finger's middle joint, and the one at its knuckle beside the thumb.
        stroke([[890, 665], [910, 652], [930, 642]]) +
        stroke([[810, 585], [824, 572], [837, 560]]) +
        `</g>`,
    );
  } else if (opts.part === 'front') {
    dr.add(
      `<g data-part="thumb">${flat(shape(TIP_GAP), GAP)}${flat(shape(THUMB), SKIN.face)}` +
        // The thumbnail and its moon, two short creases at the knuckle, and the line of its foot either side.
        stroke([[636, 472], [642, 510], [660, 540], [690, 556], [720, 552], [742, 534], [752, 505], [750, 478], [742, 458]]) +
        stroke([[672, 542], [700, 532], [730, 537]], 0.9) +
        stroke([[700, 667], [728, 662], [757, 660]], 0.9) +
        stroke([[703, 681], [733, 676], [763, 673]], 0.9) +
        stroke([[633, 660], [642, 685], [650, 702]], 0.9) +
        stroke([[790, 600], [800, 660], [812, 720]], 0.9) +
        `</g>`,
    );
  } else {
    throw new RangeError(`art: no hand-stamp part called ${String(opts.part)}`);
  }
  const { defs, body } = dr.parts();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HAND_STAMP_VIEW.w} ${HAND_STAMP_VIEW.h}" aria-hidden="true">${defs}${body}</svg>`;
}
