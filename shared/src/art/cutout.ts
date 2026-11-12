/**
 * The cut-out: the one way the app's small object pictures are built, so that
 * the cards of Letters and words (word-sets.ts) and the pictures of Kurdish
 * Impostor's categories (impostor.ts) read as one family. A form is a flat
 * shape lit from the upper left: its thickness shows as a darker band below
 * it, as the coin stands forward on its edge, and a sliver of light runs along
 * its upper rim. A dab is a round blob of colour with one spot of light.
 */
import type { Drawing } from './svg.js';
import { n, tint } from './svg.js';

/** One form's three tones: its lit rim, its face, and the edge below it. */
export interface Tones {
  light: string;
  base: string;
  shade: string;
}

/** A rounded rectangle as a path, so it can be moved, clipped and cut. */
export function rr(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}` +
    `V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
  );
}

/** A circle as a path (two half arcs), for cutting a hole with even-odd. */
export function ring(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx - r)} ${n(cy)}Z`;
}

export const at = (dx: number, dy: number): string => ` transform="translate(${n(dx)} ${n(dy)})"`;

/**
 * One cut-out form: its thickness as a band of `shade` showing `drop` below
 * it, its face, and a lit rim along its upper left — the face in `light`,
 * then the face again in `base` moved down and right by `rim` and clipped to
 * the shape, so only a sliver of the light stays.
 */
export function form(dr: Drawing, d: string, tones: Tones, drop: number, rim: number, evenodd = false): void {
  const rule = evenodd ? ' fill-rule="evenodd"' : '';
  if (drop > 0) dr.add(`<path d="${d}" fill="${tones.shade}"${rule}${at(0, drop)}/>`);
  dr.add(`<path d="${d}" fill="${tones.light}"${rule}/>`);
  dr.add(`<g clip-path="url(#${dr.clip(d, evenodd)})"><path d="${d}" fill="${tones.base}"${rule}${at(rim, rim)}/></g>`);
}

/** A round dab of colour (a bead, a blob of paint): its edge below, its face, and one spot of light. */
export function dab(dr: Drawing, cx: number, cy: number, rx: number, ry: number, hex: string, drop: number): void {
  dr.add(`<ellipse cx="${n(cx)}" cy="${n(cy + drop)}" rx="${n(rx)}" ry="${n(ry)}" fill="${tint(hex, -0.28)}"/>`);
  dr.add(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${hex}"/>`);
  dr.add(`<ellipse cx="${n(cx - rx * 0.36)}" cy="${n(cy - ry * 0.38)}" rx="${n(rx * 0.3)}" ry="${n(ry * 0.24)}" fill="${tint(hex, 0.5)}"/>`);
}
