/**
 * A chapter's banner: its land seen from afar under the sky, in the painted valley style. The far ridge and the near
 * hill and ground are the chapter's own (path-land.ts), with a few poplars, and its landmark stands at the far end
 * when asked for. The sky follows the app: day by light, a starry night by dark. The start side is left open sky for
 * the chapter's name, which the apps set over it in the page's own type.
 */
import type { PathGround, PathLandmark } from '../path-world.js';
import { pathGroundView } from './path-land.js';
import { pathLandmarkSvg } from './path-landmark.js';
import { Drawing, linearAt, mix, n, prefixFor, radialAt, seeded, type Pt } from './svg.js';
import { SKIES } from './tree-scene.js';
import { VALLEY, bush, dusk, fill, foliage, poplar, poplarLeaves, smoothPath } from './valley.js';

export interface ChapterBannerOptions {
  ground: PathGround;
  /** The chapter's landmark, drawn at the far end; leave it out where buttons stand there. */
  landmark?: PathLandmark;
  /** Size in points or CSS pixels. */
  width: number;
  height: number;
  dark?: boolean;
  /** Drawn for a right-to-left page: the open sky is on the right and the far end on the left. */
  rtl?: boolean;
  /** Varies the ridges and trees, so two chapters on the same ground differ. */
  seed?: string;
  idPrefix?: string;
}

/** A ridge of soft peaks about `base`, up to `rise` high, filled down to the foot of the picture. */
function ridge(width: number, height: number, base: number, rise: number, step: number, rand: () => number): string {
  const pts: Pt[] = [[-10, height + 2], [-10, base]];
  for (let x = -10; x <= width + step; x += step) {
    pts.push([x + step * 0.5, base - rise * (0.45 + rand() * 0.55)]);
    pts.push([x + step, base - rise * rand() * 0.25]);
  }
  pts.push([width + 10, height + 2]);
  return smoothPath(pts, true);
}

/** The snow on a ridge's peaks: the part of it above `line`. */
function snowCaps(d: string, line: number, width: number, dark: boolean, dr: Drawing): string {
  const clip = dr.clip(`M-10 -10H${n(width + 10)}V${n(line)}H-10Z`);
  return `<g clip-path="url(#${clip})">${fill(d, dusk(VALLEY.snow, dark))}</g>`;
}

