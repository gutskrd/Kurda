/**
 * Hevalo's stamp: the outline of a postage stamp, and a whole stamp drawn
 * from it.
 *
 * Letters in Hevalo travel by bird, so a stamp is the app's own shape: a game
 * is a stamp on the Games page, and a chapter of the book ends in one. It is
 * a rectangle whose four edges are bitten by an even row of half-round
 * perforations, with a short flat tooth between each pair and at the corners.
 *
 * `stampOutline` is the shape alone, as one closed path, so each app fills it
 * from its own palette. `stampSvg` is a blank stamp ready to lay things on:
 * the paper, and the light it gives off in its own colour — a dozen faint
 * strokes of the same outline, each a little wider than the last, which add
 * up to a soft glow hugging the perforations, brightest at the paper's edge.
 * Strokes rather than a blur: a blur is not drawn the same by every renderer,
 * and a PDF has none.
 *
 * `stampSize` is the stamp that carries a picture over a name, as a game's
 * stamp does: its proportions are worked out here once, so the phone app and
 * the website cannot come to draw two different stamps.
 */
import { n2 as num } from './svg.js';

/** A share of a colour, to the thousandth: a faint stroke's share is a few hundredths, and rounding it to hundredths moves it by a quarter. */
const share = (v: number): string => String(Math.round(v * 1000) / 1000);

export interface StampShape {
  /** the radius of one perforation */
  bite?: number;
  /** about how far apart the perforations sit, centre to centre; each edge takes a whole number of them, spaced evenly */
  pitch?: number;
  /** how round the four corner teeth are */
  corner?: number;
}

/** The perforations of a stamp about the size of a card: small enough to read as paper, large enough to be seen. */
export const STAMP_SHAPE = { bite: 4.2, pitch: 13.5, corner: 2.5 } as const;

/**
 * The perforations for a stamp of `width`: the same stamp at any size, about
 * thirteen bites across, where the fixed shape above would make a large stamp
 * look finely stitched and a small one coarsely torn.
 */
export function stampShapeFor(width: number): Required<StampShape> {
  return { bite: Math.round(width * 2.35) / 100, pitch: Math.round(width * 7.4) / 100, corner: Math.round(width * 1.3) / 100 };
}

/** How many perforations an edge of `length` takes, and how far apart they then sit. */
export function stampPerforations(length: number, pitch: number): { count: number; step: number } {
  const count = Math.max(2, Math.round(length / pitch));
  return { count, step: length / count };
}

/**
 * A stamp's outline, `width` by `height` from its upper left, as one closed
 * path running clockwise. The bites are cut inward, so the outline never
 * leaves that box.
 */
export function stampOutline(width: number, height: number, shape: StampShape = {}): string {
  if (!(width > 0) || !(height > 0)) throw new RangeError('art: a stamp needs a width and a height');
  const pitch = shape.pitch ?? STAMP_SHAPE.pitch;
  const across = stampPerforations(width, pitch);
  const down = stampPerforations(height, pitch);
  // a bite never takes more than four fifths of its step, so a tooth is always left between two
  const bite = Math.min(shape.bite ?? STAMP_SHAPE.bite, across.step * 0.4, down.step * 0.4);
  // a corner tooth is half a step less a bite on each side, and is rounded by no more than that
  const corner = Math.max(0, Math.min(shape.corner ?? STAMP_SHAPE.corner, across.step / 2 - bite, down.step / 2 - bite));
  const w = num(width);
  const h = num(height);
  const b = num(bite);
  const c = num(corner);
  const arc = `A${b} ${b} 0 0 0 `;
  const turn = corner > 0 ? `A${c} ${c} 0 0 1 ` : 'L';
  const xs = Array.from({ length: across.count }, (_, i) => across.step * (i + 0.5));
  const ys = Array.from({ length: down.count }, (_, i) => down.step * (i + 0.5));
  const parts: string[] = [`M${c} 0`];
  for (const x of xs) parts.push(`H${num(x - bite)}`, `${arc}${num(x + bite)} 0`);
  parts.push(`H${num(width - corner)}`, `${turn}${w} ${c}`);
  for (const y of ys) parts.push(`V${num(y - bite)}`, `${arc}${w} ${num(y + bite)}`);
  parts.push(`V${num(height - corner)}`, `${turn}${num(width - corner)} ${h}`);
  for (const x of [...xs].reverse()) parts.push(`H${num(x + bite)}`, `${arc}${num(x - bite)} ${h}`);
  parts.push(`H${c}`, `${turn}0 ${num(height - corner)}`);
  for (const y of [...ys].reverse()) parts.push(`V${num(y + bite)}`, `${arc}0 ${num(y - bite)}`);
  parts.push(`V${c}`, `${turn}${c} 0`, 'Z');
  return parts.join('');
}

