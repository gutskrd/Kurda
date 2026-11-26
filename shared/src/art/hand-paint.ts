/**
 * What the front page's hands are painted with, so the hand holding the phone and the hand holding a game's stamp are one
 * hand: the skin in a face and one shade step, flat, and the red knit sleeve with its ribbed cuff, lit from the upper
 * left. Shapes are traced as points and smoothed into flowing outlines.
 */
import { n, type Drawing, type Pt } from './svg.js';

/** The skin: its face, the one shade step for whatever is turned away or behind, and a faint line for a crease or nail. */
export const SKIN = { face: '#dca784', shade: '#c08663', crease: '#a5694a' } as const;
/** The knit sleeve: a warm madder red, its light and shade a step either way, and the ribbing a step darker. */
export const KNIT = { shade: '#7e3428', face: '#9c4434', light: '#b45a45', rib: '#6f2c22' } as const;

/** Where the light falls from: the upper left. */
const LIGHT: Pt = [-0.6, -0.8];

/** A closed outline through `points`, smoothed into one flowing curve. */
export function smooth(points: readonly Pt[]): string {
  const m = points.length;
  const at = (i: number): Pt => points[((i % m) + m) % m]!;
  let d = `M${n(at(0)[0])} ${n(at(0)[1])}`;
  for (let i = 0; i < m; i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${n(b[0] + (c[0] - a[0]) / 6)} ${n(b[1] + (c[1] - a[1]) / 6)} ${n(c[0] - (e[0] - b[0]) / 6)} ${n(c[1] - (e[1] - b[1]) / 6)} ${n(c[0])} ${n(c[1])}`;
  }
  return `${d}Z`;
}

/** An open curve through `points`, for a crease or a rib. */
export function line(points: readonly Pt[]): string {
  let d = `M${n(points[0]![0])} ${n(points[0]![1])}`;
  for (let i = 1; i < points.length; i++) {
    const [a, b, c, e] = [points[Math.max(0, i - 2)]!, points[i - 1]!, points[i]!, points[Math.min(points.length - 1, i + 1)]!];
    d += `C${n(b[0] + (c[0] - a[0]) / 6)} ${n(b[1] + (c[1] - a[1]) / 6)} ${n(c[0] - (e[0] - b[0]) / 6)} ${n(c[1] - (e[1] - b[1]) / 6)} ${n(c[0])} ${n(c[1])}`;
  }
  return d;
}

/** A shape in one flat colour. */
export const flat = (d: string, fill: string, extra = ''): string => `<path d="${d}" fill="${fill}"${extra}/>`;

/**
 * The knit sleeve and its ribbed cuff, ending just above the wrist and running out of the picture. It is drawn on its
 * own frame, with the middle of the cuff's edge at the origin and the arm leaving along +y; `at` places that point and
 * `turn` swings the arm (degrees, 0 straight down, positive toward the lower left), so each hand wears the same sleeve.
 */
export function knitSleeve(dr: Drawing, at: Pt, turn: number, scale = 1): string {
  // Past the cuff the sleeve widens as the arm comes toward us, so it runs out of any frame by its sides as well as
  // its foot and never shows an end of its own.
  const cuff = smooth([
    [-60, 17],
    [-15, 0],
    [24, -14],
    [46, -21],
    [59, -15],
    [68, 0],
    [90, 24],
    [140, 58],
    [240, 118],
    [420, 300],
    [-30, 360],
    [-44, 160],
    [-68, 39],
  ]);
  const clip = dr.clip(cuff);
  const move = (k: number): string => ` transform="translate(${n(LIGHT[0] * k)} ${n(LIGHT[1] * k)})"`;
  // Matte, as everything here: the shade along the far side, the face, a soft light along the near edge.
  let out =
    `<g clip-path="url(#${clip})">` +
    `<path d="${cuff}" fill="${KNIT.shade}"/><path d="${cuff}" fill="${KNIT.face}"${move(5)}/>` +
    `<path d="M-600 -600H600V600H-600Z${cuff}" fill="${KNIT.light}" fill-rule="evenodd"${move(-2.4)}/>`;
  // The ribs run along the arm from the cuff's edge.
  let ribs = '';
  for (let i = 0; i < 11; i++) {
    const t = (i + 0.5) / 11;
    const top: Pt = [-62 + t * 120, 23 - t * 44 - Math.sin(t * Math.PI) * 3];
    ribs += line([top, [top[0] + 12, top[1] + 22], [top[0] + 22, top[1] + 40]]);
  }
  out += `<path d="${ribs}" fill="none" stroke="${KNIT.rib}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/></g>`;
  // Drawn for an arm leaving down and to the right, 30 degrees off the vertical, so it is turned on from there.
  return `<g transform="translate(${n(at[0])} ${n(at[1])}) rotate(${n(turn + 30)}) scale(${n(scale)})">${out}</g>`;
}
