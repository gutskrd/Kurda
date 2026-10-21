import { n, prefixFor } from '../art/svg.js';
import type { CharacterId } from './types.js';

/**
 * The light each character stands in on a stage: the deer in the purple of
 * his app icon, Hamo in the gold of an evening, Xezo in rose.
 */
export const CHARACTER_GLOW: Readonly<Record<CharacterId, { light: string; deep: string }>> = {
  hevalo: { light: '#db7df5', deep: '#9a6cf1' },
  hamo: { light: '#f6c27a', deep: '#de8746' },
  xezo: { light: '#f5a3b5', deep: '#cf5f7b' },
};

export interface StageOptions {
  /** drawn for a dark screen: the same light, a little stronger on the dark */
  dark?: boolean;
  /** for gradient ids, so two stages can share a page */
  idPrefix?: string;
}

/**
 * What a character stands in front of where it has room to stand: its own
 * light, brightest behind its head, the peaks of the Zagros behind it with
 * snow on the highest, and rolling hills in front, level enough to stand on.
 *
 * Drawn to the stage's own size in points, so the ridges keep their shape
 * however wide the stage is; everything is a tint over the surface beneath,
 * so it sits on a light card and a dark one alike. `standAt` is the share of
 * the width the character's feet are at, where the light is centred.
 */
export function stageBackdrop(id: CharacterId, width: number, height: number, standAt = 0.32, options: StageOptions = {}): string {
  const glow = CHARACTER_GLOW[id];
  const p = `${prefixFor(options.idPrefix ?? `stage${id}`)}-`;
  const dark = options.dark === true;
  const w = width;
  const h = height;
  // the far ridge is mountains, peaked, snow on the highest; the near one rolls, and is what the feet stand on
  const peaks = (points: readonly (readonly [number, number])[]): string => {
    let d = `M0,${n(h)}L0,${n(points[0]![1] * h)}`;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1]!;
      const [x1, y1] = points[i]!;
      // a slight bow in each slope, so a mountain is not a triangle
      const cx = ((x0 + x1) / 2) * w;
      const cy = ((y0 + y1) / 2 + (y1 > y0 ? -0.015 : 0.015)) * h;
      d += `Q${n(cx)},${n(cy)} ${n(x1 * w)},${n(y1 * h)}`;
    }
    return `${d}L${n(w)},${n(h)}Z`;
  };
  const hills = (points: readonly (readonly [number, number])[]): string => {
    let d = `M0,${n(h)}L0,${n(points[0]![1] * h)}`;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1]!;
      const [x1, y1] = points[i]!;
      const mx = ((x0 + x1) / 2) * w;
      d += `C${n(mx)},${n(y0 * h)} ${n(mx)},${n(y1 * h)} ${n(x1 * w)},${n(y1 * h)}`;
    }
    return `${d}L${n(w)},${n(h)}Z`;
  };
  const ridgeline: readonly (readonly [number, number])[] = [
    [0, 0.62],
    [0.12, 0.5],
    [0.22, 0.58],
    [0.38, 0.42],
    [0.52, 0.56],
    [0.68, 0.46],
    [0.84, 0.57],
    [1, 0.49],
  ];
  const far = peaks(ridgeline);
  // snow on the two highest peaks: a cap that follows the slopes a little way down
  const snow = [3, 5]
    .map((i) => {
      const [px, py] = ridgeline[i]!;
      const [lx, ly] = ridgeline[i - 1]!;
      const [rx, ry] = ridgeline[i + 1]!;
      const down = 0.3;
      const a = [px + (lx - px) * down, py + (ly - py) * down];
      const b = [px + (rx - px) * down, py + (ry - py) * down];
      const dip = Math.max(a[1]!, b[1]!) + 0.012;
      return (
        `M${n(px * w)},${n(py * h)}L${n(a[0]! * w)},${n(a[1]! * h)}` +
        `L${n((a[0]! + (px - a[0]!) * 0.35) * w)},${n(dip * h)}L${n(px * w)},${n((dip - 0.008) * h)}L${n((b[0]! + (px - b[0]!) * 0.35) * w)},${n(dip * h)}` +
        `L${n(b[0]! * w)},${n(b[1]! * h)}Z`
      );
    })
    .join('');
  const near = hills([
    [0, 0.82],
    [0.3, 0.75],
    [0.62, 0.83],
    [1, 0.76],
  ]);
  const sky = dark ? [0.34, 0.1] : [0.3, 0.05];
  const ridges = dark ? [0.22, 0.38] : [0.16, 0.28];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(h)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none" aria-hidden="true">` +
    '<defs>' +
    `<linearGradient id="${p}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${glow.light}" stop-opacity="${sky[0]}"/><stop offset="1" stop-color="${glow.light}" stop-opacity="${sky[1]}"/></linearGradient>` +
    `<radialGradient id="${p}glow" gradientUnits="userSpaceOnUse" cx="${n(standAt * w)}" cy="${n(h * 0.42)}" r="${n(Math.max(w, h) * 0.5)}"><stop offset="0" stop-color="${glow.light}" stop-opacity="${dark ? 0.42 : 0.36}"/><stop offset="1" stop-color="${glow.light}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="${p}ridge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${glow.deep}"/><stop offset="1" stop-color="${glow.deep}" stop-opacity="0.6"/></linearGradient>` +
    '</defs>' +
    `<rect width="${n(w)}" height="${n(h)}" fill="url(#${p}sky)"/>` +
    `<rect width="${n(w)}" height="${n(h)}" fill="url(#${p}glow)"/>` +
    `<path d="${far}" fill="url(#${p}ridge)" fill-opacity="${ridges[0]}"/>` +
    `<path d="${snow}" fill="#ffffff" fill-opacity="${dark ? 0.32 : 0.7}"/>` +
    `<path d="${near}" fill="url(#${p}ridge)" fill-opacity="${ridges[1]}"/>` +
    '</svg>'
  );
}

/** Where on a stage the ground is, as a share of its height down: the feet stand here, on the near ridge. */
export const STAGE_GROUND = 0.94;
