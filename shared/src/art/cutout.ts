/**
 * The cut-out style shared by the small object pictures (word sets, Impostor, game covers, emails), so they read as one
 * family: a flat form lit from the upper left, with a darker thickness band below and a sliver of light on its upper
 * rim, and the few pen helpers those pictures share.
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
 * One cut-out form: a `shade` band `drop` below it, the face in `light`, then the face in `base` shifted by `rim` and
 * clipped to the shape, so only a lit sliver shows on the upper left.
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

/** A colour as a form's three tones. */
export const tones = (hex: string): Tones => ({ light: tint(hex, 0.32), base: hex, shade: tint(hex, -0.32) });

/** A filled path. */
export const fill = (dr: Drawing, d: string, hex: string, more = ''): void => {
  dr.add(`<path d="${d}" fill="${hex}"${more}/>`);
};

/** A stroked line with round ends and joins. */
export const line = (dr: Drawing, d: string, hex: string, width: number, more = ''): void => {
  dr.add(`<path d="${d}" fill="none" stroke="${hex}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${more}/>`);
};

/** A flat circle. */
export const dot = (dr: Drawing, cx: number, cy: number, r: number, hex: string): void => {
  dr.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${hex}"/>`);
};

/** A round bead: a dab as wide as it is tall. */
export const bead = (dr: Drawing, cx: number, cy: number, r: number, hex: string, drop = 2.4): void => dab(dr, cx, cy, r, r, hex, drop);

/** Runs `draw` inside a group turned `angle` degrees about a point. */
export function turned(dr: Drawing, angle: number, cx: number, cy: number, draw: () => void): void {
  dr.add(`<g transform="rotate(${n(angle)} ${n(cx)} ${n(cy)})">`);
  draw();
  dr.add('</g>');
}