/** The banner as an SVG the given size. Decorative: the apps set the chapter's name beside it as text. */
export function chapterBannerSvg(opts: ChapterBannerOptions): string {
  const { ground, width: W, height: H, dark = false, rtl = false } = opts;
  if (!(W > 0) || !(H > 0) || !Number.isFinite(W) || !Number.isFinite(H)) throw new RangeError(`art: a banner needs a positive size, got ${W}x${H}`);
  const view = pathGroundView(ground, dark);
  const sky = SKIES[dark ? 'night' : 'day'];
  // The land keeps one height at the foot of the banner, however tall the words make it: a taller banner has more sky.
  const S = Math.min(H, 112);
  const top = H - S;
  const dr = new Drawing(prefixFor(opts.idPrefix, 'chapter-banner', ground, opts.landmark, dark, rtl, Math.round(W), Math.round(H), opts.seed));
  const rand = seeded(`chapter-banner|${ground}|${opts.seed ?? ''}`);
  // Where things stand, measured from the far end so a right-to-left page simply mirrors them.
  const far = (x: number): number => (rtl ? x : W - x);

  // The air, deepest at the top and palest at the hills.
  const air = dr.id('a');
  dr.def(linearAt(air, [[0, sky.air[0]], [0.62, sky.air[1]], [1, sky.air[2]]], 0, 0, 0, H * 0.8));
  dr.add(`<rect width="${n(W)}" height="${n(H)}" fill="url(#${air})"/>`);

  // The sun or moon low over the far end, behind its landmark, in a soft glow; the start side stays clear for the name.
  const orb = { x: far(S * 0.62), y: top + S * 0.3, r: S * 0.09 };
  const glow = dr.id('g');
  dr.def(radialAt(glow, [[0, sky.glow[0], sky.glow[1]], [1, sky.glow[0], 0]], orb.x, orb.y, S * 0.55));
  dr.add(`<circle cx="${n(orb.x)}" cy="${n(orb.y)}" r="${n(S * 0.55)}" fill="url(#${glow})"/>`);
  dr.add(`<circle cx="${n(orb.x)}" cy="${n(orb.y)}" r="${n(orb.r)}" fill="${sky.orb[3]}"/>`);
  if (dark) {
    // The moon's dark side, and stars.
    dr.add(`<circle cx="${n(orb.x + orb.r * 0.42)}" cy="${n(orb.y - orb.r * 0.22)}" r="${n(orb.r * 0.86)}" fill="${sky.air[0]}" opacity="0.9"/>`);
    let stars = '';
    for (let i = 0; i < Math.round(W / 9); i++) {
      const [x, y, r] = [rand() * W, rand() * H * 0.55, 0.4 + rand() * 0.7];
      stars += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#ffffff" opacity="${i % 3 === 0 ? '0.9' : '0.55'}"/>`;
    }
    dr.add(stars);
  } else {
    // Two soft clouds low over the hills, clear of the name.
    for (const [cx, cy, s] of [[far(S * 1.2), top + S * 0.56, 0.62], [far(W * 0.52), top + S * 0.7, 0.48]] as const) {
      const w = S * 0.34 * s;
      dr.add(
        fill(
          `M${n(cx - w)} ${n(cy)}a${n(w * 0.42)} ${n(w * 0.3)} 0 0 1 ${n(w * 0.6)}-${n(w * 0.22)}a${n(w * 0.5)} ${n(w * 0.42)} 0 0 1 ${n(w * 0.9)} 0a${n(w * 0.4)} ${n(w * 0.32)} 0 0 1 ${n(w * 0.5)} ${n(w * 0.22)}Z`,
          sky.cloud[0],
        ),
      );
    }
  }

  // The far ridge low along the foot, snow-capped where the land is high, then the near hill and the ground: the upper
  // two thirds stay sky, so the name never sits on a mountain.
  // A fainter range further off, half lost in the air, gives the land its depth.
  dr.add(fill(ridge(W, H, top + S * 0.8, S * 0.16, Math.max(S * 0.8, 70), rand), mix(view.far, sky.air[2], 0.5)));
  const farRidge = ridge(W, H, top + S * 0.86, S * 0.2, Math.max(S * 0.55, 46), rand);
  dr.add(fill(farRidge, view.far));
  if (view.snow) dr.add(snowCaps(farRidge, top + S * 0.72, W, dark, dr));
  const near = smoothPath(
    [
      [-10, H + 2],
      [-10, top + S * 0.9],
      [W * 0.25, top + S * 0.85],
      [W * 0.55, top + S * 0.89],
      [W * 0.82, top + S * 0.84],
      [W + 10, top + S * 0.88],
      [W + 10, H + 2],
    ],
    true,
  );
  dr.add(fill(near, view.near));
  dr.add(fill(`M-10 ${n(top + S * 0.95)}Q${n(W * 0.5)} ${n(top + S * 0.91)} ${n(W + 10)} ${n(top + S * 0.95)}V${n(H + 2)}H-10Z`, view.base));

  // A few poplars and bushes along the near hill, away from the open sky where the name is.
  const leaf = foliage(dark);
  const tall = poplarLeaves(dark);
  const trees = [
    { x: 0.08, k: 'poplar', s: 0.36 },
    { x: 0.14, k: 'bush', s: 0.5 },
    { x: 0.3, k: 'poplar', s: 0.28 },
    { x: 0.4, k: 'bush', s: 0.4 },
  ] as const;
  for (const t of trees) {
    const x = far(S * 1.2 + W * t.x);
    const y = top + S * 0.9 + rand() * S * 0.03;
    dr.add(t.k === 'poplar' ? poplar(x, y, (t.s * S) / 60, tall, view.shade) : bush(x, y, (t.s * S) / 60, leaf, view.shade, rand));
  }

  // The chapter's landmark at the far end, standing on the ground.
  let landmark = '';
  if (opts.landmark) {
    // Low enough that its top stays under the eyebrow line, so only the name has to keep clear of it.
    const size = S * 0.84;
    const x = rtl ? S * 0.04 : W - size - S * 0.04;
    landmark = pathLandmarkSvg({ landmark: opts.landmark, dark, size, ground, idPrefix: `${dr.prefix}lm` }).replace('<svg ', `<svg x="${n(x)}" y="${n(H - size + S * 0.08)}" `);
  }

  const { defs, body } = dr.parts();
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}" height="${n(H)}" viewBox="0 0 ${n(W)} ${n(H)}" aria-hidden="true" focusable="false">` +
    `${defs}${body}${landmark}</svg>`
  );
}
