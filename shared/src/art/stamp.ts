/**
 * The stamp shape, the app's own motif (letters travel by bird): a game on the Games page is a stamp, and each book
 * chapter ends in one. It is a rectangle bitten by an even row of half-round perforations. `stampOutline` is the shape
 * alone for each app to fill; `stampSvg` is a blank stamp with its glow, made of a dozen faint widening strokes of the
 * outline rather than a blur, since renderers draw blurs differently and PDFs have none. `stampSize` and `stampLook`
 * fix a picture stamp's proportions and colours here, so the two apps cannot drift apart.
 */
import { hueSteps, type HueName, type HueScheme } from '../hues.js';
import { mix, n2 as num } from './svg.js';

/** An opacity to the thousandth: a faint stroke's few hundredths would move by a quarter if rounded to hundredths. */
const share = (v: number): string => String(Math.round(v * 1000) / 1000);

export interface StampShape {
  /** The radius of one perforation. */
  bite?: number;
  /** The approximate perforation spacing, centre to centre; each edge takes a whole number of them, spaced evenly. */
  pitch?: number;
  /** How round the four corner teeth are. */
  corner?: number;
}

/** Perforations for a card-sized stamp: small enough to read as paper, large enough to see. */
export const STAMP_SHAPE = { bite: 4.2, pitch: 13.5, corner: 2.5 } as const;

/**
 * Perforations scaled for a stamp of `width`, about thirteen bites across, where the fixed shape would make a large
 * stamp look finely stitched and a small one coarsely torn.
 */
export function stampShapeFor(width: number): Required<StampShape> {
  return { bite: Math.round(width * 2.35) / 100, pitch: Math.round(width * 7.4) / 100, corner: Math.round(width * 1.3) / 100 };
}

/** How many perforations an edge of `length` takes, and how far apart they then sit. */
export function stampPerforations(length: number, pitch: number): { count: number; step: number } {
  const count = Math.max(2, Math.round(length / pitch));
  return { count, step: length / count };
}