/** How far the glow reaches beyond the stamp's edge. */
export const STAMP_GLOW_REACH = 16;

/** How many strokes the glow is made of: enough that no step between two of them can be seen. */
const GLOW_RINGS = 12;

/**
 * The glow, as strokes of the outline: how wide each is and how much of it
 * shows. Half of every stroke lies under the paper, so a stroke of width w
 * lights w/2 beyond the edge, and the widest reaches `STAMP_GLOW_REACH`. The
 * widths grow faster toward the outside, so most of the strokes overlap near
 * the edge: the light is strongest there (a little over half the colour) and
 * falls away smoothly to nothing.
 */
export const STAMP_GLOW: readonly { width: number; opacity: number }[] = Array.from({ length: GLOW_RINGS }, (_, i) => ({
  width: Math.round(STAMP_GLOW_REACH * 2 * ((GLOW_RINGS - i) / GLOW_RINGS) ** 1.6 * 10) / 10,
  opacity: 0.065,
}));

/** How much of its light a stamp among others gives off: the one put forward shines, and a page of them glows quietly, or the page is all light and no stamps. */
export const STAMP_SHELF_GLOW = 0.62;

/** How much of the light is left by night, where a saturated glow on a dark page glares. */
export const STAMP_NIGHT_GLOW = 0.75;

/** Room under a stamp's picture for a name of two lines and what it means, at the usual text size. */
const STAMP_WORDS = { small: 74, large: 92 } as const;

/**
 * The sizes of a stamp that carries a square picture over a name, from its
 * width: the margin inside the perforations, the picture's side, and the
 * height, which is the picture and the room for the words and so the same
 * for every stamp of that width, whatever its name's length. `large` is the
 * stamp put forward, with larger words and room for them. `textScale` is the
 * reader's text size where the words follow it: the room for them grows with
 * it and is never less than the usual.
 */
export function stampSize(width: number, large = false, textScale = 1): { height: number; pad: number; art: number } {
  const pad = Math.max(14, Math.round(width * 0.105));
  const art = Math.max(0, width - pad * 2);
  return { height: pad + art + Math.round((large ? STAMP_WORDS.large : STAMP_WORDS.small) * Math.max(1, textScale)), pad, art };
}

export interface StampOptions extends StampShape {
  width: number;
  height: number;
  /** the paper: the pale tint of the stamp's colour */
  paper: string;
  /** the light it gives off: the colour itself */
  glow: string;
  /** how strong the light is, 0 for none to 1 for all of it; the dark theme takes less */
  strength?: number;
  /** a hairline in the colour along the perforations, where the paper would vanish into a pale page; left out when not given */
  edge?: string;
  idPrefix?: string;
  title?: string;
}

/** The box a drawn stamp takes: the stamp, and the reach of its light all round it. */
export function stampBox(width: number, height: number, strength = 1): { width: number; height: number; inset: number } {
  const inset = strength > 0 ? STAMP_GLOW_REACH : 0;
  return { width: width + inset * 2, height: height + inset * 2, inset };
}

/**
 * A blank stamp with its light, as a picture a little larger than the stamp
 * (`stampBox`): the stamp itself sits `inset` in from every side.
 */
export function stampSvg(opts: StampOptions): string {
  const { width, height, paper, glow, edge } = opts;
  const strength = Math.max(0, Math.min(1, opts.strength ?? 1));
  const box = stampBox(width, height, strength);
  const d = stampOutline(width, height, opts);
  const light =
    strength > 0
      ? STAMP_GLOW.map(
          (ring) =>
            `<path d="${d}" fill="none" stroke="${glow}" stroke-width="${ring.width}" stroke-linejoin="round" stroke-opacity="${share(ring.opacity * strength)}"/>`,
        ).join('')
      : '';
  const line = edge ? `<path d="${d}" fill="none" stroke="${edge}" stroke-width="1" stroke-opacity="0.35"/>` : '';
  const label = opts.title ? `role="img" aria-label="${opts.title}"` : 'aria-hidden="true"';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(box.width)}" height="${num(box.height)}" viewBox="0 0 ${num(box.width)} ${num(box.height)}" ${label}>` +
    `<g transform="translate(${box.inset} ${box.inset})">${light}<path d="${d}" fill="${paper}"/>${line}</g></svg>`
  );
}
