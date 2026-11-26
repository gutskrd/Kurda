/**
 * A hand holding up a game's stamp to show it, for the front page's games moment: the same hand and red knit sleeve as
 * the one holding the phone (hand-paint.ts), rising from the bottom, the stamp pinched at its foot between the thumb in
 * front and the fingers behind. Two layers on one frame: `back` (the sleeve, the palm and the fingers behind the stamp)
 * and `front` (the thumb), so an app can lay the stamp itself (`HAND_STAMP_CARD`) between them and turn it over. The
 * thumb and the fingers are groups marked `data-part`, so an app can shift them a little as the stamp turns.
 */
import { Drawing, n, prefixFor, type Pt } from './svg.js';
import { SKIN, flat, knitSleeve, line, smooth } from './hand-paint.js';

/** The frame in drawing units, which the front page draws one to one in pixels. */
export const HAND_STAMP_VIEW = { w: 240, h: 300 } as const;

/**
 * Where the stamp is held: a box `w` by `h` centred on (`cx`, `cy`), upright. The thumb covers only its foot: the top
 * `clear` units of it, where its picture goes, are never covered.
 */
export const HAND_STAMP_CARD = { cx: 120, cy: 96, w: 128, h: 152, clear: 130 } as const;

/** The palm behind the stamp's foot: the heel of the hand either side of the thumb, narrowing to the wrist under the sleeve. */
const PALM: readonly Pt[] = [
  [112, 170],
  [160, 164],
  [194, 186],
  [196, 226],
  [184, 256],
  [176, 330],
  [104, 330],
  [100, 268],
  [92, 236],
  [94, 204],
];

/**
 * The fingers, curled round behind the stamp: the index finger up its back, its tip peeking past the right edge, and the
 * middle, ring and little fingers folded under it beside the thumb, so only their pads show, stacked, each a touch smaller.
 */
const FINGERS: readonly (readonly Pt[])[] = [
  [[178, 126], [192, 124], [202, 132], [205, 150], [203, 172], [194, 180], [180, 176], [172, 158], [172, 138]],
  [[152, 170], [178, 167], [195, 173], [202, 185], [197, 196], [180, 199], [154, 197]],
  [[154, 200], [178, 199], [192, 205], [196, 216], [190, 225], [175, 227], [155, 225]],
  [[154, 228], [173, 228], [185, 234], [187, 244], [180, 251], [166, 252], [154, 249]],
];

/** The thumb, from under the sleeve up the middle of the hand to the stamp's foot, its tip on the margin below the cover. */
const THUMB: readonly Pt[] = [
  [119, 300],
  [116, 262],
  [114, 226],
  [115, 194],
  [119, 172],
  [126, 160],
  [135, 155],
  [145, 157],
  [151, 166],
  [153, 186],
  [154, 218],
  [157, 262],
  [160, 300],
];

/** A shape moved by (`dx`, `dy`), for the shade step showing past it. */
const moved = (points: readonly Pt[], dx: number, dy: number): Pt[] => points.map(([x, y]) => [x + dx, y + dy] as Pt);

export interface HandStampOptions {
  /** `back`: the sleeve, palm and fingers behind the stamp; `front`: the thumb over its foot. */
  part: 'back' | 'front';
  idPrefix?: string;
}

/** One layer of the hand holding a stamp on its frame (`HAND_STAMP_VIEW`), clear all round. It is decoration. */
export function handStampSvg(opts: HandStampOptions): string {
  const dr = new Drawing(prefixFor(opts.idPrefix, 'hand-stamp', opts.part));
  if (opts.part === 'back') {
    // The palm, and in a shade step its side between the thumb and the folded fingers, and each finger's side above its pad.
    dr.add(flat(smooth(PALM), SKIN.face) + flat(smooth([[150, 166], [168, 166], [166, 250], [150, 256]]), SKIN.shade));
    const sides = FINGERS.slice(1).map((f) => flat(smooth(moved(f, 5, -5)), SKIN.shade)).join('');
    dr.add(`<g data-part="fingers">${sides}${FINGERS.map((f) => flat(smooth(f), SKIN.face)).join('')}</g>`);
    // The sleeve on the wrist, its arm leaving straight down out of the picture.
    dr.add(knitSleeve(dr, [141, 280], -4, 0.66));
  } else if (opts.part === 'front') {
    // The thumb, with the shade of its side toward the palm, the line of its nail at the tip and a crease at the knuckle.
    const crease = (points: readonly Pt[], opacity: number): string =>
      `<path d="${line(points)}" fill="none" stroke="${SKIN.crease}" stroke-width="1.2" stroke-linecap="round" opacity="${n(opacity)}"/>`;
    dr.add(
      `<g data-part="thumb">${flat(smooth(moved(THUMB, -2.5, 1.5)), SKIN.shade)}${flat(smooth(THUMB), SKIN.face)}` +
        crease([[124, 182], [124, 170], [130, 163], [140, 162], [146, 169], [147, 182]], 0.5) +
        crease([[126, 213], [135, 216], [146, 213]], 0.35) +
        `</g>`,
    );
  } else {
    throw new RangeError(`art: no hand-stamp part called ${String(opts.part)}`);
  }
  const { defs, body } = dr.parts();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HAND_STAMP_VIEW.w} ${HAND_STAMP_VIEW.h}" aria-hidden="true">${defs}${body}</svg>`;
}