/** A stamp's outline, `width` by `height` from its upper left, as one clockwise path. Bites cut inward, so it never leaves that box. */
export function stampOutline(width: number, height: number, shape: StampShape = {}): string {
  if (!(width > 0) || !(height > 0)) throw new RangeError('art: a stamp needs a width and a height');
  const pitch = shape.pitch ?? STAMP_SHAPE.pitch;
  const across = stampPerforations(width, pitch);
  const down = stampPerforations(height, pitch);
  // A bite takes at most four fifths of its step, so a tooth always remains between two.
  const bite = Math.min(shape.bite ?? STAMP_SHAPE.bite, across.step * 0.4, down.step * 0.4);
  // A corner tooth is half a step less a bite on each side, and is rounded by no more than that.
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

/** The glow's reach by night: a short halo hugging the perforations, since the day's long glow becomes fog on a dark page. */
export const STAMP_NIGHT_REACH = 8;

/** How many strokes make the glow: enough that no step between them shows. */
const GLOW_RINGS = 12;

/**
 * The glow as outline strokes: each one's width and opacity. Half of each stroke lies under the paper, so width w lights
 * w/2 past the edge, and the widest reaches `reach`. Widths grow faster toward the outside, so the light is strongest
 * at the edge (a little over half the colour) and fades smoothly to nothing.
 */
export function stampGlow(reach = STAMP_GLOW_REACH): readonly { width: number; opacity: number }[] {
  return Array.from({ length: GLOW_RINGS }, (_, i) => ({
    width: Math.round(reach * 2 * ((GLOW_RINGS - i) / GLOW_RINGS) ** 1.6 * 10) / 10,
    opacity: 0.065,
  }));
}

/** The glow at its full reach, by day. */
export const STAMP_GLOW: readonly { width: number; opacity: number }[] = stampGlow();

/** The glow share for a stamp among others: the one put forward shines, and a page of them glows quietly. */
export const STAMP_SHELF_GLOW = 0.62;

/** The glow share left by night, where a saturated glow on a dark page glares. */
export const STAMP_NIGHT_GLOW = 0.75;

/** Room under a stamp's picture for a two-line name and its meaning, at the default text size. */
const STAMP_WORDS = { small: 74, large: 92 } as const;

/**
 * A picture stamp's sizes from its width: the margin inside the perforations, the picture's side, and the height,
 * which depends only on the width, not on the name's length. `large` is the stamp put forward, with larger words.
 * `textScale` is the reader's text size; the room for words grows with it and never drops below the default.
 */
export function stampSize(width: number, large = false, textScale = 1): { height: number; pad: number; art: number } {
  const pad = Math.max(14, Math.round(width * 0.105));
  const art = Math.max(0, width - pad * 2);
  return { height: pad + art + Math.round((large ? STAMP_WORDS.large : STAMP_WORDS.small) * Math.max(1, textScale)), pad, art };
}

export interface StampOptions extends StampShape {
  width: number;
  height: number;
  /** The paper: the pale tint of the stamp's colour. */
  paper: string;
  /** The glow colour: the colour itself. */
  glow: string;
  /** Glow strength, 0 for none to 1 for full; the dark theme uses less. */
  strength?: number;
  /** How far the glow reaches past the edge: `STAMP_GLOW_REACH` by day, `STAMP_NIGHT_REACH` by night. */
  reach?: number;
  /** A hairline along the perforations, for pale pages where the paper would vanish; omitted when not given. */
  edge?: string;
  idPrefix?: string;
  title?: string;
}

/** The box a drawn stamp takes: the stamp plus its glow's reach on every side. */
export function stampBox(width: number, height: number, strength = 1, reach = STAMP_GLOW_REACH): { width: number; height: number; inset: number } {
  const inset = strength > 0 ? reach : 0;
  return { width: width + inset * 2, height: height + inset * 2, inset };
}

/** A blank stamp with its glow, as a picture slightly larger than the stamp (`stampBox`), the stamp `inset` from each side. */
export function stampSvg(opts: StampOptions): string {
  const { width, height, paper, glow, edge } = opts;
  const strength = Math.max(0, Math.min(1, opts.strength ?? 1));
  const reach = opts.reach ?? STAMP_GLOW_REACH;
  const box = stampBox(width, height, strength, reach);
  const d = stampOutline(width, height, opts);
  const light =
    strength > 0
      ? stampGlow(reach).map(
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

/**
 * A game stamp's colours in a scheme: paper, name ink, the quieter ink of the meaning, and the glow. By day the paper
 * is the hue's palest step, the name its deep shade, and the glow long and soft (quieter on a shelf,
 * `STAMP_SHELF_GLOW`). By night the paper stays light, two thirds of the way from the hue's tint to its wash, with the
 * same deep ink, and the glow is a short faint halo (`STAMP_NIGHT_REACH`, `STAMP_NIGHT_GLOW`); a dark ground loses the
 * perforations. The name keeps 7:1 contrast on the paper and the meaning 4.5:1 in both schemes (stamp.test.ts).
 */
export interface StampLook {
  paper: string;
  /** The name. */
  ink: string;
  /** The meaning: the name's ink a little quieter (`STAMP_MEANING_INK`), as one solid colour. */
  inkSoft: string;
  glow: string;
  /** How far the glow reaches past the edge. */
  reach: number;
  /** How much of the glow shows, 0 to 1. */
  strength: number;
}

/** The share of the name's ink the meaning is printed in: a step quieter, still clear on the paper. */
export const STAMP_MEANING_INK = 0.8;

/** How far the night paper sits from the day tint toward its wash: a step quieter, never a dark ground. */
const NIGHT_PAPER = 2 / 3;

export function stampLook(scheme: HueScheme, hue: HueName, large = false): StampLook {
  const day = hueSteps('light', hue);
  const among = large ? 1 : STAMP_SHELF_GLOW;
  if (scheme === 'light') {
    return { paper: day.tint, ink: day.deep, inkSoft: mix(day.tint, day.deep, STAMP_MEANING_INK), glow: day.base, reach: STAMP_GLOW_REACH, strength: among };
  }
  const paper = mix(day.tint, day.wash, NIGHT_PAPER);
  return {
    paper,
    ink: day.deep,
    inkSoft: mix(paper, day.deep, STAMP_MEANING_INK),
    glow: hueSteps('dark', hue).base,
    reach: STAMP_NIGHT_REACH,
    strength: among * STAMP_NIGHT_GLOW,
  };
}
