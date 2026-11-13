/**
 * The horizon over a profile: what stands behind somebody's face until they
 * wear a background of their own. A sky, the sun or the moon in it, and the
 * mountains ridge behind ridge, in the colours the tree's scene is painted in
 * (`tree-scene.ts`), so the two read as one country.
 *
 * It is drawn from the person: their id chooses the hour of the sky, where the
 * sun stands and how the ridges run, and always chooses the same. Nobody's
 * profile opens on an empty grey band, and no two people share a horizon.
 *
 * The picture is square like every other drawing here, and it is composed
 * about its middle line: a banner is wide and short, so an app lays the square
 * across the banner's width and shows the band through its middle. Whatever
 * the banner's shape, the sun and the first ridge are inside it.
 */
import { Drawing, checkSize, linearAt, n, prefixFor, radialAt, seeded, type Pt } from './svg.js';
import { SKIES, TREE_SKIES, type TreeSky } from './tree-scene.js';

export interface HorizonOptions {
  /** who it is drawn for: an account's id, or any text that is theirs alone */
  seed: string;
  /** the hour of the sky, where the caller wants one in particular; the person's own otherwise */
  sky?: TreeSky;
  /** how big it is shown, in points or CSS pixels (it is square) */
  size?: number;
  /** what a screen reader is told it is; empty where it is only behind a face that is named */
  title?: string;
  idPrefix?: string;
}

/** The sky a person's horizon is under: theirs, and the same every time. */
export function horizonSky(seed: string): TreeSky {
  return TREE_SKIES[Math.floor(seeded(`horizon-sky:${seed}`)() * TREE_SKIES.length)] ?? 'day';
}

/** A ridge across the picture: peaks about `base`, as high as `rise`, in straight slopes, down to the picture's foot. */
function ridge(base: number, rise: number, step: number, rand: () => number): string {
  const points: Pt[] = [];
  for (let x = -8; x <= 128 + step; x += step) {
    points.push([x + (rand() - 0.5) * step * 0.34, base - rise * (0.4 + rand() * 0.6)]);
    points.push([x + step * (0.4 + rand() * 0.2), base - rise * rand() * 0.3]);
  }
  let d = `M-8 120L-8 ${n(base)}`;
  for (const [x, y] of points) d += `L${n(x)} ${n(y)}`;
  return `${d}L128 120Z`;
}

/** The horizon over a profile, as an SVG. */
export function horizonSvg(opts: HorizonOptions): string {
  const size = checkSize(opts.size, 360);
  const name = opts.sky ?? horizonSky(opts.seed);
  const sky = SKIES[name];
  const dr = new Drawing(prefixFor(opts.idPrefix, 'horizon', opts.seed, name));
  const rand = seeded(`horizon:${opts.seed}`);
  // the air, deepest at the top of the band and palest where it meets the mountains
  const air = dr.id('a');
  dr.def(linearAt(air, [[0, sky.air[0]], [0.6, sky.air[1]], [1, sky.air[2]]], 0, 26, 0, 76));
  dr.add(`<rect x="0" y="0" width="120" height="120" fill="url(#${air})"/>`);
  if (name === 'night' || name === 'dusk') {
    // the stars: all of them at night, the first few at dusk
    const count = name === 'night' ? 30 : 8;
    let dots = '';
    for (let i = 0; i < count; i++) {
      const [x, y, r] = [rand() * 120, 36 + rand() * (name === 'night' ? 26 : 14), 0.2 + rand() * 0.36];
      dots += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#ffffff" opacity="${i % 3 === 0 ? '0.95' : '0.6'}"/>`;
    }
    dr.add(dots);
  }
  // the sun or the moon, on the side away from the face, in its own light
  const [, , , colour, haloColour] = sky.orb;
  const ox = 62 + rand() * 40;
  // high enough to be the day's sun, low enough to be inside the shortest banner; at dawn and dusk it stands on the ridge
  const oy = name === 'day' || name === 'night' ? 54 + rand() * 2.5 : 58.5 + rand() * 2.5;
  const or = name === 'night' ? 3.8 : 4.6 + rand() * 1.1;
  const halo = dr.id('h');
  dr.def(radialAt(halo, [[0, haloColour, name === 'night' ? 0.5 : 0.7], [0.4, haloColour, name === 'night' ? 0.16 : 0.28], [1, haloColour, 0]], ox, oy, or * 4.6));
  dr.add(`<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(or * 4.6)}" fill="url(#${halo})"/>`);
  if (name === 'night') {
    // a young moon's horn: the round of it on one side, and a shallower round back, which is its own shadow's edge
    dr.add(`<path d="M${n(ox)} ${n(oy - or)}A${n(or)} ${n(or)} 0 1 0 ${n(ox)} ${n(oy + or)}A${n(or * 1.35)} ${n(or * 1.35)} 0 0 1 ${n(ox)} ${n(oy - or)}Z" fill="${colour}" transform="rotate(-24 ${n(ox)} ${n(oy)})"/>`);
  } else {
    dr.add(`<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(or)}" fill="${colour}"/>`);
  }
  // the mountains, ridge behind ridge, paler the further they are
  dr.add(`<path d="${ridge(66, 9, 15, rand)}" fill="${sky.ridges[0]}"/>`);
  dr.add(`<path d="${ridge(70.5, 7.5, 19, rand)}" fill="${sky.ridges[1]}"/>`);
  dr.add(`<path d="${ridge(75.5, 6, 24, rand)}" fill="${sky.ridges[2]}"/>`);
  return dr.svg(size, opts.title ?? '');
}
